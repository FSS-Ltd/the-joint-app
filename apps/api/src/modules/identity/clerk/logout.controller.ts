import {
  Controller,
  Header,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  type Type,
} from "@nestjs/common";
import type { ClerkLogout } from "./logout.service.js";

export function createClerkLogoutController(
  logout?: ClerkLogout,
): Type<unknown> {
  @Controller("v1/auth/logout")
  class ClerkLogoutController {
    @Post("retry")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    retry(@Headers("x-logout-cleanup") ticket: string | undefined) {
      if (!logout) throw new ServiceUnavailableException();
      if (
        !ticket ||
        ticket.length > 4096 ||
        !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)
      )
        throw new UnauthorizedException();
      return logout.retry(ticket);
    }
  }
  return ClerkLogoutController;
}
