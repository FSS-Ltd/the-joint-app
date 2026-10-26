"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { sessionDeadlineSchema } from "@joint/contracts";
import { request, subscribeSessionChanges } from "../client";
import { IdentityFrame } from "../frame";
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

function ProtectedSession({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<
    "checking" | "ready" | "unavailable" | "expired"
  >("checking");
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
        ready.current = document.visibilityState === "visible";
        setState(ready.current ? "ready" : "checking");
      },
      unavailable: () => setState("unavailable"),
      expire: () => {
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
  if (state === "ready") return children;
  const expired = state === "expired";
  return (
    <IdentityFrame
      eyebrow="Your private account"
      title={expired ? "Your session is locked" : "Checking your session"}
      description={
        expired
          ? "Ten minutes without activity ends access. Sign in again to continue."
          : "We’re checking access before showing your household."
      }
    >
      <section className="surface form-card" aria-live="polite">
        {expired ? (
          <>
            <p>
              {signout.pending
                ? "Signing out of this browser…"
                : signout.error || "Fresh sign-in is required."}
            </p>
            {!signout.pending && (
              <button
                type="button"
                className="button primary"
                onClick={() =>
                  void (signout.started
                    ? signout.retry()
                    : signout.logout("local"))
                }
              >
                Retry sign-out
              </button>
            )}
          </>
        ) : state === "unavailable" ? (
          <>
            <p>
              We could not verify your session. Your household stays locked
              until access is checked.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => void controller.current?.reconcile()}
            >
              Retry session check
            </button>
          </>
        ) : (
          <p role="status">Checking access…</p>
        )}
      </section>
    </IdentityFrame>
  );
}
