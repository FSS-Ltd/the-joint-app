import { readStaffRetentionCohorts } from "../../../../lib/server/staff-routes";

export function GET(request: Request): Promise<Response> {
  return readStaffRetentionCohorts(request);
}
