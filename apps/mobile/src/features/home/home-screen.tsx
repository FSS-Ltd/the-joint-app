import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { BrandMark } from "@/components/brand-mark";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { colors, corners, spacing } from "@/theme/tokens";
import { useNativeFinance } from "../finance/context";
import { financeAuthorityKey } from "../finance/scope";
import { ScopeSelection } from "../accounts/scope-selection";
import { selectedSummaryScope, type SummaryScope } from "./summary-scope";
import { SummaryView } from "./summary-view";
import { HomeInsights } from "./home-insights";
import { HomeActivity } from "./home-activity";

export function HomeScreen(): React.JSX.Element | null {
  return <SummaryScreen />;
}

export function WealthScreen(): React.JSX.Element | null {
  return <SummaryScreen wealth />;
}

function SummaryScreen({
  wealth = false,
}: {
  wealth?: boolean;
}): React.JSX.Element | null {
  const { authority } = useNativeFinance();
  return authority ? (
    <HomeContent key={financeAuthorityKey(authority)} wealth={wealth} />
  ) : null;
}
export function HomeContent({
  wealth = false,
}: { wealth?: boolean } = {}): React.JSX.Element {
  const router = useRouter();
  const [scope, setScope] = useState<SummaryScope>({ kind: "visible" });
  const [selecting, setSelecting] = useState(false);
  return (
    <Screen compact scrollable={!selecting}>
      {selecting ? (
        <ScopeSelection
          initialIds={scope.kind === "selected" ? scope.accountIds : []}
          onCancel={() => setSelecting(false)}
          onApply={(ids) => {
            setScope(selectedSummaryScope(ids));
            setSelecting(false);
          }}
        />
      ) : (
        <>
          <View style={styles.heading}>
            <View style={styles.headerRow}>
              <BrandMark compact />
              {!wealth && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/home/accounts")}
                  style={({ pressed }) => [
                    styles.accountLink,
                    pressed && styles.accountLinkPressed,
                  ]}
                >
                  <AppText variant="label">Accounts</AppText>
                </Pressable>
              )}
            </View>
            <AppText
              variant="heading"
              tone="inverse"
              accessibilityRole="header"
            >
              {wealth ? "Wealth" : "Household overview"}
            </AppText>
          </View>
          <SummaryView
            scope={scope}
            onChoose={() => setSelecting(true)}
            onReset={() => setScope({ kind: "visible" })}
            showCoverage={wealth}
          >
            {wealth ? (
              <NativeActions>
                <NativeAction
                  label="Open accounts"
                  onPress={() => router.push("/home/accounts")}
                />
              </NativeActions>
            ) : (
              <View style={styles.actions}>
                <View style={styles.action}>
                  <NativeActions>
                    <NativeAction
                      label="Import CSV"
                      onPress={() => router.push("/imports")}
                    />
                  </NativeActions>
                </View>
                <View style={styles.action}>
                  <NativeActions>
                    <NativeAction
                      label="Review plan"
                      tone="secondary"
                      onPress={() => router.push("/review")}
                    />
                  </NativeActions>
                </View>
              </View>
            )}
          </SummaryView>
          {!wealth && (
            <>
              <HomeInsights scope={scope} />
              <HomeActivity scope={scope} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.small },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.small,
  },
  accountLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: corners.action,
    backgroundColor: colors.sage,
  },
  accountLinkPressed: { backgroundColor: colors.ivory },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.small },
  action: { flexBasis: 144, flexGrow: 1 },
});
