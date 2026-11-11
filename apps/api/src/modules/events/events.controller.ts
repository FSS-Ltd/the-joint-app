import type { ServerResponse } from "node:http";
import {
  Controller,
  Get,
  Headers,
  Query,
  Res,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import { statusSubscriptionSchema } from "@joint/contracts";
import { validateInput } from "../../http-input.js";
import type { StatusEventHub } from "./status-hub.js";
import type { StatusResources } from "./status-resources.js";
import { openStatusStream } from "./status-stream.js";

export function createEventsController(services?: {
  source: Pick<StatusEventHub, "subscribe" | "forSpending">;
  resources: Pick<StatusResources, "read">;
}): Type<unknown> {
  @Controller("v1/events")
  class EventsController {
    @Get()
    async subscribe(
      @Headers("authorization") auth: string | undefined,
      @Query() query: unknown,
      @Res() response: ServerResponse,
    ): Promise<void> {
      if (!services) throw new ServiceUnavailableException();
      const selector = validateInput(statusSubscriptionSchema, query);
      await openStatusStream(response, {
        source:
          selector.kind === "spending"
            ? services.source.forSpending(selector.householdId)
            : services.source,
        read: () => services.resources.read(selector, auth),
      });
    }
  }
  return EventsController;
}
