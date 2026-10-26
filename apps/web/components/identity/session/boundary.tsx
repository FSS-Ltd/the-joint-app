"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { sessionDeadlineSchema } from "@joint/contracts";
import { request, subscribeSessionChanges } from "../client";
import { SessionLockScreen, type SessionLockState } from "./lock-screen";
import { useLogout } from "../use-logout";
import { IdleSessionController } from "./idle-controller";

const publicPaths = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/recovery",
  "/join",
  "/auth/complete",
  "/auth/callback",
  "/auth/task/password",
  "/privacy/deletion",
]);

export function SessionBoundary({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}): ReactNode {
  const pathname = usePathname();
  return disabled || publicPaths.has(pathname) ? (
    children
  ) : (
    <ProtectedSession key={pathname}>{children}</ProtectedSession>
  );
}

export function ProtectedSession({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [state, setState] = useState<SessionLockState | "ready">("checking");
  const [retained, setRetained] = useState(false);
  const terminal = useRef(false);
  const ready = useRef(false);
  const controller = useRef<IdleSessionController | null>(null);
  const signout = useLogout();
  useEffect(() => {
    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel("joint-session-activity");
    const idle = new IdleSessionController({
      read: async (signal) =>
        sessionDeadlineSchema.parse(
          await request("/api/auth/session", undefined, undefined, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
          }),
        ),
      activity: async (activityAgeMs, signal) =>
        sessionDeadlineSchema.parse(
          await request("/api/auth/session", { activityAgeMs }, undefined, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
          }),
        ),
      lock: () => {
        ready.current = false;
        setState("checking");
      },
      ready: () => {
        setRetained(true);
        ready.current = document.visibilityState === "visible";
        setState(ready.current ? "ready" : "checking");
      },
      unavailable: () => setState("unavailable"),
      expire: () => {
        terminal.current = true;
        setRetained(false);
        setState("expired");
        void signout.logout("local");
      },
      changed: () => channel?.postMessage("ACTIVITY_COMMITTED"),
    });
    controller.current = idle;
    const unsubscribe = subscribeSessionChanges(() => {
      ready.current = false;
      window.location.reload();
    });
    const input = (event: Event) => {
      if (
        event.isTrusted &&
        ready.current &&
        document.visibilityState === "visible"
      )
        idle.interact();
    };
    const conceal = () => {
      if (terminal.current) return;
      ready.current = false;
      flushSync(() => setState("checking"));
    };
    const restore = () => {
      if (document.visibilityState === "visible") void idle.reconcile(false);
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void idle.reconcile();
    };
    const changed = (event: MessageEvent<unknown>) => {
      // A message carries no authority or identity. Recheck this browser's own session.
      if (event.data === "ACTIVITY_COMMITTED") void idle.reconcile(false);
    };
    for (const name of ["pointerdown", "keydown", "touchstart", "wheel"])
      window.addEventListener(name, input, { passive: true });
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("pagehide", conceal);
    window.addEventListener("online", restore);
    channel?.addEventListener("message", changed);
    void idle.start();
    return () => {
      unsubscribe();
      idle.stop();
      controller.current = null;
      for (const name of ["pointerdown", "keydown", "touchstart", "wheel"])
        window.removeEventListener(name, input);
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("online", restore);
      channel?.close();
    };
  }, []);
  return (
    <>
      {retained && <div hidden={state !== "ready"}>{children}</div>}
      {state !== "ready" && (
        <SessionLockScreen
          state={state}
          signout={signout}
          retrySession={() => void controller.current?.reconcile()}
        />
      )}
    </>
  );
}
