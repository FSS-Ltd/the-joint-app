import { deletionStatusStream } from "../../../../../../lib/server/status-routes";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return deletionStatusStream(request, (await context.params).id);
}
