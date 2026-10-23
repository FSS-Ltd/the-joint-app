import { ConflictException } from "@nestjs/common";
import {
  databaseErrorCode,
  scopedDatabaseError,
} from "../../database-error.js";
export async function safeFundingQuery<T>(apply: () => Promise<T>): Promise<T> {
  try {
    return await apply();
  } catch (error: unknown) {
    switch (databaseErrorCode(error)) {
      case "P0003":
        throw new ConflictException({
          error: {
            code: "FUNDING_UNAVAILABLE",
            message:
              "Record a current, complete eligible adult valuation before attesting funding.",
          },
        });
      case "P0004":
        throw new ConflictException({
          error: {
            code: "SETTLEMENT_IMMUTABLE",
            message:
              "Record a new valuation before changing settled adult cash.",
          },
        });
      default:
        throw scopedDatabaseError(error);
    }
  }
}
