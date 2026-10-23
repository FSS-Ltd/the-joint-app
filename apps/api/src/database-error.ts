import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

export function databaseErrorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("meta" in error)) return;
  const meta = error.meta;
  if (typeof meta !== "object" || meta === null) return;
  if ("code" in meta && typeof meta.code === "string") return meta.code;
  if (!("driverAdapterError" in meta)) return;
  const adapter = meta.driverAdapterError;
  if (typeof adapter !== "object" || adapter === null || !("cause" in adapter))
    return;
  const cause = adapter.cause;
  if (typeof cause === "object" && cause !== null && "originalCode" in cause)
    return cause.originalCode;
}

export function scopedDatabaseError(error: unknown): unknown {
  if (
    error instanceof Error &&
    [
      "Authorization scope is no longer valid",
      "Archive session is no longer valid",
    ].includes(error.message)
  )
    return new NotFoundException();
  switch (databaseErrorCode(error)) {
    case "42501":
    case "P0002":
      return new NotFoundException();
    case "40001":
    case "23505":
      return new ConflictException({ error: { code: "VERSION_CONFLICT" } });
    case "22023":
      return new BadRequestException();
    default:
      return error;
  }
}
