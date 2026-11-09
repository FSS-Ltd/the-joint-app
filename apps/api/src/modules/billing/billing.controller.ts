import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  createCheckoutSessionRequestSchema,
  createPortalSessionRequestSchema,
  idempotencyKeySchema,
  type CreateCheckoutSessionResponse,
  type CreatePortalSessionResponse,
  type HouseholdSubscriptionResponse,
} from "@joint/contracts";
import { readIdentityToken } from "../../identity-header.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { BillingService } from "./billing.service.js";

export interface BillingControllersOptions {
  readonly identity: IdentityAccess;
  readonly billing: BillingService;
}

export function createBillingController(
  options?: BillingControllersOptions,
): Type<unknown> {
  @Controller("v1/households/:householdId/billing")
  class BillingController {
    @Get("subscription")
    @Header("Cache-Control", "no-store")
    async getSubscription(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
    ): Promise<HouseholdSubscriptionResponse> {
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success) throw new BadRequestException("Invalid household ID.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return options.billing.getHouseholdSubscription(context);
    }

    @Post("checkout")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async createCheckout(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Body() body: unknown,
    ): Promise<CreateCheckoutSessionResponse> {
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success) throw new BadRequestException("Invalid household ID.");
      const parse = createCheckoutSessionRequestSchema.safeParse(body);
      if (!parse.success)
        throw new BadRequestException("Invalid checkout request.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return options.billing.createCheckoutSession(context, parse.data);
    }

    @Post("portal")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async createPortal(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Body() body: unknown,
    ): Promise<CreatePortalSessionResponse> {
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success) throw new BadRequestException("Invalid household ID.");
      const parse = createPortalSessionRequestSchema.safeParse(body);
      if (!parse.success)
        throw new BadRequestException("Invalid portal request.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return options.billing.createPortalSession(context, parse.data);
    }
  }

  return BillingController;
}

export function createBillingWebhooksController(
  billing?: BillingService,
): Type<unknown> {
  @Controller("v1/webhooks")
  class BillingWebhooksController {
    @Post("stripe")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async receiveStripe(
      @Body() rawBody: Buffer | string | unknown,
      @Headers("stripe-signature") signature: string | undefined,
    ) {
      if (!billing) throw new ServiceUnavailableException();
      const payload =
        Buffer.isBuffer(rawBody) || typeof rawBody === "string"
          ? rawBody
          : JSON.stringify(rawBody);
      return billing.processStripeWebhook(payload, signature);
    }

    @Post("revenuecat")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async receiveRevenueCat(
      @Body() body: unknown,
      @Headers("authorization") auth: string | undefined,
    ) {
      if (!billing) throw new ServiceUnavailableException();
      return billing.processRevenueCatWebhook(body, auth);
    }
  }

  return BillingWebhooksController;
}
