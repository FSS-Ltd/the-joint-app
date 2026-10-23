import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  csvMappingSchema,
  idempotencyKeySchema,
  importCommitSchema,
  importListQuerySchema,
  importReviewSchema,
  importRowsQuerySchema,
  MAX_CSV_BYTES,
  quotedVersionSchema,
} from "@joint/contracts";
import type { IdentityAccess } from "../identity/identity.service.js";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { ImportQueries } from "./import-queries.js";
import type { ImportPreview } from "./import-preview.js";
import type { ImportReview } from "./import-review.js";
import type { ImportLifecycle } from "./import-lifecycle.js";

interface Services {
  identity: IdentityAccess;
  queries: ImportQueries;
  preview: ImportPreview;
  review: ImportReview;
  lifecycle: ImportLifecycle;
}
function csvBody(value: unknown): Uint8Array {
  if (
    !Buffer.isBuffer(value) ||
    !value.byteLength ||
    value.byteLength > MAX_CSV_BYTES
  )
    throw new BadRequestException();
  return value;
}
function mappingHeader(value: string | undefined) {
  if (!value || value.length > 8192) throw new BadRequestException();
  try {
    return valid(csvMappingSchema, JSON.parse(decodeURIComponent(value)));
  } catch {
    throw new BadRequestException({ error: { code: "CSV_INVALID_MAPPING" } });
  }
}
export function createImportsController(services?: Services): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/imports")
  class ImportsController {
    @Post("inspect")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async inspect(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("x-account-id") account: string | undefined,
      @Body() body: unknown,
    ) {
      const id = valid(idempotencyKeySchema, account),
        bytes = csvBody(body);
      return use().preview.inspect(
        await financeContext(use().identity, auth, hh),
        id,
        bytes,
      );
    }
    @Post("preview")
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    async preview(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("x-account-id") account: string | undefined,
      @Headers("x-import-mapping") mapping: string | undefined,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const id = valid(idempotencyKeySchema, account),
        input = mappingHeader(mapping),
        requestKey = valid(idempotencyKeySchema, key),
        bytes = csvBody(body);
      return use().preview.preview(
        await financeContext(use().identity, auth, hh),
        id,
        bytes,
        input,
        requestKey,
      );
    }
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Query() query: unknown,
    ) {
      const input = valid(importListQuerySchema, query);
      return use().queries.list(
        await financeContext(use().identity, auth, hh),
        input.accountId,
        input.limit,
        input.cursor,
      );
    }
    @Get(":id")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
    ) {
      return use().queries.read(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
      );
    }
    @Get(":id/rows")
    @Header("Cache-Control", "no-store")
    async rows(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(importRowsQuerySchema, query);
      return use().queries.rows(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input,
      );
    }
    @Patch(":id/review")
    @Header("Cache-Control", "no-store")
    async review(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      const input = valid(importReviewSchema, body),
        expected = valid(quotedVersionSchema, version);
      return use().review.review(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input,
        expected,
      );
    }
    @Post(":id/commit")
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    async commit(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("if-match") version: string | undefined,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const input = valid(importCommitSchema, body),
        expected = valid(quotedVersionSchema, version),
        requestKey = valid(idempotencyKeySchema, key);
      return use().lifecycle.commit(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input.acceptRejectedRows,
        expected,
        requestKey,
      );
    }
    @Delete(":id")
    @Header("Cache-Control", "no-store")
    async rollback(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("if-match") version: string | undefined,
    ) {
      const expected = valid(quotedVersionSchema, version);
      return use().lifecycle.rollback(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        expected,
      );
    }
    @Delete(":id/original")
    @Header("Cache-Control", "no-store")
    async original(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("if-match") version: string | undefined,
    ) {
      const expected = valid(quotedVersionSchema, version);
      return use().lifecycle.deleteOriginal(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        expected,
      );
    }
  }
  return ImportsController;
}
