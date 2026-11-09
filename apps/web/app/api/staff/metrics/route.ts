import { readStaffMetrics } from "../../../../lib/server/staff-routes";

export function GET(request: Request): Promise<Response> {
  return readStaffMetrics(request);
}
