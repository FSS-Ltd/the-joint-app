import {
  CSRF_COOKIE,
  newCsrfToken,
  readCookie,
  setCookie,
} from "../../../../lib/server/browser-security";
import { json, route } from "../../../../lib/server/responses";

export function GET(request: Request): Promise<Response> {
  return route(async () => {
    const csrfToken = readCookie(request, CSRF_COOKIE) ?? newCsrfToken();
    const response = json({ csrfToken });
    setCookie(response, CSRF_COOKIE, csrfToken, 3600, "Strict");
    return response;
  });
}
