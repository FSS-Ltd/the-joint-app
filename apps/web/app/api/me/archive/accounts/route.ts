import { archiveAccounts } from "../../../../../lib/server/privacy-routes";
export async function GET(request: Request): Promise<Response> {
  return archiveAccounts(request);
}
