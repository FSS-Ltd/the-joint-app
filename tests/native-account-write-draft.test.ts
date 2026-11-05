import { existsSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture } from "./fixtures/native-finance.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { account } from "./fixtures/native-read-ui.js";
import * as scope from "../apps/mobile/src/features/finance/scope.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
import type { WriteDraftHook as DraftHook } from "../apps/mobile/src/features/accounts/write-state.js";
async function setup() {
  const path = "apps/mobile/src/features/accounts/use-write-draft.ts";
  expect(existsSync(path), "scoped draft hook exists").toBe(true);
  const f = await financeFixture();
  const dependencies = {
    react: f.h.react,
    "react-native": { AppState: f.h.appState },
    "expo-router": f.h.router,
    "../finance/context": { useNativeFinance: () => f.finance },
    "../finance/scope": scope,
  };
  const lifetime = sourceExports(
    "apps/mobile/src/features/finance/use-lifetime.ts",
    dependencies,
  );
  const hook = sourceExports(path, {
    ...dependencies,
    "../finance/use-lifetime": lifetime,
  }).useWriteDraft as DraftHook;
  return {
    ...f,
    render: () =>
      f.h.render(() => hook("metadata:account", () => ({ label: "" }))),
  };
}
it("pins the authorized base and draft across refresh until explicit discard", async () => {
  const f = await setup(),
    base = account();
  f.render().initialize(base, { label: "Original" });
  f.render().change({ label: "Unsaved" });
  f.render().initialize({ ...base, version: 2 }, { label: "Server change" });
  expect(f.render()).toMatchObject({
    base: { version: 1 },
    value: { label: "Unsaved" },
  });
  f.render().clear();
  f.render().initialize({ ...base, version: 2 }, { label: "Server change" });
  expect(f.render()).toMatchObject({
    base: { version: 2 },
    value: { label: "Server change" },
  });
  f.close();
});
it.each(["blur", "background", "identity"])(
  "clears draft and old callbacks synchronously on %s",
  async (loss) => {
    const f = await setup();
    const old = f.render();
    old.initialize(account(), { label: "Private" });
    if (loss === "blur") f.h.focus(false);
    if (loss === "background") f.h.app("background");
    if (loss === "identity") f.controller.blockMutations();
    old.change({ label: "Late private value" });
    expect(f.render()).toMatchObject({
      base: null,
      value: { label: "" },
      visible: false,
    });
    f.close();
  },
);
it("invalidates sensitive draft on target loss until explicit reload", async () => {
  const f = await setup();
  f.render().initialize(account(), { label: "Private" });
  f.render().invalidate();
  f.render().initialize(account({ version: 2 }), { label: "New target" });
  expect(f.render()).toMatchObject({
    base: null,
    value: { label: "" },
    invalidated: true,
  });
  f.render().clear();
  f.render().initialize(account({ version: 2 }), { label: "New target" });
  expect(f.render()).toMatchObject({
    base: { version: 2 },
    invalidated: false,
  });
  f.close();
});
