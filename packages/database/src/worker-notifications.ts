import pg from "pg";

export interface WorkerNotifications {
  close(): Promise<void>;
}

/** Session connection: LISTEN commits before the caller reconciles durable work. */
export function createWorkerNotifications(options: {
  connectionString: string;
  timeoutMs: number;
  retryMaxMs: number;
  onReady: () => void;
  onWake: () => void;
  onUnavailable?: () => void;
}): WorkerNotifications {
  let stopped = false;
  let release: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  async function listen(): Promise<void> {
    let retryMs = 1000;
    while (!stopped) {
      const connection = new pg.Client({
        connectionString: options.connectionString,
        application_name: "joint-worker-events",
        connectionTimeoutMillis: options.timeoutMs,
        query_timeout: options.timeoutMs,
        statement_timeout: options.timeoutMs,
        keepAlive: true,
      });
      const ended = new Promise<void>((resolve) => {
        release = resolve;
      });
      let disconnected = false;
      const lost = (): void => {
        disconnected = true;
        release?.();
      };
      connection.on("error", lost);
      connection.on("end", lost);
      connection.on("notification", (message) => {
        if (
          !stopped &&
          !disconnected &&
          message.channel === "joint_worker_wakeup" &&
          message.payload === ""
        )
          options.onWake();
      });
      try {
        // pg can leave connect() pending when end() interrupts authentication.
        // Cancel the wait first, then let finally close the transport.
        const connected = await Promise.race([
          connection.connect().then(() => true),
          ended.then(() => false),
        ]);
        const subscribed =
          connected &&
          !stopped &&
          !disconnected &&
          (await Promise.race([
            connection.query("LISTEN joint_worker_wakeup").then(() => true),
            ended.then(() => false),
          ]));
        if (subscribed && !stopped && !disconnected) {
          retryMs = 1000;
          options.onReady();
          await ended;
        }
      } catch {
        // Safe lifecycle signal only; never log connection/exception details.
      } finally {
        await connection.end().catch(() => {});
      }
      if (stopped) break;
      options.onUnavailable?.();
      await new Promise<void>((resolve) => {
        release = resolve;
        retryTimer = setTimeout(resolve, retryMs);
      });
      retryMs = Math.min(retryMs * 2, options.retryMaxMs);
    }
  }
  const active = listen();
  return {
    async close(): Promise<void> {
      stopped = true;
      clearTimeout(retryTimer);
      release?.();
      await active;
    },
  };
}
