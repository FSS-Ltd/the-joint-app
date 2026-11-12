import "reflect-metadata";
import type { IncomingMessage } from "node:http";
import { HttpErrorFilter } from "./http-error.filter.js";
import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { INestApplication } from "@nestjs/common";
import { createClerkProxy } from "./modules/identity/clerk/proxy.js";
import { ClerkCredentialVerifier } from "./modules/identity/clerk/credential-verifier.js";
import { ClerkIdentityStore } from "./modules/identity/clerk/identity-store.js";
import { IdentityVault } from "./modules/identity/identity-vault.js";
import { StatusEventHub } from "./modules/events/status-hub.js";
import type { DatabaseConnection } from "@joint/database";
import type { HealthResponse } from "@joint/contracts";
import { MAX_CSV_BYTES } from "@joint/contracts";
import {
  BootstrapService,
  type BootstrapOptions,
} from "./modules/bootstrap/bootstrap.service.js";
import { createBootstrapController } from "./modules/bootstrap/bootstrap.controller.js";
import {
  identityControllers,
  type AuthOptions,
} from "./modules/identity/identity.module.js";
export async function createApplication(
  database: DatabaseConnection,
  bootstrap?: BootstrapOptions,
  auth?: AuthOptions,
): Promise<INestApplication> {
  @Controller("health")
  class HealthController {
    @Get("live") live(): HealthResponse {
      return { status: "ok" };
    }
    @Get("ready") async ready(): Promise<HealthResponse> {
      if (!(await database.ready()))
        throw new ServiceUnavailableException({ status: "unavailable" });
      return { status: "ok" };
    }
  }
  @Module({
    providers: auth?.events
      ? [{ provide: StatusEventHub, useValue: auth.events }]
      : [],
    controllers: [
      HealthController,
      ...identityControllers(auth),
      createBootstrapController(
        bootstrap ? new BootstrapService(bootstrap) : undefined,
      ),
    ],
  })
  class ApplicationModule {}
  const app = await NestFactory.create<NestExpressApplication>(
    ApplicationModule,
    { logger: false, bodyParser: false },
  );
  const proxy =
    auth?.provider === "clerk" && auth.environment.CLERK_PROXY_URL
      ? (() => {
          const verifier = new ClerkCredentialVerifier(
            auth.environment,
            auth.clerkGateway,
          );
          const store = new ClerkIdentityStore(
            auth.database,
            new IdentityVault(
              auth.environment.AUTH_TOKEN_KEY,
              auth.environment.AUTH_EMAIL_HASH_KEY,
            ),
          );
          return createClerkProxy({
            issuer: auth.environment.CLERK_ISSUER,
            proxyUrl: auth.environment.CLERK_PROXY_URL,
            secret: auth.environment.CLERK_SECRET_KEY,
            timeoutMs: auth.environment.CLERK_TIMEOUT_MS,
            begin: (input) => store.beginTotpProofOperation(input),
            verify: (token) => verifier.verify(token),
            complete: (input) => store.completeTotpProofOperation(input),
            status: (input) => store.totpProofOperationStatus(input),
          });
        })()
      : undefined;
  app.use(
    "/v1/clerk",
    (
      request: IncomingMessage,
      response: import("node:http").ServerResponse,
    ) => {
      if (!proxy) {
        response.writeHead(503).end();
        return;
      }
      void proxy(request, response);
    },
  );
  app.useBodyParser("raw", {
    limit: "64kb",
    type: (request: IncomingMessage) =>
      request.method === "POST" &&
      (request.url?.split("?")[0] === "/v1/webhooks/clerk" ||
        request.url?.split("?")[0] === "/v1/webhooks/stripe") &&
      request.headers["content-type"]?.split(";")[0]?.trim() ===
        "application/json",
  });
  app.useBodyParser("json", { limit: "32kb" });
  app.useBodyParser("raw", {
    limit: MAX_CSV_BYTES,
    type: (request: IncomingMessage) =>
      request.method === "POST" &&
      /^\/v1\/households\/[a-f0-9-]{36}\/imports\/(?:inspect|preview)(?:\?.*)?$/i.test(
        request.url ?? "",
      ) &&
      request.headers["content-type"]?.split(";")[0]?.trim() === "text/csv",
  });
  app.useGlobalFilters(new HttpErrorFilter());
  return app;
}
