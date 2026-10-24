import { sessionStatusStream } from "../../../lib/server/status-routes";
export async function GET(request: Request): Promise<Response> {
  return sessionStatusStream(request);
}
