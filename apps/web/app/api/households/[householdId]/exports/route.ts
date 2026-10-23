import { createExport } from "../../../../../lib/server/privacy-routes";
export async function POST(
  request: Request,
  context: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await context.params;
  return createExport(request, householdId);
}
