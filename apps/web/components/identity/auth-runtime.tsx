"use client";

import { createContext, useContext } from "react";

export const AuthRuntimeContext = createContext<{
  finishSignOut(): Promise<void>;
}>({ finishSignOut: async () => {} });
export function useAuthRuntime() {
  return useContext(AuthRuntimeContext);
}
