import { useEffect, useRef, useState } from "react";
import { identityError, IdentityApiError } from "./api";
import { clerkFlowError } from "@joint/identity-runtime";
import { useIdentity } from "./context";
export function useIdentityOperation() {
  const identity = useIdentity();
  const abort = useRef(new AbortController()),
    running = useRef(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    abort.current = new AbortController();
    return () => abort.current.abort();
  }, []);
  async function run(
    action: (
      signal: AbortSignal,
      lifetime: { active(): boolean; current(): boolean },
    ) => Promise<void>,
  ): Promise<boolean> {
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setError("");
    setNotice("");
    const signal = abort.current.signal;
    const lease = identity.workflow.capture();
    const lifetime = {
      current: lease.current,
      active: () => !signal.aborted && lease.active(),
    };
    try {
      if (!lifetime.active()) return false;
      await action(signal, lifetime);
      return lifetime.active();
    } catch (cause) {
      if (lifetime.active()) {
        setError(
          cause instanceof IdentityApiError
            ? identityError(cause)
            : clerkFlowError(cause),
        );
        if (cause instanceof IdentityApiError && cause.status === 401)
          void identity.refresh();
      }
      return false;
    } finally {
      running.current = false;
      if (lifetime.active()) setPending(false);
    }
  }
  return { pending, error, notice, setError, setNotice, run };
}
