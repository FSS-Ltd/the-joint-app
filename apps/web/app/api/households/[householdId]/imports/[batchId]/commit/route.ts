import { mutateImport } from "../../../../../../../lib/server/import-routes";
type Context = { params: Promise<{ householdId: string; batchId: string }> };
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, batchId } = await context.params;
  return mutateImport(request, householdId, batchId, "commit");
}
