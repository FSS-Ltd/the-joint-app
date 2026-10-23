import {
  readBudget,
  writeBudget,
} from "../../../../../../lib/server/spending-routes";
type Context = { params: Promise<{ householdId: string; month: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, month } = await context.params;
  return readBudget(request, householdId, month);
}
export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, month } = await context.params;
  return writeBudget(request, householdId, month);
}
