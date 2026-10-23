import { BadRequestException } from "@nestjs/common";
import { idempotencyKeySchema } from "@joint/contracts";
import type { IdentityVault } from "../identity/identity-vault.js";
export class GoalCursors {
  constructor(private readonly vault: IdentityVault) {}
  seal(value: string | number, binding: string): string {
    return this.vault.seal(JSON.stringify(value), binding);
  }
  private open(cursor: string, binding: string): unknown {
    try {
      return JSON.parse(this.vault.open(cursor, binding));
    } catch {
      throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
    }
  }
  version(cursor: string | undefined, binding: string): number {
    if (cursor === undefined) return 0;
    const value = this.open(cursor, binding);
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 2147483647
    )
      throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
    return value;
  }
  id(cursor: string | undefined, binding: string): string | undefined {
    if (cursor === undefined) return;
    const result = idempotencyKeySchema.safeParse(this.open(cursor, binding));
    if (!result.success)
      throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
    return result.data;
  }
}
