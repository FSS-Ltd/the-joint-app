import { scopedDatabaseError } from "../../database-error.js";
export { scopedDatabaseError as goalDatabaseError } from "../../database-error.js";
export async function safeGoalQuery<T>(apply: () => Promise<T>): Promise<T> {
  try {
    return await apply();
  } catch (error: unknown) {
    throw scopedDatabaseError(error);
  }
}
