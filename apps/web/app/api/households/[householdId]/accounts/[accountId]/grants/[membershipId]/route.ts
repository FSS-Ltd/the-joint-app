import { grantAccount } from "../../../../../../../../lib/server/account-routes";
type Context = {
  params: Promise<{
    householdId: string;
    accountId: string;
    membershipId: string;
  }>;
};
export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  const { householdId, accountId, membershipId } = await context.params;
  return grantAccount(request, householdId, accountId, membershipId);
}
