import { createServer } from "node:http";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { streamDownload } from "../apps/api/src/modules/exports/export-stream.js";

it("aborts the HTTP body after a failed chunk without logging payloads", async () => {
  let fail: () => void = () => {};
  const proceed = new Promise<void>((resolve) => {
    fail = resolve;
  });
  const sentinel = "synthetic-private-stream-payload";
  const logged = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const server = createServer((_request, response) => {
    async function* chunks(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode("recordType,accountId\n");
      await proceed;
      throw new Error(sentinel);
    }
    const file = streamDownload(response, new AbortController(), chunks());
    // Exercise the same StreamableFile error hook used by the Nest Express adapter.
    const stream = file.getStream();
    stream.once("error", (error) =>
      file.errorHandler(error, {
        get destroyed() {
          return response.destroyed;
        },
        get headersSent() {
          return response.headersSent;
        },
        get statusCode() {
          return response.statusCode;
        },
        set statusCode(value) {
          response.statusCode = value;
        },
        send: (body) => {
          response.end(body);
        },
        end: () => {
          response.end();
        },
      }),
    );
    stream.pipe(response);
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Local listener unavailable");
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    expect(response.status).toBe(200);
    const body = response.text();
    fail();
    await expect(body).rejects.toThrow();
    expect(JSON.stringify(logged.mock.calls)).not.toContain(sentinel);
  } finally {
    fail();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    logged.mockRestore();
  }
});
