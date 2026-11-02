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
    action: (signal: AbortSignal) => Promise<void>,
  ): Promise<boolean> {
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setError("");
    setNotice("");
    const signal = abort.current.signal;
    try {
      await action(signal);
      return !signal.aborted;
    } catch (cause) {
      if (!signal.aborted) {
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
      if (!signal.aborted) setPending(false);
    }
  }
  return { pending, error, notice, setError, setNotice, run };
}
