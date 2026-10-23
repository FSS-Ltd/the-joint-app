import { uploadCsv } from "../../../../../../lib/server/import-routes";
type Context = { params: Promise<{ householdId: string }> };
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return uploadCsv(request, householdId, "preview");
}
