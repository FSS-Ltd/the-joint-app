import { expect, it, vi } from "vitest";
import {
  jsxBoundary,
  sourceExports,
} from "./fixtures/native-source-harness.js";

it("routes Clerk through the configured API origin with guarded token storage", () => {
  const cache = { getToken: vi.fn(), saveToken: vi.fn() };
  const guard = vi.fn(() => cache);
  const Provider = sourceExports(
    "apps/mobile/src/features/identity/provider.tsx",
    {
      react: {
        Component: class {},
        useState: (value: unknown) => [value, vi.fn()],
        useMemo: (factory: () => unknown) => factory(),
      },
      "react/jsx-runtime": jsxBoundary,
      "@clerk/expo": { ClerkProvider: "clerk" },
      "@clerk/expo/token-cache": { tokenCache: cache },
      "./secure-cache": { guardTokenCache: guard },
      "./runtime": { IdentityRuntime: "runtime" },
      "./unavailable": { IdentityUnavailable: "unavailable" },
    },
  ).NativeIdentityProvider as (props: unknown) => {
    props: { children: { type: string; props: Record<string, unknown> } };
  };
  const tree = Provider({
    configuration: {
      apiUrl: "https://api.example.test",
      publishableKey: "synthetic-key",
    },
    children: "child",
  });
  expect(tree.props.children).toMatchObject({
    type: "clerk",
    props: {
      proxyUrl: "https://api.example.test/v1/clerk",
      tokenCache: cache,
      polling: false,
      __experimental_disableNativeClientSync: true,
    },
  });
  expect(guard).toHaveBeenCalledOnce();
});
