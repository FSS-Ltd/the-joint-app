import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Component, useMemo, useState, type PropsWithChildren } from "react";
import type { IdentityConfiguration } from "./configuration";
import { guardTokenCache } from "./secure-cache";
import { IdentityRuntime } from "./runtime";
import { IdentityUnavailable } from "./unavailable";
class IdentityBoundary extends Component<
  PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): React.ReactNode {
    return this.state.failed ? <IdentityUnavailable /> : this.props.children;
  }
}
export function NativeIdentityProvider({
  configuration,
  children,
}: PropsWithChildren<{
  configuration: IdentityConfiguration;
}>): React.JSX.Element {
  const [storageFailed, setStorageFailed] = useState(false);
  const cache = useMemo(
    () =>
      tokenCache
        ? guardTokenCache(tokenCache, () => setStorageFailed(true))
        : undefined,
    [],
  );
  if (!cache || storageFailed) return <IdentityUnavailable />;
  return (
    <IdentityBoundary>
      <ClerkProvider
        publishableKey={configuration.publishableKey}
        proxyUrl={`${configuration.apiUrl}/v1/clerk`}
        tokenCache={cache}
        polling={false}
        __experimental_disableNativeClientSync
      >
        <IdentityRuntime configuration={configuration}>
          {children}
        </IdentityRuntime>
      </ClerkProvider>
    </IdentityBoundary>
  );
}
