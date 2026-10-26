import { ConflictException } from "@nestjs/common";
import {
  databaseErrorCode,
  scopedDatabaseError,
} from "../../../database-error.js";

export async function safeContributionQuery<T>(
  apply: () => Promise<T>,
): Promise<T> {
  try {
    return await apply();
  } catch (error: unknown) {
    if (databaseErrorCode(error) === "P0001")
      throw new ConflictException({
        error: { code: "CONTRIBUTION_PLAN_LIMIT" },
      });
    throw scopedDatabaseError(error);
  }
}
