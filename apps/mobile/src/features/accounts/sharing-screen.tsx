import {
  grantLevelSchema,
  type AccountResponse,
  type GrantLevel,
} from "@joint/contracts";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { useAccountWrite } from "./use-account-write";
import { WriteBoundary } from "./write-boundary";
import { AccountChoice } from "./account-choice";
import { grantLabels } from "./account-labels";
const empty = (): { level: GrantLevel } => ({ level: "NONE" });
const initial = (account: AccountResponse) => ({
  level: account.sharing?.level ?? "NONE",
});
export function SharingScreen({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const session = useAccountWrite(accountId, "sharing", empty, initial),
    router = useRouter();
  const { account, draft, editable } = session;
  return (
    <WriteBoundary session={session} title="Account sharing">
      {account?.sharing?.membershipId ? (
        <>
          <AppText>
            Current sharing: {grantLabels[account.sharing.level]}
          </AppText>
          <AppText>
            Choose what the other household adult can see. Sharing does not
            change legal ownership. Widening access requires a fresh
            authenticator check.
          </AppText>
          <AccountChoice
            label="Sharing"
            value={draft.value.level}
            options={grantLevelSchema.options}
            labels={grantLabels}
            disabled={!editable}
            onChange={(level) => draft.change({ level })}
          />
          <NativeActions>
            <NativeAction
              label="Save sharing"
              disabled={!editable}
              pending={session.mutation.kind === "pending"}
              onPress={() => {
                if (editable)
                  void session.submit({
                    kind: "sharing",
                    input: { level: draft.value.level },
                  });
              }}
            />
          </NativeActions>
        </>
      ) : (
        <>
          <AppText>
            Invite another adult to your household before sharing this account.
          </AppText>
          <NativeActions>
            <NativeAction
              label="Invite another adult"
              onPress={() => router.push("/more")}
            />
          </NativeActions>
        </>
      )}
    </WriteBoundary>
  );
}
