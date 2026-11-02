import { useClerk, useSession } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState, View } from "react-native";
import { createIdentityApi } from "./api";
import { IdentityContext } from "./context";
import { NativeIdentityController } from "./controller";
import type { IdentityConfiguration } from "./configuration";
import { readInvitationLink } from "./returns";
import { logoutIdentity, retryProviderCleanup } from "./logout";
import { useNativeSso } from "./use-native-sso";
import { IdentityUnavailable } from "./unavailable";
const cleanupKey = "familyfund.logout-cleanup.v1";
export function IdentityRuntime({
  configuration,
  children,
}: PropsWithChildren<{
  configuration: IdentityConfiguration;
}>): React.JSX.Element {
  const clerk = useClerk();
  const { session, isLoaded } = useSession();
  const sso = useNativeSso(configuration.authReturnUrl);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const api = useMemo(
    () =>
      createIdentityApi(
        configuration.apiUrl,
        async () => sessionRef.current?.getToken() ?? null,
      ),
    [configuration.apiUrl],
  );
  const controller = useMemo(() => new NativeIdentityController(api), [api]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [ticket, setTicket] = useState<string | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [invitation, setInvitation] = useState<string | null>(null);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const task = session?.currentTask?.key;
  const actor = session ? `${session.user?.id}:${session.id}` : null;
  const previousActor = useRef<string | null>(null);
  const logoutPending = useRef(false);
  const [sessionPending, setSessionPending] = useState(false);
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    let current = true;
    void SecureStore.getItemAsync(cleanupKey).then(
      (value) => {
        if (current) {
          setTicket(value);
          setStorageLoaded(true);
        }
      },
      () => {
        if (current) setStorageFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, []);
  useLayoutEffect(() => {
    controller.mount();
    if (AppState.currentState !== "active") controller.background();
    return () => controller.dispose();
  }, [controller]);
  useLayoutEffect(() => {
    if (isLoaded && storageLoaded && !storageFailed)
      void controller.identify(task ? null : actor);
  }, [isLoaded, storageLoaded, storageFailed, actor, task, controller]);
  useLayoutEffect(() => {
    if (previousActor.current !== null && previousActor.current !== actor)
      setInvitation(null);
    previousActor.current = actor;
  }, [actor]);
  useEffect(() => {
    if (isLoaded) return;
    const timeout = setTimeout(() => setHydrationFailed(true), 15000);
    return () => clearTimeout(timeout);
  }, [isLoaded]);
  useEffect(() => {
    if (AppState.currentState !== "active") controller.background();
    const subscription = AppState.addEventListener("change", (value) => {
      if (value === "active") {
        if (!logoutPending.current) void controller.foreground();
      } else controller.background();
    });
    return () => {
      subscription.remove();
    };
  }, [controller]);
  useEffect(() => {
    let current = true;
    const accept = (url: string) => {
      const value = readInvitationLink(url);
      if (value) setInvitation(value);
    };
    void Linking.getInitialURL().then((url) => {
      if (current && url) accept(url);
    });
    const subscription = Linking.addEventListener("url", (event) =>
      accept(event.url),
    );
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);
  async function saveTicket(value: string | null): Promise<void> {
    // Retain the capability in memory even if persistence fails.
    setTicket(value);
    if (value)
      await SecureStore.setItemAsync(cleanupKey, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    else await SecureStore.deleteItemAsync(cleanupKey);
  }
  async function logout(scope: "local" | "global"): Promise<void> {
    if (logoutPending.current) return;
    const signingOutSession = session;
    if (!signingOutSession) return;
    const signingOutActor = `${signingOutSession.user?.id}:${signingOutSession.id}`;
    const logoutApi = createIdentityApi(configuration.apiUrl, () =>
      signingOutSession.getToken(),
    );
    logoutPending.current = true;
    setSessionPending(true);
    setSessionError("");
    controller.conceal();
    try {
      await logoutIdentity(scope, {
        logout: (scope) =>
          logoutApi.logout(scope, new AbortController().signal),
        revoke: () => controller.revoke(signingOutActor),
        saveTicket,
        signOut: async () => {
          await clerk.signOut({ sessionId: signingOutSession.id });
        },
      });
      setInvitation(null);
      await controller.foreground();
    } catch {
      setSessionError(
        "Sign-out could not finish. Your household remains concealed. Retry sign-out to finish safely.",
      );
    } finally {
      setSessionPending(false);
      logoutPending.current = false;
    }
  }
  async function cancelPendingSignIn(): Promise<void> {
    const pendingSession = sessionRef.current;
    if (pendingSession?.status !== "pending" || logoutPending.current) return;
    logoutPending.current = true;
    setSessionPending(true);
    setSessionError("");
    controller.conceal();
    try {
      // Pending provider tasks never enter the app's identity registry in this client.
      // This cancels that provider sign-in; it does not claim app/global revocation.
      await clerk.signOut({ sessionId: pendingSession.id });
      await controller.foreground();
    } catch {
      setSessionError(
        "Sign-in cancellation could not finish. Please try again.",
      );
    } finally {
      logoutPending.current = false;
      setSessionPending(false);
    }
  }
  if (storageFailed || (hydrationFailed && !isLoaded))
    return <IdentityUnavailable />;
  return (
    <IdentityContext.Provider
      value={{
        state,
        api,
        refresh: () => controller.foreground(),
        interact: () => controller.interact(),
        logout,
        cleanupPending: Boolean(ticket),
        sessionPending,
        sessionError,
        ...(session?.status === "pending" ? { cancelPendingSignIn } : {}),
        retryCleanup: async () => {
          if (!ticket || sessionPending) return;
          setSessionPending(true);
          setSessionError("");
          try {
            await retryProviderCleanup(
              ticket,
              (value) =>
                api.retryLogoutCleanup(value, new AbortController().signal),
              saveTicket,
            );
          } catch {
            setSessionError(
              "Provider cleanup is still unavailable. Retry when your connection returns.",
            );
          } finally {
            setSessionPending(false);
          }
        },
        ...(configuration.authReturnUrl ? { google: sso.start } : {}),
        googlePending: sso.pending,
        authRevision: sso.revision,
        invitation,
        clearInvitation: () => setInvitation(null),
      }}
    >
      <View style={{ flex: 1 }} onTouchStart={() => controller.interact()}>
        {children}
      </View>
    </IdentityContext.Provider>
  );
}
