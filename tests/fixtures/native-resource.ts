import { vi } from "vitest";
import { NativeResourceController } from "./native-events.js";
import { nativeWire, scope } from "./native-stream.js";
import type { NativeResourceScope } from "../../apps/mobile/src/events/scope.js";
export function resourceFixture(
  read = vi.fn<
    (scope: NativeResourceScope, signal: AbortSignal) => Promise<string>
  >(async () => "value"),
) {
  const wire = nativeWire(),
    receive = vi.fn(),
    unavailable = vi.fn(),
    failure = vi.fn(),
    revoke = vi.fn();
  const controller = new NativeResourceController({
    scope,
    transport: wire.transport,
    read,
    receive,
    unavailable,
    failure,
    revoke,
  });
  return { ...wire, controller, read, receive, unavailable, failure, revoke };
}
