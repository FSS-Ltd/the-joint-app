import type { NativeFinanceResourceMemory } from "../finance/resource-memory";
import type { NativeTransport } from "../../api/types";
import type { VerifiedNativeIdentity } from "./controller";

export interface NativeIdentityBridge {
  readonly transport: NativeTransport;
  readonly resources: NativeFinanceResourceMemory;
  getVerifiedIdentity(): VerifiedNativeIdentity | null;
  getActor?(): string | null | undefined;
  subscribe(listener: () => void): () => void;
  revoke(actor: string): void;
  refresh(): Promise<void>;
}
