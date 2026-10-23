import {
  getAccount,
  patchAccount,
} from "../../../../../../lib/server/account-routes";
type Context = { params: Promise<{ householdId: string; accountId: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, accountId } = await context.params;
  return getAccount(request, householdId, accountId);
}
export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, accountId } = await context.params;
  return patchAccount(request, householdId, accountId);
}
