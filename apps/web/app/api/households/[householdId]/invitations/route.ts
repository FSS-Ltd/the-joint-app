import { inviteToHousehold } from "../../../../../lib/server/household-routes";
export async function POST(
  request: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  return inviteToHousehold(request, householdId);
}
