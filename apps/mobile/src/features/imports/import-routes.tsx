import { useLocalSearchParams, useRouter } from "expo-router";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Screen } from "@/components/screen";
import { ImportBatchScreen } from "./import-batch-screen";
import { ImportScreen } from "./import-screen";
import { parseAccountRouteId } from "../accounts/route-id";

function InvalidLink(): React.JSX.Element {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        title="Import link is invalid"
        description="Open an import from your account list."
      />
      <NativeActions>
        <NativeAction
          label="Open imports"
          onPress={() => router.replace("/imports")}
        />
      </NativeActions>
    </Screen>
  );
}
export function ImportUploadRoute(): React.JSX.Element {
  const { accountId } = useLocalSearchParams<{
    accountId?: string | string[];
  }>();
  const id = parseAccountRouteId(accountId);
  return id ? <ImportScreen accountId={id} /> : <InvalidLink />;
}
export function ImportBatchRoute({
  screen: BatchScreen = ImportBatchScreen,
}: {
  screen?: React.ComponentType<{ batchId: string }>;
} = {}): React.JSX.Element {
  const { batchId } = useLocalSearchParams<{ batchId?: string | string[] }>();
  const id = parseAccountRouteId(batchId);
  return id ? <BatchScreen batchId={id} /> : <InvalidLink />;
}
