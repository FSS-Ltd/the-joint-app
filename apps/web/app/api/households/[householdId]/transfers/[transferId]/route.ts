import {
  removeTransfer,
  readTransfer,
} from "../../../../../../lib/server/spending-routes";
type Context = { params: Promise<{ householdId: string; transferId: string }> };
export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, transferId } = await context.params;
  return removeTransfer(request, householdId, transferId);
}

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, transferId } = await context.params;
  return readTransfer(request, householdId, transferId);
}
