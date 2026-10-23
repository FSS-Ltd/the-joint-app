import type { AuthContext } from "@joint/contracts";
import type { JobLease } from "./jobs.repository.js";
import type { Prisma, PrismaClient } from "./client.js";

export class ScopedDatabase {
  constructor(private readonly database: PrismaClient) {}

  async withScope<T>(
    context: AuthContext,
    apply: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (
      !Number.isSafeInteger(context.grantVersion) ||
      context.grantVersion < 0 ||
      (context.mfaAuthenticatedAt !== null &&
        !Number.isSafeInteger(context.mfaAuthenticatedAt))
    )
      throw new Error("Invalid authorization scope");
    return this.database.$transaction(async (tx) => {
      await requireRestrictedRole(tx);
      await tx.$queryRaw`SELECT
        set_config('joint.job_id', '', true),
        set_config('joint.job_lease_token', '', true),
        set_config('joint.user_id', ${context.userId}, true),
        set_config('joint.membership_id', ${context.membershipId}, true),
        set_config('joint.household_id', ${context.householdId}, true),
        set_config('joint.session_id', ${context.sessionId}, true),
        set_config('joint.grant_version', ${String(context.grantVersion)}, true),
        set_config('joint.aal', ${context.aal}, true),
        set_config('joint.mfa_authenticated_at', ${context.mfaAuthenticatedAt === null ? "" : String(context.mfaAuthenticatedAt)}, true)`;
      const [scope] = await tx.$queryRaw<
        { valid: boolean }[]
      >`SELECT app.scope_is_valid() AS valid`;
      if (!scope?.valid)
        throw new Error("Authorization scope is no longer valid");
      return apply(tx);
    });
  }
}

export interface ImportJobContext {
  userId: string;
  membershipId: string;
  householdId: string;
  accountId: string;
  batchId: string;
  jobId: string;
}

/** Apply inside JobsRepository.complete: the actual leased row owns authority. */
export async function withImportJobScope<T>(
  transaction: Prisma.TransactionClient,
  lease: Pick<JobLease, "id" | "leaseToken">,
  apply: (
    transaction: Prisma.TransactionClient,
    context: ImportJobContext,
  ) => Promise<T>,
): Promise<T> {
  await requireRestrictedRole(transaction);
  await transaction.$executeRaw`SELECT app.lock_import_job(${lease.id}::uuid, ${lease.leaseToken}::uuid)`;
  const [context] = await transaction.$queryRaw<ImportJobContext[]>`
    SELECT * FROM app.import_job_context(${lease.id}::uuid, ${lease.leaseToken}::uuid)`;
  if (!context) throw new Error("Import lease is no longer valid");
  await transaction.$queryRaw`SELECT
    set_config('joint.user_id', '', true),
    set_config('joint.session_id', '', true),
    set_config('joint.membership_id', '', true),
    set_config('joint.household_id', '', true),
    set_config('joint.job_id', ${context.jobId}, true),
    set_config('joint.job_lease_token', ${lease.leaseToken}, true),
    set_config('joint.job_user_id', ${context.userId}, true),
    set_config('joint.job_membership_id', ${context.membershipId}, true),
    set_config('joint.job_household_id', ${context.householdId}, true)`;
  return apply(transaction, context);
}

async function requireRestrictedRole(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const [role] = await transaction.$queryRaw<{ safe: boolean }[]>`SELECT
    current_user = 'joint_app_runtime' AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname IN ('Account', 'AccountOwner', 'AccountGrant', 'BalanceSnapshot',
        'ImportBatch', 'ImportObject', 'Transaction', 'TransactionRevision', 'TransactionOverride', 'TransactionNote')
        AND pg_has_role(current_user, c.relowner, 'MEMBER')
    ) AS safe FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`;
  if (!role?.safe)
    throw new Error("Finance requires the restricted runtime database role");
}
