import {
  clerkProviderSessionListSchema,
  clerkRevokedSessionSchema,
  type ClerkServerEnvironment,
} from "@joint/contracts";
import {
  createClerkRequest,
  ClerkProviderUnavailable,
  ClerkProviderNotFound,
} from "./provider-request.js";

export interface ClerkRevoker {
  revoke(
    subject: string,
    session: string,
    scope: "local" | "global",
    signal: AbortSignal,
    createdBefore: number,
  ): Promise<void>;
}
export function createClerkRevoker(
  environment: ClerkServerEnvironment,
): ClerkRevoker {
  const request = createClerkRequest(environment);
  return {
    async revoke(subject, session, scope, signal, createdBefore) {
      const ids: string[] = [];
      if (scope === "local") ids.push(session);
      else {
        for (let offset = 0; offset < 200; offset += 20) {
          const query = new URLSearchParams({
            user_id: subject,
            status: "active",
            limit: "20",
            offset: String(offset),
          });
          const page = clerkProviderSessionListSchema.parse(
            await request(`/sessions?${query}`, "GET", signal),
          );
          if (page.data.some((item) => item.user_id !== subject))
            throw new ClerkProviderUnavailable();
          ids.push(
            ...page.data
              .filter((item) => item.created_at <= createdBefore)
              .map((item) => item.id),
          );
          if (offset + page.data.length >= page.total_count) break;
          if (page.data.length === 0 || offset === 180)
            throw new ClerkProviderUnavailable();
        }
      }
      for (const id of new Set(ids)) {
        const path = `/sessions/${encodeURIComponent(id)}`;
        let result: unknown;
        try {
          result = await request(`${path}/revoke`, "POST", signal);
        } catch (error) {
          if (!(error instanceof ClerkProviderNotFound)) throw error;
          try {
            result = await request(path, "GET", signal);
          } catch (confirmation) {
            if (confirmation instanceof ClerkProviderNotFound) continue;
            throw confirmation;
          }
        }
        const revoked = clerkRevokedSessionSchema.parse(result);
        if (revoked.id !== id || revoked.user_id !== subject)
          throw new ClerkProviderUnavailable();
      }
    },
  };
}
