import "reflect-metadata";
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
import type { DatabaseConnection } from "@joint/database";
import type { HealthResponse } from "@joint/contracts";
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
  app.useBodyParser("json", { limit: "32kb" });
  app.useGlobalFilters(new HttpErrorFilter());
  return app;
}
