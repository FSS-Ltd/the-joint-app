import { writeSplits } from "../../../../../../../lib/server/spending-routes";
type Context = {
  params: Promise<{ householdId: string; transactionId: string }>;
};
export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, transactionId } = await context.params;
  return writeSplits(request, householdId, transactionId);
}
