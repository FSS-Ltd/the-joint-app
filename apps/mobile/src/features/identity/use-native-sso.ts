import { useClerk, useSSO } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IdentityMutations } from "./mutations";
import { NativeReturnGuard } from "./returns";

export function useNativeSso(
  destination: string | undefined,
  mutations: IdentityMutations,
) {
  // This maintained SDK hook returns the SDK-created session without activating it.
  // The future-resource hook auto-activates before the application can check its return.
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const router = useRouter();
  const guard = useMemo(
    () => new NativeReturnGuard(destination ?? ""),
    [destination],
  );
  const running = useRef(false);
  const [pending, setPending] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => () => guard.cancel(), [guard]);
  async function start(): Promise<void> {
    if (!destination || running.current) return;
    running.current = true;
    setPending(true);
    guard.begin();
    const previousSession = clerk.session?.id;
    try {
      await mutations.run(async (scope) => {
        const result = await startSSOFlow({
          strategy: "oauth_google",
          redirectUrl: destination,
        });
        if (result.authSessionResult?.type !== "success") return;
        if (
          !scope.current() ||
          clerk.session?.id !== previousSession ||
          !guard.consume(result.authSessionResult.url)
        )
          throw new Error("Sign-in return could not be verified.");
        // Session identifiers are consumed only from the SDK result, never from the return URL.
        if (result.createdSessionId) {
          if (
            !clerk.client.sessions.some(
              (session) => session.id === result.createdSessionId,
            )
          )
            await clerk.client.reload();
          await scope.activate(result.createdSessionId, () =>
            clerk.setActive({ session: result.createdSessionId }),
          );
        } else {
          router.replace(
            result.signUp?.status === "missing_requirements" ? "/sign-up" : "/",
          );
          setRevision((value) => value + 1);
        }
      });
    } finally {
      guard.cancel();
      running.current = false;
      setPending(false);
    }
  }
  return { start, pending, revision };
}
