"use client";

import { SessionBoundary } from "../session/boundary";

import { useClerk, useSession } from "@clerk/nextjs";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AuthRuntimeContext } from "../auth-runtime";
import { announceSessionChange } from "../client";

export function ClerkRuntimeBridge({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const clerk = useClerk();
  const { session, isLoaded } = useSession();
  const previousSession = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    const current = session?.id ?? null;
    const previous = previousSession.current;
    previousSession.current = current;
    // A mount/hydration is not a session transition. Announcing it reloads other tabs recursively.
    if (previous !== undefined && previous !== current) announceSessionChange();
  }, [isLoaded, session?.id]);
  const actions = useMemo(
    () => ({
      finishSignOut: async () => {
        if (!clerk.loaded) throw new Error("Browser sign-out unavailable");
        if (clerk.session) await clerk.signOut({ sessionId: clerk.session.id });
      },
    }),
    [clerk],
  );
  return (
    <AuthRuntimeContext.Provider value={actions}>
      <SessionBoundary disabled={!isLoaded || Boolean(session?.currentTask)}>
        {children}
      </SessionBoundary>
    </AuthRuntimeContext.Provider>
  );
}
