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
import type { StatusEventSource } from "./status-observer.js";
import type { StatusResources } from "./status-resources.js";
import { openStatusStream } from "./status-stream.js";

export function createEventsController(services?: {
  source: StatusEventSource;
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
        source: services.source,
        read: () => services.resources.read(selector, auth),
      });
    }
  }
  return EventsController;
}
