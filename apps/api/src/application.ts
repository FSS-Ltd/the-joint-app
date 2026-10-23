import "reflect-metadata";
import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import type { DatabaseConnection } from "@joint/database";
import type { HealthResponse } from "@joint/contracts";
import {
  BootstrapService,
  type BootstrapOptions,
} from "./modules/bootstrap/bootstrap.service.js";
import { createBootstrapController } from "./modules/bootstrap/bootstrap.controller.js";
export async function createApplication(
  database: DatabaseConnection,
  bootstrap?: BootstrapOptions,
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
      createBootstrapController(
        bootstrap ? new BootstrapService(bootstrap) : undefined,
      ),
    ],
  })
  class ApplicationModule {}
  const app = await NestFactory.create(ApplicationModule, { logger: false });
  return app;
}
