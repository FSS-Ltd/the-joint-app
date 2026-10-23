import { listImports } from "../../../../../lib/server/import-routes";
type Context = { params: Promise<{ householdId: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return listImports(request, householdId);
}
