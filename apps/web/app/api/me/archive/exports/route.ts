import { createExport } from "../../../../../lib/server/privacy-routes";
export async function POST(request: Request): Promise<Response> {
  return createExport(request);
}
