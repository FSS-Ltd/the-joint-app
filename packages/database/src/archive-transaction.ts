import type { Prisma, PrismaClient } from "./client.js";

export interface OwnerArchiveContext {
  userId: string;
  sessionId: string;
  aal: "aal1" | "aal2";
  mfaAuthenticatedAt: number | null;
  requestId: string;
}

export class ArchiveDatabase {
  constructor(private readonly database: PrismaClient) {}

  async withScope<T>(
    context: OwnerArchiveContext,
    apply: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.database.$transaction(
      async (tx) => {
        const [role] = await tx.$queryRaw<{ safe: boolean }[]>`SELECT
        current_user = 'joint_app_runtime' AND NOT r.rolsuper AND NOT r.rolbypassrls
        AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'app' AND pg_has_role(current_user, c.relowner, 'MEMBER'))
        AS safe FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`;
        if (!role?.safe)
          throw new Error(
            "Archive requires the restricted runtime database role",
          );
        await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        await tx.$queryRaw`SELECT
        set_config('joint.archive', 'owner', true),
        set_config('joint.job_id', '', true),
        set_config('joint.job_lease_token', '', true),
        set_config('joint.membership_id', '', true),
        set_config('joint.household_id', '', true),
        set_config('joint.grant_version', '', true),
        set_config('joint.user_id', ${context.userId}, true),
        set_config('joint.session_id', ${context.sessionId}, true),
        set_config('joint.aal', ${context.aal}, true),
        set_config('joint.mfa_authenticated_at', ${context.mfaAuthenticatedAt === null ? "" : String(context.mfaAuthenticatedAt)}, true)`;
        const [scope] = await tx.$queryRaw<
          { valid: boolean }[]
        >`SELECT app.archive_scope_is_valid() AS valid`;
        if (!scope?.valid)
          throw new Error("Archive session is no longer valid");
        return apply(tx);
      },
      { timeout: 5000 },
    );
  }
}
