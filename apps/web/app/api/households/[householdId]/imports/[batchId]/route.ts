import {
  readImport,
  mutateImport,
} from "../../../../../../lib/server/import-routes";
type Context = { params: Promise<{ householdId: string; batchId: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, batchId } = await context.params;
  return readImport(request, householdId, batchId);
}
export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, batchId } = await context.params;
  return mutateImport(request, householdId, batchId, "rollback");
}
