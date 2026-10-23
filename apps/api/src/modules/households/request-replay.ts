import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@joint/database/client";
import type { IdentityVault } from "../identity/identity-vault.js";

export class RequestReplay {
  constructor(private readonly vault: IdentityVault) {}
  private context(userId: string, route: string, key: string): string {
    return `request:${userId}:${route}:${key}`;
  }
  async read<T>(
    tx: Prisma.TransactionClient,
    userId: string,
    route: string,
    key: string,
    payloadHash: string,
    schema: { parse(value: unknown): T },
  ): Promise<T | undefined> {
    const where = { userId_route_key: { userId, route, key } };
    const stored = await tx.requestKey.findUnique({ where });
    if (!stored) return undefined;
    if (stored.expiresAt <= new Date()) {
      await tx.requestKey.delete({ where });
      return undefined;
    }
    if (stored.payloadHash !== payloadHash)
      throw new ConflictException({
        error: {
          code: "IDEMPOTENCY_CONFLICT",
          message: "This request key was used for different details.",
        },
      });
    return schema.parse(
      JSON.parse(
        this.vault.open(
          stored.resultCiphertext,
          this.context(userId, route, key),
        ),
      ),
    );
  }
  async save(
    tx: Prisma.TransactionClient,
    userId: string,
    route: string,
    key: string,
    payloadHash: string,
    value: unknown,
  ): Promise<void> {
    await tx.requestKey.create({
      data: {
        userId,
        route,
        key,
        payloadHash,
        resultCiphertext: this.vault.seal(
          JSON.stringify(value),
          this.context(userId, route, key),
        ),
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
  }
}
