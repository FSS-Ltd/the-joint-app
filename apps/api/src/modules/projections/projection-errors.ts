import { scopedDatabaseError } from "../../database-error.js";

export async function safeProjectionQuery<T>(
  apply: () => Promise<T>,
): Promise<T> {
  try {
    return await apply();
  } catch (error: unknown) {
    throw scopedDatabaseError(error);
  }
}
