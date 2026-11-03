import { useSession } from "@clerk/expo";
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
  const workflow = useMemo(
    () => new NativeWorkflow(() => AppState.currentState === "active"),
    [],
  );
  const controller = useMemo(() => new NativeIdentityController(api), [api]);
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
  );
  const { storageLoaded, storageFailed } = actions;
  const [invitation, setInvitation] = useState<string | null>(null);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const task = session?.currentTask?.key;
  const actor = session ? `${session.user?.id}:${session.id}` : null;
  const previousActor = useRef<string | null>(null);
  useLayoutEffect(() => {
    controller.mount();
    if (AppState.currentState !== "active") controller.background();
    return () => controller.dispose();
  }, [controller]);
  useLayoutEffect(() => {
    if (isLoaded && storageLoaded && !storageFailed)
      void controller.identify(task ? null : actor);
    workflow.identify(actor);
  }, [
    isLoaded,
    storageLoaded,
    storageFailed,
    actor,
    task,
    controller,
    workflow,
  ]);
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
        refresh: () => controller.refresh(),
        workflow,
        interact: () => controller.interact(),
        ...actions,
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
