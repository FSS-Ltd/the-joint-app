import { downloadExport } from "../../../../../../../lib/server/privacy-routes";
export async function GET(
  request: Request,
  context: { params: Promise<{ householdId: string; id: string }> },
): Promise<Response> {
  const { householdId, id } = await context.params;
  return downloadExport(request, id, householdId);
}
