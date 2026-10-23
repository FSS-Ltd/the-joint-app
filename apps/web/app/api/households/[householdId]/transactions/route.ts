import {
  listTransactions,
  createTransaction,
} from "../../../../../lib/server/transaction-routes";
type Context = { params: Promise<{ householdId: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return listTransactions(request, householdId);
}
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return createTransaction(request, householdId);
}
