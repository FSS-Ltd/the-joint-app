import { deletionStatus } from "../../../../../lib/server/privacy-lifecycle-routes";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return deletionStatus(request, (await context.params).id);
}
