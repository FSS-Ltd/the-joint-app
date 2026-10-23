import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import type { ClerkWebhookService } from "./webhook-service.js";
import { verifyClerkWebhook } from "./webhook-verifier.js";

export function createClerkWebhookController(
  service?: ClerkWebhookService,
  configuration?: { signingSecret: string; instanceId: string },
): Type<unknown> {
  @Controller("v1/webhooks/clerk")
  class ClerkWebhookController {
    @Post()
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async receive(
      @Body() body: unknown,
      @Headers() headers: Record<string, string | string[] | undefined>,
    ) {
      if (!service || !configuration) throw new ServiceUnavailableException();
      await service.apply(
        await verifyClerkWebhook(body, headers, configuration),
      );
      return { received: true };
    }
  }
  return ClerkWebhookController;
}
