import { authPost } from "../../../../lib/server/auth-routes";
export function POST(request: Request): Promise<Response> {
  return authPost(request, "logout");
}
