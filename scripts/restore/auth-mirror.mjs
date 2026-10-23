import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

/** Dedicated synthetic inventory; never forwards a request to development Auth. */
export async function createAuthMirror(userIds) {
  const users = new Set(userIds),
    secret = randomBytes(32).toString("base64url");
  let failNext = false;
  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${secret}`) {
      response.writeHead(401).end();
      return;
    }
    const match = /^\/users\/([0-9a-f-]{36})$/.exec(request.url ?? "");
    if (!match) {
      response.writeHead(404).end();
      return;
    }
    if (request.method === "DELETE") {
      if (failNext) {
        failNext = false;
        response.writeHead(503).end();
        return;
      }
      response.writeHead(users.delete(match[1]) ? 204 : 404).end();
      return;
    }
    if (request.method === "GET") {
      response.writeHead(users.has(match[1]) ? 200 : 404).end();
      return;
    }
    response.writeHead(405).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Isolated provider unavailable");
  const base = `http://127.0.0.1:${address.port}`;
  const call = (userId, method) =>
    globalThis.fetch(`${base}/users/${userId}`, {
      method,
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: globalThis.AbortSignal.timeout(2000),
    });
  return {
    failNext() {
      failNext = true;
    },
    async deleteUser(userId) {
      const result = await call(userId, "DELETE");
      return (
        [204, 404].includes(result.status) &&
        (await call(userId, "GET")).status === 404
      );
    },
    has(userId) {
      return users.has(userId);
    },
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
