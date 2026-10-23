import { confirmTransfer } from "../../../../../../lib/server/spending-routes";
type Context = { params: Promise<{ householdId: string }> };
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId } = await context.params;
  return confirmTransfer(request, householdId);
}
