import { useClerk, useSession } from "@clerk/expo";
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
import { createNativeTransport } from "../../api/request";
import { createIdentityApiFromTransport } from "./api";
import { IdentityMutations } from "./mutations";
import { sessionActor } from "./provider-session";
import { IdentityContext } from "./context";
import { NativeWorkflow } from "./workflow";
import { NativeIdentityController } from "./controller";
import type { IdentityConfiguration } from "./configuration";
import { readInvitationLink } from "./returns";
import { useSessionActions } from "./use-session-actions";
import { useNativeSso } from "./use-native-sso";
import { IdentityUnavailable } from "./unavailable";
export function IdentityRuntime({
  configuration,
  children,
}: PropsWithChildren<{
  configuration: IdentityConfiguration;
}>): React.JSX.Element {
  const { session, isLoaded } = useSession();
  const clerk = useClerk();
  const transport = useMemo(
    () =>
      createNativeTransport(
        configuration.apiUrl,
        async () => clerk.session?.getToken() ?? null,
      ),
    [configuration.apiUrl, clerk],
  );
  const api = useMemo(
    () => createIdentityApiFromTransport(transport),
    [transport],
  );
  const workflow = useMemo(
    () => new NativeWorkflow(() => AppState.currentState === "active"),
    [],
  );
  const controller = useMemo(() => new NativeIdentityController(api), [api]);
  const finance = useMemo(
    () => ({
      transport,
      getVerifiedIdentity: controller.getVerifiedIdentity,
      subscribe: controller.subscribe,
      revoke: (actor: string) => controller.revoke(actor),
      refresh: () => controller.refresh(),
    }),
    [transport, controller],
  );
  const mutations = useMemo(
    () =>
      new IdentityMutations({
        current: () => clerk.session,
        find: (id) =>
          clerk.client?.signedInSessions.find((item) => item.id === id),
        select: (id) => clerk.setActive({ session: id }),
        block: () => controller.blockMutations(),
        settle: () =>
          controller.settleMutation(
            clerk.session?.currentTask ? null : sessionActor(clerk.session),
          ),
      }),
    [clerk, controller],
  );
  const sso = useNativeSso(configuration.authReturnUrl, mutations);
  const mutationState = useSyncExternalStore(
    mutations.subscribe,
    mutations.getSnapshot,
    mutations.getSnapshot,
  );
  const providerLoading = useRef(false);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const actions = useSessionActions(
    configuration.apiUrl,
    api,
    controller,
    workflow,
    state,
    mutations,
  );
  const { storageLoaded, storageFailed } = actions;
  const [invitation, setInvitation] = useState<string | null>(null);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const actor = session ? `${session.user?.id}:${session.id}` : null;
  const previousActor = useRef<string | null>(null);
  useLayoutEffect(() => {
    controller.mount();
    if (AppState.currentState !== "active") controller.background();
    return () => controller.dispose();
  }, [controller]);
  useLayoutEffect(
    () =>
      clerk.addListener(({ session: current }) => {
        mutations.observe(current);
        if (current === undefined) {
          providerLoading.current = true;
          controller.blockMutations();
          return;
        }
        workflow.identify(sessionActor(current));
        if (
          isLoaded &&
          storageLoaded &&
          !storageFailed &&
          !mutations.getSnapshot().busy &&
          !mutations.getSnapshot().quarantined
        ) {
          const actor = current?.currentTask ? null : sessionActor(current);
          void (providerLoading.current
            ? controller.settleMutation(actor)
            : controller.identify(actor));
          providerLoading.current = false;
        }
      }),
    [
      clerk,
      mutations,
      workflow,
      controller,
      isLoaded,
      storageLoaded,
      storageFailed,
    ],
  );
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
        void controller.foreground(!actions.pending.current);
      } else {
        workflow.conceal();
        controller.background();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [controller, workflow, actions.pending]);
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
  if (storageFailed || (hydrationFailed && !isLoaded))
    return <IdentityUnavailable />;
  return (
    <IdentityContext.Provider
      value={{
        state,
        api,
        finance,
        refresh: () => controller.refresh(),
        workflow,
        mutations,
        interact: () => controller.interact(),
        ...actions,
        sessionNotice: actions.sessionNotice || mutationState.notice,
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
