"use client";
import { useEffect } from "react";
export function OfflineRegistration(): null {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* Online functionality remains available when the static shell cannot install. */
        });
  }, []);
  return null;
}
