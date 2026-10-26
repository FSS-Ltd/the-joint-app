import { ConflictException } from "@nestjs/common";
import {
  databaseErrorCode,
  scopedDatabaseError,
} from "../../../database-error.js";

export async function safeAllocationQuery<T>(
  apply: () => Promise<T>,
): Promise<T> {
  try {
    return await apply();
  } catch (error: unknown) {
    switch (databaseErrorCode(error)) {
      case "P0003":
        throw new ConflictException({
          error: {
            code: "FUNDING_UNAVAILABLE",
            message:
              "Check the current eligible adult valuation and funding evidence before adding an intention.",
          },
        });
      case "P0005":
        throw new ConflictException({
          error: {
            code: "ALLOCATION_EXCEEDS_AVAILABLE",
            message:
              "Reduce the intention or release another commitment before trying again.",
          },
        });
      default:
        throw scopedDatabaseError(error);
    }
  }
}
