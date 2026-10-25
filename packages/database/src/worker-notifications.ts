import {
  createDatabaseNotifications,
  type DatabaseNotifications,
} from "./notifications.js";

export type WorkerNotifications = DatabaseNotifications;

/** Retains the worker's fixed topic and lifecycle contract. */
export function createWorkerNotifications(
  options: Omit<Parameters<typeof createDatabaseNotifications>[0], "topic">,
): WorkerNotifications {
  return createDatabaseNotifications({ ...options, topic: "worker" });
}
