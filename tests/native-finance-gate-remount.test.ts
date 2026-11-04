import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture, financeMe } from "./fixtures/native-finance.js";
import { gatedFinanceResource } from "./fixtures/native-finance-gate.js";
import { deferred, flush, scope } from "./fixtures/native-stream.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import type { MeResponse } from "../packages/contracts/src/identity.js";
import type { NativeResourceScope } from "../apps/mobile/src/events/scope.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

it.each([403, 404, "INVALID_CURSOR"] as const)(
  "does not automatically resubscribe %s after the complete gate unmounts and creates fresh hooks",
  async (denial) => {
    const f = await financeFixture();
    const response = deferred<MeResponse>();
    f.api.readMe.mockImplementationOnce(() => response.promise);
    let selector: NativeResourceScope["selector"] =
      denial === "INVALID_CURSOR"
        ? { ...scope.selector, cursor: "issued-cursor" }
        : {
            kind: "account",
            householdId: scope.householdId,
            id: "00000000-0000-4000-8000-000000000008",
          };
    const read = vi.fn(async (captured: NativeResourceScope) => {
      if (
        captured.selector.kind === "accounts" &&
        captured.selector.cursor === undefined
      )
        return { items: [], nextCursor: "issued-cursor" };
      throw new NativeApiError(
        denial === "INVALID_CURSOR" ? 400 : denial,
        denial === "INVALID_CURSOR" ? denial : undefined,
      );
    });
    const screen = gatedFinanceResource(f, () => selector, read);
    const render = screen.render;
    if (denial === "INVALID_CURSOR") {
      selector = scope.selector;
      render();
      await flush();
      f.emit("event: change\ndata: {}\n\n");
      await flush();
      selector = { ...scope.selector, cursor: "issued-cursor" };
    }
    render();
    await flush();
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    expect(f.controller.getSnapshot().kind).toBe("loading");
    expect(render()).toMatchObject({ type: "frame" });
    response.resolve(structuredClone(financeMe));
    await flush();
    expect(render()).toBe("ready");
    await flush();
    render();
    expect(screen.mounts).toBe(2);
    expect(screen.snapshot?.kind).toBe("error");
    expect(f.send).toHaveBeenCalledTimes(denial === "INVALID_CURSOR" ? 2 : 1);
    expect(f.api.readMe).toHaveBeenCalledTimes(2);
    f.close();
  },
);
it("keeps a retained cursor blocked after a grant change and a truly fresh hook mounts", async () => {
  const f = await financeFixture();
  let selector: NativeResourceScope["selector"] = scope.selector;
  const read = vi.fn(async () => ({
    items: [],
    nextCursor: "prior-grant-cursor",
  }));
  const screen = gatedFinanceResource(f, () => selector, read);
  screen.render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const response = deferred<MeResponse>();
  f.api.readMe.mockImplementationOnce(() => response.promise);
  const pending = f.controller.refresh();
  expect(screen.render()).toMatchObject({ type: "frame" });
  selector = { ...scope.selector, cursor: "prior-grant-cursor" };
  response.resolve({
    ...financeMe,
    membership: financeMe.membership && {
      ...financeMe.membership,
      grantVersion: 1,
    },
  });
  await pending;
  screen.render();
  await flush();
  screen.render();
  expect(screen.mounts).toBe(2);
  expect(screen.snapshot?.kind).toBe("error");
  expect(f.send).toHaveBeenCalledOnce();
  screen.snapshot?.retry();
  await flush();
  expect(f.send).toHaveBeenCalledOnce();
  selector = scope.selector;
  screen.render();
  await flush();
  expect(f.send).toHaveBeenCalledTimes(2);
  f.close();
});
it("clears a remount-persistent refusal only after a deliberate retry succeeds", async () => {
  const f = await financeFixture();
  const response = deferred<MeResponse>();
  f.api.readMe.mockImplementationOnce(() => response.promise);
  const selector = {
    kind: "account",
    householdId: scope.householdId,
    id: "00000000-0000-4000-8000-000000000008",
  } as const;
  const read = vi
    .fn(async () => ({ householdId: scope.householdId, id: selector.id }))
    .mockRejectedValueOnce(new NativeApiError(404));
  const screen = gatedFinanceResource(f, () => selector, read);
  screen.render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(screen.render()).toMatchObject({ type: "frame" });
  response.resolve(structuredClone(financeMe));
  await flush();
  screen.render();
  await flush();
  screen.render();
  expect(screen.snapshot?.kind).toBe("error");
  expect(f.send).toHaveBeenCalledOnce();
  screen.snapshot?.retry();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  screen.render();
  expect(screen.snapshot?.kind).toBe("ready");
  expect(f.send).toHaveBeenCalledTimes(2);
  const refresh = f.controller.refresh();
  expect(screen.render()).toMatchObject({ type: "frame" });
  await refresh;
  screen.render();
  await flush();
  expect(screen.mounts).toBe(3);
  expect(f.send).toHaveBeenCalledTimes(3);
  f.close();
});
it("does not dispatch or reconcile an unissued cursor retained in route parameters", async () => {
  const f = await financeFixture();
  const read = vi.fn(async () => ({ items: [], nextCursor: null }));
  const screen = gatedFinanceResource(
    f,
    () => ({ ...scope.selector, cursor: "unissued-route-cursor" }),
    read,
  );
  screen.render();
  await flush();
  screen.render();
  expect(screen.snapshot?.kind).toBe("error");
  expect(f.send).not.toHaveBeenCalled();
  expect(f.api.readMe).toHaveBeenCalledOnce();
  f.close();
});
it.each(["sign-out", "revocation"])(
  "clears runtime-owned metadata on %s",
  async (loss) => {
    const f = await financeFixture();
    const captured = { ...f.finance.authority, selector: scope.selector };
    f.identity.resources.refuse(captured, new NativeApiError(403));
    if (loss === "sign-out") await f.controller.identify(null);
    else f.controller.revoke(f.finance.authority.actor);
    expect(f.identity.resources.refusal(captured)).toBeNull();
    expect(f.identity.resources.canUseCursor(captured)).toBe(false);
    f.close();
  },
);
it.each(["household-required", "security-required"])(
  "clears metadata when verified identity becomes %s",
  async (kind) => {
    const f = await financeFixture();
    const captured = { ...f.finance.authority, selector: scope.selector };
    f.identity.resources.refuse(captured, new NativeApiError(403));
    f.api.readMe.mockResolvedValue(
      kind === "household-required"
        ? { ...financeMe, membership: null }
        : { ...financeMe, session: { ...financeMe.session, needsMfa: true } },
    );
    await f.controller.refresh();
    expect(f.controller.getSnapshot().kind).toBe(kind);
    expect(f.identity.resources.refusal(captured)).toBeNull();
    f.close();
  },
);
