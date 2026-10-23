import { leaveHousehold } from "../../../../../../lib/server/privacy-lifecycle-routes";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  return leaveHousehold(request, (await context.params).householdId);
}
