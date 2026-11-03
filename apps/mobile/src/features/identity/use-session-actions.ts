import { useClerk, useSession } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createIdentityApi, type IdentityApi } from "./api";
import { CleanupStore } from "./cleanup-store";
import type { NativeIdentityController, IdentityState } from "./controller";
import {
  isCredentialRejected,
  logoutIdentity,
  retryProviderCleanup,
} from "./logout";
import { removeOriginalSession, sessionActor } from "./provider-session";
import type { NativeWorkflow } from "./workflow";
const cleanupKey = "familyfund.logout-cleanup.v1";
const unconfirmedNotice =
  "This device's sign-in was removed. Server and other-device sign-out could not be confirmed.";
export function useSessionActions(
  apiUrl: string,
  api: IdentityApi,
  controller: NativeIdentityController,
  workflow: NativeWorkflow,
  state: IdentityState,
) {
  const clerk = useClerk(),
    { session } = useSession();
  const store = useMemo(
    () =>
      new CleanupStore({
        read: () => SecureStore.getItemAsync(cleanupKey),
        write: (value) =>
          SecureStore.setItemAsync(cleanupKey, value, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          }),
        remove: () => SecureStore.deleteItemAsync(cleanupKey),
      }),
    [],
  );
  const tickets = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [storageLoaded, setStorageLoaded] = useState(false),
    [storageFailed, setStorageFailed] = useState(false);
  const [sessionPending, setSessionPending] = useState(false),
    [sessionError, setSessionError] = useState(""),
    [sessionNotice, setSessionNotice] = useState("");
  const [rejectedActor, setRejectedActor] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let current = true;
    void store.load().then(
      () => {
        if (current) setStorageLoaded(true);
      },
      () => {
        if (current) setStorageFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [store]);
  async function remove(
    sessionToRemove: NonNullable<typeof session>,
    unchanged: () => boolean,
  ): Promise<boolean> {
    return removeOriginalSession(
      sessionToRemove,
      () => clerk.session,
      (id) => clerk.client.signedInSessions.some((item) => item.id === id),
      unchanged,
      async (id) => {
        await clerk.signOut({ sessionId: id });
      },
    );
  }
  async function perform(
    action: (lease: ReturnType<NativeWorkflow["capture"]>) => Promise<void>,
  ): Promise<void> {
    if (pending.current || !storageLoaded) return;
    const lease = workflow.capture();
    if (!lease.active()) return;
    pending.current = true;
    setSessionPending(true);
    setSessionError("");
    try {
      await action(lease);
    } catch {
      if (lease.current())
        setSessionError(
          "This action could not finish. Your account remains protected. Please try again.",
        );
    } finally {
      pending.current = false;
      setSessionPending(false);
    }
  }
  async function logout(scope: "local" | "global"): Promise<void> {
    const original = session;
    if (!original || sessionActor(clerk.session) !== sessionActor(original))
      return;
    await perform(async (lease) => {
      const originalActor = sessionActor(original);
      const logoutApi = createIdentityApi(apiUrl, () => original.getToken());
      controller.conceal();
      try {
        await logoutIdentity(scope, {
          logout: (value) =>
            logoutApi.logout(value, new AbortController().signal),
          revoke: () => controller.revoke(originalActor ?? undefined),
          saveTicket: async (value) => {
            if (value) await store.add(value);
          },
          signOut: async () => {
            await remove(original, lease.current);
          },
        });
        if (lease.current()) await controller.refresh();
      } catch (cause) {
        if (lease.current() && isCredentialRejected(cause))
          setRejectedActor(originalActor);
        throw cause;
      }
    });
  }
  const canDiscard = Boolean(
    session &&
    (rejectedActor === sessionActor(session) ||
      (state.kind === "locked" && state.reason === "expired")),
  );
  async function discardRejectedSignIn(): Promise<void> {
    const original = session;
    if (
      !original ||
      !canDiscard ||
      sessionActor(clerk.session) !== sessionActor(original)
    )
      return;
    await perform(async (lease) => {
      controller.conceal();
      if (await remove(original, lease.current)) {
        controller.revoke(sessionActor(original) ?? undefined);
        // This is local recovery, never evidence of server or global revocation.
        setSessionNotice(unconfirmedNotice);
        await controller.refresh();
      }
    });
  }
  async function cancelPendingSignIn(): Promise<void> {
    const original = session;
    if (
      original?.status !== "pending" ||
      sessionActor(clerk.session) !== sessionActor(original)
    )
      return;
    await perform(async (lease) => {
      controller.conceal();
      if (await remove(original, lease.current)) await controller.refresh();
    });
  }
  async function retryCleanup(): Promise<void> {
    await perform(async () => {
      for (const ticket of store.getSnapshot()) {
        const result = await retryProviderCleanup(
          ticket,
          (value) =>
            api.retryLogoutCleanup(value, new AbortController().signal),
          (value) => store.replace(ticket, value),
        );
        if (result === "expired")
          setSessionNotice(
            "The sign-out cleanup window has ended. Old app access remains revoked, but remote provider cleanup was not confirmed.",
          );
        if (result === "pending")
          setSessionError(
            "Provider cleanup is still pending. Please try again later.",
          );
      }
    });
  }
  return {
    storageLoaded,
    storageFailed,
    pending,
    logout,
    sessionPending,
    sessionError,
    sessionNotice,
    cleanupPending: tickets.length > 0,
    retryCleanup,
    ...(canDiscard ? { discardRejectedSignIn } : {}),
    ...(session?.status === "pending" ? { cancelPendingSignIn } : {}),
  };
}
