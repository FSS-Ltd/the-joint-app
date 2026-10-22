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
export async function createApplication(
  database: DatabaseConnection,
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
  @Module({ controllers: [HealthController] })
  class ApplicationModule {}
  const app = await NestFactory.create(ApplicationModule, { logger: false });
  return app;
}
