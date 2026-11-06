import { useLocalSearchParams, useRouter } from "expo-router";
import { idempotencyKeySchema } from "@joint/contracts";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Screen } from "@/components/screen";
import { TransactionDetailScreen } from "./transaction-detail-screen";

export function parseTransactionRouteId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = idempotencyKeySchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export function TransactionRoute({
  screen: TransactionScreen = TransactionDetailScreen,
}: {
  screen?: (props: { transactionId: string }) => React.JSX.Element;
} = {}): React.JSX.Element {
  const { transactionId } = useLocalSearchParams<{
    transactionId?: string | string[];
  }>();
  const router = useRouter();
  const id = parseTransactionRouteId(transactionId);
  return id ? (
    <TransactionScreen transactionId={id} />
  ) : (
    <Screen>
      <EmptyState
        title="Transaction link is invalid"
        description="Open a transaction from your account activity."
      />
      <NativeActions>
        <NativeAction
          label="Open activity"
          onPress={() => router.replace("/activity")}
        />
      </NativeActions>
    </Screen>
  );
}
