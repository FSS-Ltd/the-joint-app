import type { NativeTransport } from "../../api/types";
import type { VerifiedNativeIdentity } from "./controller";

export interface NativeIdentityBridge {
  readonly transport: NativeTransport;
  getVerifiedIdentity(): VerifiedNativeIdentity | null;
  subscribe(listener: () => void): () => void;
  revoke(actor: string): void;
  refresh(): Promise<void>;
}
