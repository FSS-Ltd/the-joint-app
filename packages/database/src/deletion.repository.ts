import type { ClerkPrivacyIdentity } from "./privacy-journal-entry.js";
import type { OwnerArchiveContext } from "./archive-transaction.js";
import type { Prisma, PrismaClient } from "./client.js";

export interface DeletionStatus {
  id: string;
  state: "PENDING" | "PROVIDER_PENDING" | "COMPLETED";
  requestedAt: string;
  completedAt: string | null;
}
export interface DeletionLease {
  id: string;
  userId: string;
  leaseToken: string;
}
type StatusRow = Omit<DeletionStatus, "requestedAt" | "completedAt"> & {
  requestedAt: Date;
  completedAt: Date | null;
};

export class DeletionRepository {
  constructor(private readonly database: PrismaClient) {}

  async authorize(context: OwnerArchiveContext): Promise<void> {
    await this.withRuntime(async (tx) => {
      await bindIdentity(tx, context);
      const [scope] = await tx.$queryRaw<
        { valid: boolean }[]
      >`SELECT app.deletion_authorized() AS valid`;
      if (!scope?.valid) throw new Error("Verified deletion unavailable");
    });
  }

  async request(
    context: OwnerArchiveContext,
    id: string,
    statusTokenHash: string,
    statusExpiresAt: Date,
  ): Promise<DeletionStatus> {
    return this.withRuntime(async (tx) => {
      await bindIdentity(tx, context);
      const [row] = await tx.$queryRaw<
        StatusRow[]
      >`SELECT * FROM app.request_deletion(${id}::uuid,${statusTokenHash},${statusExpiresAt}::timestamptz)`;
      if (!row) throw new Error("Verified deletion unavailable");
      return projectStatus(row);
    });
  }

  /** Hold the actor lock across durable intent and revocation to exclude concurrent identity links. */
  async requestJournaled(
    context: OwnerArchiveContext,
    id: string,
    statusTokenHash: string,
    statusExpiresAt: Date,
    persist: (identities: readonly ClerkPrivacyIdentity[]) => Promise<void>,
  ): Promise<DeletionStatus> {
    return this.withRuntime(async (tx) => {
      await bindIdentity(tx, context);
      const identities = await tx.$queryRaw<
        { issuer: string; subject: string }[]
      >`SELECT * FROM app.deletion_clerk_identities()`;
      await persist(
        identities.map((identity) => ({ provider: "clerk", ...identity })),
      );
      const [row] = await tx.$queryRaw<
        StatusRow[]
      >`SELECT * FROM app.request_deletion(${id}::uuid,${statusTokenHash},${statusExpiresAt}::timestamptz)`;
      if (!row) throw new Error("Verified deletion unavailable");
      return projectStatus(row);
    });
  }

  async claim(id?: string): Promise<DeletionLease | null> {
    return this.withRuntime(async (tx) => {
      const [row] = await tx.$queryRaw<
        DeletionLease[]
      >`SELECT * FROM app.claim_deletion_request(${id ?? null}::uuid)`;
      return row ?? null;
    });
  }

  async purge(id: string, leaseToken: string): Promise<void> {
    await this.withRuntime(async (tx) => {
      await tx.$executeRaw`SELECT app.purge_deletion_request(${id}::uuid,${leaseToken}::uuid)`;
    });
  }

  async finish(
    id: string,
    leaseToken: string,
    providerDeleted: boolean,
  ): Promise<void> {
    await this.withRuntime(async (tx) => {
      await tx.$executeRaw`SELECT app.finish_deletion_request(${id}::uuid,${leaseToken}::uuid,${providerDeleted})`;
    });
  }

  async status(
    id: string,
    statusTokenHash: string,
  ): Promise<DeletionStatus | null> {
    return this.withRuntime(async (tx) => {
      const [row] = await tx.$queryRaw<
        StatusRow[]
      >`SELECT * FROM app.status_deletion_request(${id}::uuid,${statusTokenHash})`;
      return row ? projectStatus(row) : null;
    });
  }
  async statusDeadline(
    id: string,
    statusTokenHash: string,
  ): Promise<Date | null> {
    return this.withRuntime(async (tx) => {
      const [row] = await tx.$queryRaw<{ expiresAt: Date | null }[]>`
        SELECT app.deletion_receipt_deadline(${id}::uuid, ${statusTokenHash}) AS "expiresAt"
      `;
      return row?.expiresAt ?? null;
    });
  }

  private async withRuntime<T>(
    apply: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.database.$transaction(
      async (tx) => {
        const [role] = await tx.$queryRaw<{ safe: boolean }[]>`SELECT
        current_user = 'joint_app_runtime' AND NOT r.rolsuper AND NOT r.rolbypassrls
        AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='app' AND pg_has_role(current_user,c.relowner,'MEMBER'))
        AS safe FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`;
        if (!role?.safe)
          throw new Error(
            "Deletion requires the restricted runtime database role",
          );
        await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        return apply(tx);
      },
      { timeout: 5000 },
    );
  }
}

function projectStatus(row: StatusRow): DeletionStatus {
  return {
    id: row.id,
    state: row.state,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function bindIdentity(
  tx: Prisma.TransactionClient,
  context: OwnerArchiveContext,
): Promise<void> {
  await tx.$queryRaw`SELECT
    set_config('joint.archive','',true),
    set_config('joint.household_id','',true),
    set_config('joint.membership_id','',true),
    set_config('joint.grant_version','',true),
    set_config('joint.job_id','',true),
    set_config('joint.job_lease_token','',true),
    set_config('joint.user_id',${context.userId},true),
    set_config('joint.session_id',${context.sessionId},true),
    set_config('joint.aal',${context.aal},true),
    set_config('joint.mfa_authenticated_at',${context.mfaAuthenticatedAt === null ? "" : String(context.mfaAuthenticatedAt)},true)`;
}
