import {
  Controller,
  Get,
  Header,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";
import type { Type } from "@nestjs/common";
import type { BootstrapResponse } from "@joint/contracts";
import type { BootstrapService } from "./bootstrap.service.js";

export function createBootstrapController(
  service?: BootstrapService,
): Type<unknown> {
  @Controller("v1/bootstrap")
  class BootstrapController {
    @Get()
    @Header("Cache-Control", "no-store")
    read(
      @Headers("authorization") authorization: string | undefined,
    ): Promise<BootstrapResponse> {
      if (!service) throw new UnauthorizedException();
      return service.read(authorization);
    }
  }
  return BootstrapController;
}
