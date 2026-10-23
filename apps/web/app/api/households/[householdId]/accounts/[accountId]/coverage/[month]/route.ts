import { writeCoverage } from "../../../../../../../../lib/server/spending-routes";
type Context = {
  params: Promise<{ householdId: string; accountId: string; month: string }>;
};
export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, accountId, month } = await context.params;
  return writeCoverage(request, householdId, accountId, month);
}
