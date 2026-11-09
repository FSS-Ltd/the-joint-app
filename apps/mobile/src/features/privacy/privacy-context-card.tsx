import type { EntitlementResponse } from "@joint/contracts";
import { View } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";

export function PrivacyContextCard({
  entitlements,
  error: planError,
  onOpenAccounts,
}: {
  entitlements: EntitlementResponse | null;
  error: string;
  onOpenAccounts?: () => void;
}): React.JSX.Element {
  return (
    <View
      accessible={false}
      accessibilityLabel="Privacy context"
      style={{ gap: spacing.medium }}
    >
      <Panel>
        <AppText tone="secondary">Your plan</AppText>
        <AppText variant="title">
          {entitlements
            ? entitlements.plan === "PLUS"
              ? "Plus access"
              : "Free essentials"
            : "Privacy stays available"}
        </AppText>
        <Feedback error={planError} />
        <AppText>
          Export, revoke sharing, leave and delete your account remain available
          on Free. Plan access never changes account ownership or sharing
          permission.
        </AppText>
        <AppText tone="secondary">
          Plus capabilities are entitlements only. Connected banking, advanced
          projections and automation are not available in this build.
        </AppText>
        {onOpenAccounts && (
          <NativeActions>
            <NativeAction
              label="Manage account sharing"
              tone="text"
              onPress={onOpenAccounts}
            />
          </NativeActions>
        )}
      </Panel>
      <Panel>
        <AppText tone="secondary">Connections</AppText>
        <AppText variant="title">No bank connections</AppText>
        <AppText>
          Direct bank and broker connections are not available. Manual accounts
          and CSV imports do not create a bank authorisation.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Disconnect bank · unavailable"
            tone="secondary"
            disabled
            onPress={() => {}}
          />
        </NativeActions>
      </Panel>
    </View>
  );
}
