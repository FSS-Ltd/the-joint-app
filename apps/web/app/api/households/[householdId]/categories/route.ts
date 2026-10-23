import { readCategories } from "../../../../../lib/server/spending-routes";
type Context = { params: Promise<{ householdId: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return readCategories(request, householdId);
}
