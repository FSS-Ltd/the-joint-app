import { BadRequestException } from "@nestjs/common";
import type { IdentityVault } from "../identity/identity-vault.js";
export class FundingCursors {
  constructor(private readonly vault: IdentityVault) {}
  seal(version: number, binding: string): string {
    return this.vault.seal(JSON.stringify(version), binding);
  }
  read(cursor: string | undefined, binding: string): number {
    if (cursor === undefined) return 0;
    try {
      const version: unknown = JSON.parse(this.vault.open(cursor, binding));
      if (
        typeof version === "number" &&
        Number.isInteger(version) &&
        version > 0 &&
        version <= 2147483647
      )
        return version;
      throw new Error("Invalid funding cursor payload");
    } catch {
      throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
    }
  }
}
