"use client";

import { useClerk, useSession } from "@clerk/nextjs";
import { useEffect, useMemo, type ReactNode } from "react";
import { AuthRuntimeContext } from "../auth-runtime";
import { announceSessionChange } from "../client";

export function ClerkRuntimeBridge({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const clerk = useClerk();
  const { session } = useSession();
  useEffect(() => {
    announceSessionChange();
  }, [session?.id]);
  const actions = useMemo(
    () => ({
      finishSignOut: async () => {
        if (clerk.session) await clerk.signOut({ sessionId: clerk.session.id });
      },
    }),
    [clerk],
  );
  return (
    <AuthRuntimeContext.Provider value={actions}>
      {children}
    </AuthRuntimeContext.Provider>
  );
}
