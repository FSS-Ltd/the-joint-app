import { useState } from "react";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { BrandMark } from "@/components/brand-mark";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { useNativeFinance } from "../finance/context";
import { financeAuthorityKey } from "../finance/scope";
import { ScopeSelection } from "../accounts/scope-selection";
import { selectedSummaryScope, type SummaryScope } from "./summary-scope";
import { SummaryView } from "./summary-view";

export function HomeScreen(): React.JSX.Element | null {
  const { authority } = useNativeFinance();
  return authority ? (
    <HomeContent key={financeAuthorityKey(authority)} />
  ) : null;
}
export function HomeContent(): React.JSX.Element {
  const router = useRouter();
  const [scope, setScope] = useState<SummaryScope>({ kind: "visible" });
  const [selecting, setSelecting] = useState(false);
  return (
    <Screen scrollable={!selecting}>
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
          <BrandMark compact />
          <AppText variant="heading" tone="inverse" accessibilityRole="header">
            Home
          </AppText>
          <NativeActions>
            <NativeAction
              label="Open accounts"
              onPress={() => router.push("/home/accounts")}
            />
            <NativeAction
              label="Open activity"
              onPress={() => router.push("/activity")}
            />
            <NativeAction
              label="Open goals and projections"
              onPress={() => router.push("/goals")}
            />
            <NativeAction
              label="View budget caps"
              onPress={() => router.push("/budgets")}
            />
            <NativeAction
              label="Review this month"
              onPress={() => router.push("/review")}
            />
            <NativeAction
              label="Import transactions"
              tone="secondary"
              onPress={() => router.push("/imports")}
            />
            <NativeAction
              label="Choose summary accounts"
              tone="secondary"
              onPress={() => setSelecting(true)}
            />
            {scope.kind === "selected" && (
              <NativeAction
                label="Use all visible accounts"
                tone="text"
                onPress={() => setScope({ kind: "visible" })}
              />
            )}
          </NativeActions>
          <SummaryView scope={scope} />
        </>
      )}
    </Screen>
  );
}
