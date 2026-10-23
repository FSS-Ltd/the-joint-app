import { readEntitlements } from "../../../../../lib/server/privacy-routes";
export async function GET(
  request: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  return readEntitlements(request, householdId);
}
