import { valueAccount } from "../../../../../../../lib/server/account-routes";
type Context = { params: Promise<{ householdId: string; accountId: string }> };
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, accountId } = await context.params;
  return valueAccount(request, householdId, accountId);
}
