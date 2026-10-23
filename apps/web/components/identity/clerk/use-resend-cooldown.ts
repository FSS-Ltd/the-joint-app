"use client";

import { useEffect, useRef, useState } from "react";

const cooldownMs = 30_000;

export function useResendCooldown() {
  const deadline = useRef(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const update = () =>
      setSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    if (expiresAt <= Date.now()) return;
    const timer = setInterval(() => {
      update();
      if (expiresAt <= Date.now()) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return {
    seconds,
    canResend: () => Date.now() >= deadline.current,
    start: () => {
      deadline.current = Date.now() + cooldownMs;
      setExpiresAt(deadline.current);
      setSeconds(cooldownMs / 1000);
    },
  };
}
