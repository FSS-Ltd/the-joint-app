import {
  getTransaction,
  patchTransaction,
} from "../../../../../../lib/server/transaction-routes";
type Context = {
  params: Promise<{ householdId: string; transactionId: string }>;
};
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, transactionId } = await context.params;
  return getTransaction(request, householdId, transactionId);
}
export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, transactionId } = await context.params;
  return patchTransaction(request, householdId, transactionId);
}
