import { StatusEventHub } from "../../apps/api/dist/modules/events/status-hub.js";
import { createDatabaseNotifications } from "../../packages/database/dist/notifications.js";

export function createStatusEvents(): StatusEventHub {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Status browser tests require runtime database configuration",
    );
  return new StatusEventHub((callbacks) =>
    createDatabaseNotifications({
      topic: "status",
      connectionString: process.env.DATABASE_URL ?? "",
      timeoutMs: 1000,
      retryMaxMs: 1000,
      ...callbacks,
    }),
  );
}
