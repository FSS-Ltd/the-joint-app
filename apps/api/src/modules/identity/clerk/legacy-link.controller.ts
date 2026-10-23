import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import { mfaCodeSchema } from "@joint/contracts";
import { readIdentityToken } from "../../../identity-header.js";
import type { ClerkLegacyLinker } from "./legacy-linker.js";

export function createLegacyLinkController(
  linker?: ClerkLegacyLinker,
): Type<unknown> {
  @Controller("v1/auth")
  class LegacyLinkController {
    @Post("link-legacy")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    link(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
      @Headers("x-legacy-session") legacy: string | undefined,
    ) {
      if (!linker) throw new ServiceUnavailableException();
      const value = mfaCodeSchema.safeParse(body);
      if (
        !value.success ||
        value.data.factorId !== "clerk_totp" ||
        !legacy ||
        !/^[A-Za-z0-9_-]{43}$/.test(legacy)
      )
        throw new BadRequestException();
      return linker.link(
        readIdentityToken(authorization),
        legacy,
        value.data.code,
      );
    }
  }
  return LegacyLinkController;
}
