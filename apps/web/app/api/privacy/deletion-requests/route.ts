import { requestDeletion } from "../../../../lib/server/privacy-lifecycle-routes";
export async function POST(request: Request): Promise<Response> {
  return requestDeletion(request);
}
