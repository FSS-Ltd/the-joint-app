import {
  listAccounts,
  createAccount,
} from "../../../../../lib/server/account-routes";
type Context = { params: Promise<{ householdId: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return listAccounts(request, householdId);
}
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return createAccount(request, householdId);
}
