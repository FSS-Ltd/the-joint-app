import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { createClerkFixture } from "./fixtures/clerk.js";

it("releases the new notification listener when API startup fails on an occupied port", async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Startup fixture needs runtime configuration");
  const provider = await createClerkFixture();
  const occupied = createServer((_request, response) => response.end());
  occupied.listen(0, "127.0.0.1");
  await once(occupied, "listening");
  const address = occupied.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture port unavailable");
  const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      AUTH_PROVIDER: "clerk",
      DATABASE_URL: process.env.DATABASE_URL,
      API_PORT: String(address.port),
      DATABASE_TIMEOUT_MS: "1000",
      AUTH_TOKEN_KEY: provider.environment.AUTH_TOKEN_KEY,
      AUTH_EMAIL_HASH_KEY: provider.environment.AUTH_EMAIL_HASH_KEY,
      CLERK_ISSUER: provider.environment.CLERK_ISSUER,
      CLERK_JWT_KEY: provider.environment.CLERK_JWT_KEY,
      CLERK_SECRET_KEY: provider.environment.CLERK_SECRET_KEY,
      CLERK_AUTHORIZED_PARTIES:
        provider.environment.CLERK_AUTHORIZED_PARTIES.join(","),
      CLERK_TIMEOUT_MS: "1000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  let output = "";
  child.stdout.on("data", (value: Buffer) => {
    output += value.toString();
  });
  child.stderr.on("data", (value: Buffer) => {
    output += value.toString();
  });
  try {
    await vi.waitFor(() => expect(output).toContain("API startup failed"), {
      timeout: 3000,
    });
    await vi.waitFor(() => expect(child.exitCode).toBe(1), { timeout: 1000 });
    expect(output).not.toContain(provider.environment.CLERK_SECRET_KEY);
    expect(output).not.toContain(provider.environment.AUTH_TOKEN_KEY);
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    await exited;
    occupied.closeAllConnections();
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});
