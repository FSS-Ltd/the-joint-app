import { archiveAccounts } from "../../../../../../lib/server/privacy-routes";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return archiveAccounts(request, id);
}
