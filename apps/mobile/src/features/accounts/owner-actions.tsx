import type { AccountResponse } from "@joint/contracts";
import { useRouter } from "expo-router";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
export function OwnerActions({
  account,
}: {
  account: AccountResponse;
}): React.JSX.Element | null {
  const router = useRouter();
  if (account.ownership !== "OWNED") return null;
  return (
    <NativeActions>
      {account.permissions.canEdit && (
        <NativeAction
          label="Edit account details"
          tone="secondary"
          onPress={() => router.push(`/home/accounts/${account.id}/edit`)}
        />
      )}
      {account.permissions.canValue && (
        <NativeAction
          label="Record a valuation"
          tone="secondary"
          onPress={() => router.push(`/home/accounts/${account.id}/valuation`)}
        />
      )}
      {account.permissions.canShare && (
        <NativeAction
          label="Account sharing"
          tone="text"
          onPress={() => router.push(`/home/accounts/${account.id}/sharing`)}
        />
      )}
    </NativeActions>
  );
}
