import { createHousehold } from "../../../lib/server/household-routes";
export function POST(request: Request): Promise<Response> {
  return createHousehold(request);
}
