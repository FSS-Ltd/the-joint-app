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
  Post,
  Put,
  ServiceUnavailableException,
  UnauthorizedException,
  type Type,
} from "@nestjs/common";
import {
  approveDeviceRequestSchema,
  companionClaimRequestSchema,
  companionCompleteRequestSchema,
  companionPermitRequestSchema,
  companionRenewRequestSchema,
  completePairingRequestSchema,
  createInsightJobRequestSchema,
  deviceSessionRequestSchema,
  idempotencyKeySchema,
  sessionChallengeRequestSchema,
  startPairingRequestSchema,
  updateDeviceAccountGrantsRequestSchema,
  type CompanionClaimResponse,
  type CompanionCompleteResponse,
  type CompanionEvidenceResponse,
  type CompanionPermitResponse,
  type CompanionRenewResponse,
  type CompletePairingResponse,
  type DeviceAccountGrantDto,
  type DeviceDto,
  type DeviceSessionResponse,
  type InsightJobDto,
  type SessionChallengeResponse,
  type StartPairingResponse,
} from "@joint/contracts";
import { readIdentityToken } from "../../identity-header.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { DevicesService } from "./devices.service.js";
import type { DeviceAuthService } from "./device-auth.service.js";
import type { InsightJobsService } from "./insight-jobs.service.js";

export interface DevicesControllersOptions {
  readonly identity: IdentityAccess;
  readonly devices: DevicesService;
  readonly deviceAuth: DeviceAuthService;
  readonly insightJobs: InsightJobsService;
}

export function createDevicesController(
  options?: DevicesControllersOptions,
): Type<unknown> {
  @Controller("v1/households/:householdId/devices")
  class DevicesController {
    @Get()
    @Header("Cache-Control", "no-store")
    async listDevices(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
    ): Promise<DeviceDto[]> {
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success) throw new BadRequestException("Invalid household ID.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return options.devices.listDevices(context);
    }

    @Post("pairing")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async startPairing(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Body() body: unknown,
    ): Promise<StartPairingResponse> {
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success) throw new BadRequestException("Invalid household ID.");
      const req = startPairingRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid pairing request payload.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return options.devices.startPairing(context, req.data);
    }

    @Post(":deviceId/approve")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async approveDevice(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("deviceId") deviceId: string,
      @Body() body: unknown,
    ): Promise<DeviceDto> {
      const hId = idempotencyKeySchema.safeParse(householdId);
      const dId = idempotencyKeySchema.safeParse(deviceId);
      if (!hId.success || !dId.success)
        throw new BadRequestException("Invalid ID parameter.");
      const req = approveDeviceRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid approve request payload.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        hId.data,
      );
      return options.devices.approveDevice(context, dId.data, req.data);
    }

    @Get(":deviceId/account-grants")
    @Header("Cache-Control", "no-store")
    async getAccountGrants(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("deviceId") deviceId: string,
    ): Promise<DeviceAccountGrantDto[]> {
      const hId = idempotencyKeySchema.safeParse(householdId);
      const dId = idempotencyKeySchema.safeParse(deviceId);
      if (!hId.success || !dId.success)
        throw new BadRequestException("Invalid ID parameter.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        hId.data,
      );
      return options.devices.getDeviceAccountGrants(context, dId.data);
    }

    @Put(":deviceId/account-grants")
    @Header("Cache-Control", "no-store")
    async updateAccountGrants(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("deviceId") deviceId: string,
      @Body() body: unknown,
    ): Promise<DeviceAccountGrantDto[]> {
      const hId = idempotencyKeySchema.safeParse(householdId);
      const dId = idempotencyKeySchema.safeParse(deviceId);
      if (!hId.success || !dId.success)
        throw new BadRequestException("Invalid ID parameter.");
      const req = updateDeviceAccountGrantsRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid grants request payload.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        hId.data,
      );
      return options.devices.updateDeviceAccountGrants(
        context,
        dId.data,
        req.data,
      );
    }

    @Delete(":deviceId")
    @HttpCode(204)
    @Header("Cache-Control", "no-store")
    async revokeDevice(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("deviceId") deviceId: string,
    ): Promise<void> {
      const hId = idempotencyKeySchema.safeParse(householdId);
      const dId = idempotencyKeySchema.safeParse(deviceId);
      if (!hId.success || !dId.success)
        throw new BadRequestException("Invalid ID parameter.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        hId.data,
      );
      return options.devices.revokeDevice(context, dId.data);
    }
  }

  return DevicesController;
}

export function createInsightJobsController(
  options?: DevicesControllersOptions,
): Type<unknown> {
  @Controller("v1/households/:householdId/insights/jobs")
  class InsightJobsController {
    @Post()
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async createJob(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Body() body: unknown,
    ): Promise<InsightJobDto> {
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success) throw new BadRequestException("Invalid household ID.");
      const req = createInsightJobRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid create job request payload.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return options.insightJobs.createJob(context, req.data);
    }

    @Get()
    @Header("Cache-Control", "no-store")
    async listJobs(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
    ): Promise<InsightJobDto[]> {
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success) throw new BadRequestException("Invalid household ID.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return options.insightJobs.listJobs(context);
    }

    @Get(":jobId")
    @Header("Cache-Control", "no-store")
    async getJob(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("jobId") jobId: string,
    ): Promise<InsightJobDto> {
      const hId = idempotencyKeySchema.safeParse(householdId);
      const jId = idempotencyKeySchema.safeParse(jobId);
      if (!hId.success || !jId.success)
        throw new BadRequestException("Invalid ID parameter.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        hId.data,
      );
      return options.insightJobs.getJob(context, jId.data);
    }

    @Delete(":jobId")
    @Header("Cache-Control", "no-store")
    async cancelJob(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("jobId") jobId: string,
    ): Promise<InsightJobDto> {
      const hId = idempotencyKeySchema.safeParse(householdId);
      const jId = idempotencyKeySchema.safeParse(jobId);
      if (!hId.success || !jId.success)
        throw new BadRequestException("Invalid ID parameter.");
      if (!options) throw new ServiceUnavailableException();

      const context = await options.identity.financeContext(
        readIdentityToken(auth),
        hId.data,
      );
      return options.insightJobs.cancelJob(context, jId.data);
    }
  }

  return InsightJobsController;
}

export function createCompanionController(
  options?: DevicesControllersOptions,
): Type<unknown> {
  @Controller("v1/companion")
  class CompanionController {
    @Post("pairing/complete")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async completePairing(
      @Body() body: unknown,
    ): Promise<CompletePairingResponse> {
      const req = completePairingRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid complete pairing payload.");
      if (!options) throw new ServiceUnavailableException();

      return options.deviceAuth.completePairing(req.data);
    }

    @Post("session/challenge")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async sessionChallenge(
      @Body() body: unknown,
    ): Promise<SessionChallengeResponse> {
      const req = sessionChallengeRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid challenge request payload.");
      if (!options) throw new ServiceUnavailableException();

      return options.deviceAuth.createSessionChallenge(req.data);
    }

    @Post("session")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async session(@Body() body: unknown): Promise<DeviceSessionResponse> {
      const req = deviceSessionRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid session request payload.");
      if (!options) throw new ServiceUnavailableException();

      return options.deviceAuth.authenticateSession(req.data);
    }

    @Post("jobs/claim")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async claim(
      @Headers("x-device-session") token: string | undefined,
      @Body() body: unknown,
    ): Promise<CompanionClaimResponse> {
      if (!token)
        throw new UnauthorizedException("Missing X-Device-Session header.");
      const req = companionClaimRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid claim request payload.");
      if (!options) throw new ServiceUnavailableException();

      const deviceContext =
        await options.deviceAuth.authenticateDeviceToken(token);
      return options.insightJobs.claimJob(deviceContext, req.data);
    }

    @Get("jobs/:jobId/evidence")
    @Header("Cache-Control", "no-store")
    async evidence(
      @Headers("x-device-session") token: string | undefined,
      @Param("jobId") jobId: string,
    ): Promise<CompanionEvidenceResponse> {
      if (!token)
        throw new UnauthorizedException("Missing X-Device-Session header.");
      const jId = idempotencyKeySchema.safeParse(jobId);
      if (!jId.success) throw new BadRequestException("Invalid job ID.");
      if (!options) throw new ServiceUnavailableException();

      const deviceContext =
        await options.deviceAuth.authenticateDeviceToken(token);
      return options.insightJobs.getEvidenceEnvelope(deviceContext, jId.data);
    }

    @Post("jobs/:jobId/permit")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async permit(
      @Headers("x-device-session") token: string | undefined,
      @Param("jobId") jobId: string,
      @Body() body: unknown,
    ): Promise<CompanionPermitResponse> {
      if (!token)
        throw new UnauthorizedException("Missing X-Device-Session header.");
      const jId = idempotencyKeySchema.safeParse(jobId);
      if (!jId.success) throw new BadRequestException("Invalid job ID.");
      const req = companionPermitRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid permit request payload.");
      if (!options) throw new ServiceUnavailableException();

      const deviceContext =
        await options.deviceAuth.authenticateDeviceToken(token);
      return options.insightJobs.checkPermit(deviceContext, jId.data, req.data);
    }

    @Post("jobs/:jobId/renew")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async renew(
      @Headers("x-device-session") token: string | undefined,
      @Param("jobId") jobId: string,
      @Body() body: unknown,
    ): Promise<CompanionRenewResponse> {
      if (!token)
        throw new UnauthorizedException("Missing X-Device-Session header.");
      const jId = idempotencyKeySchema.safeParse(jobId);
      if (!jId.success) throw new BadRequestException("Invalid job ID.");
      const req = companionRenewRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid renew request payload.");
      if (!options) throw new ServiceUnavailableException();

      const deviceContext =
        await options.deviceAuth.authenticateDeviceToken(token);
      return options.insightJobs.renewLease(deviceContext, jId.data, req.data);
    }

    @Post("jobs/:jobId/complete")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async complete(
      @Headers("x-device-session") token: string | undefined,
      @Param("jobId") jobId: string,
      @Body() body: unknown,
    ): Promise<CompanionCompleteResponse> {
      if (!token)
        throw new UnauthorizedException("Missing X-Device-Session header.");
      const jId = idempotencyKeySchema.safeParse(jobId);
      if (!jId.success) throw new BadRequestException("Invalid job ID.");
      const req = companionCompleteRequestSchema.safeParse(body);
      if (!req.success)
        throw new BadRequestException("Invalid complete request payload.");
      if (!options) throw new ServiceUnavailableException();

      const deviceContext =
        await options.deviceAuth.authenticateDeviceToken(token);
      return options.insightJobs.completeJob(deviceContext, jId.data, req.data);
    }
  }

  return CompanionController;
}
