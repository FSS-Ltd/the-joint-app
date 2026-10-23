import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export async function startIdentityFixture(): Promise<{
  issuer: string;
  token(
    userId: string,
    sessionId: string,
    overrides?: Record<string, unknown>,
  ): Promise<string>;
  close(): Promise<void>;
}> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const kid = randomUUID();
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: "ES256",
    use: "sig",
  };
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture listener");
  const issuer = `http://127.0.0.1:${address.port}/auth/v1`;
  return {
    issuer,
    token: (userId, sessionId, overrides = {}) =>
      new SignJWT({
        iss: issuer,
        aud: "authenticated",
        sub: userId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        session_id: sessionId,
        role: "authenticated",
        ...overrides,
      })
        .setProtectedHeader({ alg: "ES256", kid })
        .sign(privateKey),
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
