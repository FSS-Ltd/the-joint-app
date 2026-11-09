import { describe, expect, it, beforeEach } from "vitest";
import {
  computeFingerprint,
  decryptEvidenceEnvelope,
  encryptEvidenceEnvelope,
  generatePairingCode,
  generateTestKeyPair,
  signWithPrivateKey,
  verifyDeviceSignature,
} from "../apps/api/src/modules/devices/device-crypto.js";
import { DevicesService } from "../apps/api/src/modules/devices/devices.service.js";
import { DeviceAuthService } from "../apps/api/src/modules/devices/device-auth.service.js";
import { InsightJobsService } from "../apps/api/src/modules/devices/insight-jobs.service.js";
import { maintainCompanionJobs } from "../apps/worker/src/companion-maintenance.js";
import type { AuthContext } from "../packages/contracts/src/index.js";
import type { PrismaClient } from "../packages/database/dist/client.js";
import type { EntitlementService } from "../apps/api/src/modules/entitlements/entitlement.service.js";

interface MockDevice {
  id: string;
  householdId: string;
  name: string;
  fingerprint: string;
  publicKey: string;
  keyVersion: number;
  status: "PENDING" | "APPROVED" | "REVOKED";
  pairedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
}

interface MockPairingCode {
  id: string;
  householdId: string;
  code: string;
  fingerprint: string;
  createdBy: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  deviceId?: string | null;
}

interface MockSession {
  id: string;
  deviceId: string;
  tokenHash: string;
  nonce: string | null;
  nonceExpiresAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  device?: MockDevice;
}

interface MockGrant {
  id: string;
  deviceId: string;
  accountId: string;
  ownerUserId: string;
  permission: "NONE" | "TOTALS" | "TRANSACTIONS";
  createdAt: Date;
  updatedAt: Date;
  account?: MockAccount;
}

interface MockAccount {
  id: string;
  householdId: string;
  creatorUserId: string;
  label: string;
  currency: string;
  balances: { amountMinor: bigint; asOfDate: Date }[];
  transactions: {
    id: string;
    amountMinor: bigint;
    description: string;
    bookedDate: Date;
  }[];
}

interface MockJob {
  id: string;
  householdId: string;
  requesterUserId: string;
  audienceScope: string;
  status: string;
  featureType: string;
  parameters: unknown;
  promptCiphertext: string | null;
  assignedDeviceId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  leaseRenewals: number;
  attempts: number;
  maxAttempts: number;
  evidenceHash: string | null;
  resultPayload: unknown;
  grantVersion: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

interface MockDb {
  device: {
    findMany: (args: {
      where?: { householdId?: string; status?: { in: string[] } };
    }) => Promise<MockDevice[]>;
    findFirst: (args: {
      where: {
        id?: string;
        householdId?: string;
        fingerprint?: string;
      };
    }) => Promise<MockDevice | null>;
    count: (args: {
      where?: { householdId?: string; status?: string };
    }) => Promise<number>;
    create: (args: {
      data: Omit<
        MockDevice,
        "id" | "createdAt" | "updatedAt" | "lastSeenAt" | "keyVersion"
      >;
    }) => Promise<MockDevice>;
    update: (args: {
      where: { id: string };
      data: Partial<MockDevice>;
    }) => Promise<MockDevice>;
  };
  devicePairingCode: {
    create: (args: {
      data: Omit<MockPairingCode, "id" | "createdAt" | "consumedAt">;
    }) => Promise<MockPairingCode>;
    findFirst: (args: {
      where: {
        code?: string;
        consumedAt?: null;
        expiresAt?: { gt: Date };
      };
    }) => Promise<MockPairingCode | null>;
    update: (args: {
      where: { id: string };
      data: Partial<MockPairingCode>;
    }) => Promise<MockPairingCode>;
  };
  deviceSession: {
    create: (args: {
      data: Omit<MockSession, "id" | "createdAt" | "revokedAt">;
    }) => Promise<MockSession>;
    findFirst: (args: {
      where: {
        deviceId?: string;
        nonce?: string;
        tokenHash?: string;
        revokedAt?: null;
        nonceExpiresAt?: { gt: Date };
        expiresAt?: { gt: Date };
      };
      include?: { device?: boolean };
    }) => Promise<MockSession | null>;
    update: (args: {
      where: { id: string };
      data: Partial<MockSession>;
    }) => Promise<MockSession>;
    updateMany: (args: {
      where: { deviceId?: string; revokedAt?: null };
      data: Partial<MockSession>;
    }) => Promise<{ count: number }>;
    deleteMany: (args: {
      where: {
        nonce?: { not: null };
        nonceExpiresAt?: { lt: Date };
        tokenHash?: { startsWith: string };
      };
    }) => Promise<{ count: number }>;
  };
  deviceAccountGrant: {
    findMany: (args: {
      where?: {
        deviceId?: string;
        ownerUserId?: string;
        permission?: { in: string[] };
      };
      include?: { account?: boolean };
    }) => Promise<MockGrant[]>;
    upsert: (args: {
      where: {
        deviceId_accountId: { deviceId: string; accountId: string };
      };
      create: Omit<MockGrant, "id" | "createdAt" | "updatedAt">;
      update: Partial<MockGrant>;
    }) => Promise<MockGrant>;
  };
  account: {
    findMany: (args: {
      where?: {
        id?: { in: string[] };
        householdId?: string;
        creatorUserId?: string;
        archivedAt?: null;
      };
      select?: { id?: boolean };
    }) => Promise<MockAccount[]>;
  };
  insightJob: {
    create: (args: {
      data: {
        householdId: string;
        requesterUserId: string;
        audienceScope: string;
        featureType: string;
        parameters: unknown;
        promptCiphertext: string | null;
        expiresAt: Date;
        status: string;
      };
    }) => Promise<MockJob>;
    findMany: (args: {
      where?: {
        householdId?: string;
        status?: string;
        leaseExpiresAt?: { lt: Date };
        OR?: Array<{ audienceScope?: string; requesterUserId?: string }>;
      };
      take?: number;
    }) => Promise<MockJob[]>;
    findFirst: (args: {
      where: {
        id?: string;
        householdId?: string;
        status?: string;
        assignedDeviceId?: string;
        leaseToken?: string;
        expiresAt?: { gt: Date };
      };
    }) => Promise<MockJob | null>;
    update: (args: {
      where: { id: string };
      data: Partial<MockJob> & {
        attempts?: { increment: number };
        leaseRenewals?: { increment: number };
        grantVersion?: { increment: number };
      };
    }) => Promise<MockJob>;
    updateMany: (args: {
      where: {
        householdId?: string;
        status?: { in: string[] } | string;
        assignedDeviceId?: string;
        expiresAt?: { lt: Date };
      };
      data: Partial<MockJob> & {
        grantVersion?: { increment: number };
      };
    }) => Promise<{ count: number }>;
  };
  $transaction: (cb: (tx: MockDb) => Promise<unknown>) => Promise<unknown>;
  _setAccounts: (accs: MockAccount[]) => void;
  _getJobs: () => MockJob[];
}

function createInMemoryDatabase(): MockDb {
  const devices: MockDevice[] = [];
  const pairingCodes: MockPairingCode[] = [];
  let sessions: MockSession[] = [];
  const grants: MockGrant[] = [];
  const jobs: MockJob[] = [];
  let accounts: MockAccount[] = [];

  const db: MockDb = {
    device: {
      findMany: async (args) => {
        let res = devices;
        if (args.where?.householdId) {
          res = res.filter((d) => d.householdId === args.where!.householdId);
        }
        if (args.where?.status?.in) {
          res = res.filter((d) => args.where!.status!.in.includes(d.status));
        }
        return res;
      },
      findFirst: async (args) => {
        return (
          devices.find((d) => {
            if (args.where.id && d.id !== args.where.id) return false;
            if (
              args.where.householdId &&
              d.householdId !== args.where.householdId
            )
              return false;
            if (
              args.where.fingerprint &&
              d.fingerprint !== args.where.fingerprint
            )
              return false;
            return true;
          }) ?? null
        );
      },
      count: async (args) => {
        return devices.filter(
          (d) =>
            (!args.where?.householdId ||
              d.householdId === args.where.householdId) &&
            (!args.where?.status || d.status === args.where.status),
        ).length;
      },
      create: async (args) => {
        const item: MockDevice = {
          id: "dev-" + Math.random().toString(36).slice(2, 9),
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSeenAt: null,
          keyVersion: 1,
        };
        devices.push(item);
        return item;
      },
      update: async (args) => {
        const idx = devices.findIndex((d) => d.id === args.where.id);
        if (idx === -1) throw new Error("Device not found");
        devices[idx] = {
          ...devices[idx]!,
          ...args.data,
          updatedAt: new Date(),
        };
        return devices[idx]!;
      },
    },
    devicePairingCode: {
      create: async (args) => {
        const item: MockPairingCode = {
          id: "pair-" + Math.random().toString(36).slice(2, 9),
          ...args.data,
          createdAt: new Date(),
          consumedAt: null,
        };
        pairingCodes.push(item);
        return item;
      },
      findFirst: async (args) => {
        return (
          pairingCodes.find((p) => {
            if (args.where.code && p.code !== args.where.code) return false;
            if (args.where.consumedAt === null && p.consumedAt !== null)
              return false;
            if (args.where.expiresAt?.gt && p.expiresAt <= new Date())
              return false;
            return true;
          }) ?? null
        );
      },
      update: async (args) => {
        const idx = pairingCodes.findIndex((p) => p.id === args.where.id);
        if (idx === -1) throw new Error("Pairing code not found");
        pairingCodes[idx] = { ...pairingCodes[idx]!, ...args.data };
        return pairingCodes[idx]!;
      },
    },
    deviceSession: {
      create: async (args) => {
        const item: MockSession = {
          id: "sess-" + Math.random().toString(36).slice(2, 9),
          ...args.data,
          revokedAt: null,
          createdAt: new Date(),
        };
        sessions.push(item);
        return item;
      },
      findFirst: async (args) => {
        const found = sessions.find((s) => {
          if (args.where.deviceId && s.deviceId !== args.where.deviceId)
            return false;
          if (args.where.nonce && s.nonce !== args.where.nonce) return false;
          if (args.where.tokenHash && s.tokenHash !== args.where.tokenHash)
            return false;
          if (args.where.revokedAt === null && s.revokedAt !== null)
            return false;
          if (args.where.nonceExpiresAt?.gt && s.nonceExpiresAt <= new Date())
            return false;
          if (args.where.expiresAt?.gt && s.expiresAt <= new Date())
            return false;
          return true;
        });
        if (!found) return null;
        if (args.include?.device) {
          const device = devices.find((d) => d.id === found.deviceId);
          return { ...found, device };
        }
        return found;
      },
      update: async (args) => {
        const idx = sessions.findIndex((s) => s.id === args.where.id);
        if (idx === -1) throw new Error("Session not found");
        sessions[idx] = { ...sessions[idx]!, ...args.data };
        return sessions[idx]!;
      },
      updateMany: async (args) => {
        let count = 0;
        for (let i = 0; i < sessions.length; i++) {
          if (
            (!args.where.deviceId ||
              sessions[i]!.deviceId === args.where.deviceId) &&
            (args.where.revokedAt === null
              ? sessions[i]!.revokedAt === null
              : true)
          ) {
            sessions[i] = { ...sessions[i]!, ...args.data };
            count++;
          }
        }
        return { count };
      },
      deleteMany: async (args) => {
        const before = sessions.length;
        sessions = sessions.filter((s) => {
          if (args.where.nonce && !s.nonce) return true;
          if (args.where.nonceExpiresAt?.lt && s.nonceExpiresAt >= new Date())
            return true;
          return false;
        });
        return { count: before - sessions.length };
      },
    },
    deviceAccountGrant: {
      findMany: async (args) => {
        let res = grants;
        if (args.where?.deviceId) {
          res = res.filter((g) => g.deviceId === args.where!.deviceId);
        }
        if (args.where?.ownerUserId) {
          res = res.filter((g) => g.ownerUserId === args.where!.ownerUserId);
        }
        if (args.where?.permission?.in) {
          res = res.filter((g) =>
            args.where!.permission!.in.includes(g.permission),
          );
        }
        if (args.include?.account) {
          res = res.map((g) => {
            const acc = accounts.find((a) => a.id === g.accountId);
            return { ...g, account: acc };
          });
        }
        return res;
      },
      upsert: async (args) => {
        const idx = grants.findIndex(
          (g) =>
            g.deviceId === args.where.deviceId_accountId.deviceId &&
            g.accountId === args.where.deviceId_accountId.accountId,
        );
        if (idx >= 0) {
          grants[idx] = {
            ...grants[idx]!,
            ...args.update,
            updatedAt: new Date(),
          };
          return grants[idx]!;
        }
        const created: MockGrant = {
          id: "grant-" + Math.random().toString(36).slice(2, 9),
          ...args.create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        grants.push(created);
        return created;
      },
    },
    account: {
      findMany: async (args) => {
        return accounts.filter((a) => {
          if (args.where?.id?.in && !args.where.id.in.includes(a.id))
            return false;
          if (
            args.where?.householdId &&
            a.householdId !== args.where.householdId
          )
            return false;
          if (
            args.where?.creatorUserId &&
            a.creatorUserId !== args.where.creatorUserId
          )
            return false;
          return true;
        });
      },
    },
    insightJob: {
      create: async (args) => {
        const item: MockJob = {
          id: "job-" + Math.random().toString(36).slice(2, 9),
          ...args.data,
          assignedDeviceId: null,
          leaseToken: null,
          leaseExpiresAt: null,
          leaseRenewals: 0,
          attempts: 0,
          maxAttempts: 2,
          evidenceHash: null,
          resultPayload: null,
          grantVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        jobs.push(item);
        return item;
      },
      findMany: async (args) => {
        let res = jobs;
        if (args.where?.householdId) {
          res = res.filter((j) => j.householdId === args.where!.householdId);
        }
        if (args.where?.status === "LEASED" && args.where?.leaseExpiresAt?.lt) {
          res = res.filter(
            (j) => j.status === "LEASED" && j.leaseExpiresAt! < new Date(),
          );
        }
        if (args.take) res = res.slice(0, args.take);
        return res;
      },
      findFirst: async (args) => {
        return (
          jobs.find((j) => {
            if (args.where.id && j.id !== args.where.id) return false;
            if (
              args.where.householdId &&
              j.householdId !== args.where.householdId
            )
              return false;
            if (args.where.status && j.status !== args.where.status)
              return false;
            if (
              args.where.assignedDeviceId &&
              j.assignedDeviceId !== args.where.assignedDeviceId
            )
              return false;
            if (args.where.leaseToken && j.leaseToken !== args.where.leaseToken)
              return false;
            if (args.where.expiresAt?.gt && j.expiresAt <= new Date())
              return false;
            return true;
          }) ?? null
        );
      },
      update: async (args) => {
        const idx = jobs.findIndex((j) => j.id === args.where.id);
        if (idx === -1) throw new Error("Job not found");
        const current = jobs[idx]!;
        const updated: MockJob = {
          ...current,
          ...args.data,
          attempts:
            args.data.attempts?.increment !== undefined
              ? current.attempts + args.data.attempts.increment
              : (args.data.attempts ?? current.attempts),
          leaseRenewals:
            args.data.leaseRenewals?.increment !== undefined
              ? current.leaseRenewals + args.data.leaseRenewals.increment
              : (args.data.leaseRenewals ?? current.leaseRenewals),
          grantVersion:
            args.data.grantVersion?.increment !== undefined
              ? current.grantVersion + args.data.grantVersion.increment
              : (args.data.grantVersion ?? current.grantVersion),
          updatedAt: new Date(),
        };
        jobs[idx] = updated;
        return updated;
      },
      updateMany: async (args) => {
        let count = 0;
        for (let i = 0; i < jobs.length; i++) {
          let match = true;
          if (
            args.where.householdId &&
            jobs[i]!.householdId !== args.where.householdId
          )
            match = false;
          if (
            typeof args.where.status === "object" &&
            args.where.status.in &&
            !args.where.status.in.includes(jobs[i]!.status)
          )
            match = false;
          if (
            args.where.assignedDeviceId &&
            jobs[i]!.assignedDeviceId !== args.where.assignedDeviceId
          )
            match = false;
          if (
            args.where.status === "QUEUED" &&
            args.where.expiresAt?.lt &&
            jobs[i]!.expiresAt >= new Date()
          )
            match = false;

          if (match) {
            jobs[i] = {
              ...jobs[i]!,
              ...args.data,
              grantVersion:
                args.data.grantVersion?.increment !== undefined
                  ? jobs[i]!.grantVersion + args.data.grantVersion.increment
                  : (args.data.grantVersion ?? jobs[i]!.grantVersion),
              updatedAt: new Date(),
            };
            count++;
          }
        }
        return { count };
      },
    },
    $transaction: async (cb) => cb(db),
    _setAccounts: (accs) => {
      accounts = accs;
    },
    _getJobs: () => jobs,
  };

  return db;
}

describe("Companion Protocol, Consent and Background Jobs (IOS13a)", () => {
  let db: MockDb;
  let mockEntitlements: {
    read: () => Promise<{
      plan: string;
      capabilities: string[];
      caps: {
        bankAuthorisations: number;
        brokerConnections: number;
        companionDevices: number;
      };
      effectiveUntil: null;
    }>;
  };
  let devicesService: DevicesService;
  let deviceAuthService: DeviceAuthService;
  let insightJobsService: InsightJobsService;

  const householdId = "11111111-1111-4111-8111-111111111111";
  const userA = "22222222-2222-4222-8222-222222222222";
  const userB = "33333333-3333-4333-8333-333333333333";

  const contextA: AuthContext = {
    userId: userA,
    householdId,
    membershipId: "mem-a",
    sessionId: "sess-a",
    grantVersion: 1,
    requestId: "req-a",
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
  };

  const contextB: AuthContext = {
    userId: userB,
    householdId,
    membershipId: "mem-b",
    sessionId: "sess-b",
    grantVersion: 1,
    requestId: "req-b",
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
  };

  beforeEach(() => {
    db = createInMemoryDatabase();
    mockEntitlements = {
      read: async () => ({
        plan: "PLUS",
        capabilities: ["insights.local", "projections.multi"],
        caps: {
          bankAuthorisations: 4,
          brokerConnections: 2,
          companionDevices: 1,
        },
        effectiveUntil: null,
      }),
    };

    devicesService = new DevicesService(
      db as unknown as PrismaClient,
      mockEntitlements as unknown as EntitlementService,
    );
    deviceAuthService = new DeviceAuthService(db as unknown as PrismaClient);
    insightJobsService = new InsightJobsService(
      db as unknown as PrismaClient,
      mockEntitlements as unknown as EntitlementService,
    );

    // Setup initial accounts for User A and User B
    db._setAccounts([
      {
        id: "acc-a1",
        householdId,
        creatorUserId: userA,
        label: "User A Current",
        currency: "GBP",
        balances: [{ amountMinor: 250000n, asOfDate: new Date() }],
        transactions: [
          {
            id: "tx-1",
            amountMinor: -4500n,
            description: "Groceries",
            bookedDate: new Date(),
          },
        ],
      },
      {
        id: "acc-b1",
        householdId,
        creatorUserId: userB,
        label: "User B Savings",
        currency: "GBP",
        balances: [{ amountMinor: 1000000n, asOfDate: new Date() }],
        transactions: [],
      },
    ]);
  });

  describe("Cryptographic Foundations", () => {
    it("generates 6-digit numeric pairing code", () => {
      const code = generatePairingCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it("computes deterministic SHA-256 fingerprint", () => {
      const fp1 = computeFingerprint("test-public-key");
      const fp2 = computeFingerprint("test-public-key");
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it("signs and verifies data with RSA keypair", () => {
      const keypair = generateTestKeyPair();
      const message = "sample-challenge-nonce";
      const signature = signWithPrivateKey(keypair.privateKey, message);

      const isValid = verifyDeviceSignature(
        keypair.publicKey,
        message,
        signature,
      );
      expect(isValid).toBe(true);

      const isInvalid = verifyDeviceSignature(
        keypair.publicKey,
        "tampered-message",
        signature,
      );
      expect(isInvalid).toBe(false);
    });

    it("encrypts and decrypts evidence envelope with AAD context binding", () => {
      const symmetricKey = Buffer.alloc(32, 7);
      const data = { balance: "2500.00", items: [1, 2, 3] };
      const aad = "job-1:dev-1:HOUSEHOLD:1";

      const envelope = encryptEvidenceEnvelope(data, aad, symmetricKey);
      expect(envelope.envelopeCiphertext).toBeDefined();
      expect(envelope.evidenceHash).toHaveLength(64);

      const decrypted = decryptEvidenceEnvelope(envelope, aad, symmetricKey);
      expect(decrypted).toEqual(data);

      // Tampered AAD context throws error
      expect(() =>
        decryptEvidenceEnvelope(
          envelope,
          "job-1:dev-1:HOUSEHOLD:2",
          symmetricKey,
        ),
      ).toThrow();
    });
  });

  describe("Pairing and Per-Adult Account Consent", () => {
    it("enforces companion entitlement cap during pairing initiation", async () => {
      // Simulate FREE plan
      mockEntitlements.read = async () => ({
        plan: "FREE",
        capabilities: [],
        caps: {
          bankAuthorisations: 0,
          brokerConnections: 0,
          companionDevices: 0,
        },
        effectiveUntil: null,
      });

      await expect(
        devicesService.startPairing(contextA, { name: "MacBook Pro" }),
      ).rejects.toThrow(
        "Household plan does not include companion device pairing.",
      );
    });

    it("completes pairing and requires owner approval", async () => {
      const keypair = generateTestKeyPair();
      const startRes = await devicesService.startPairing(contextA, {
        name: "MacBook Pro",
      });
      expect(startRes.pairingCode).toMatch(/^\d{6}$/);

      const completeRes = await deviceAuthService.completePairing({
        pairingCode: startRes.pairingCode,
        name: "MacBook Pro",
        publicKey: keypair.publicKey,
        proofOfPossession: signWithPrivateKey(
          keypair.privateKey,
          startRes.pairingCode,
        ),
      });

      expect(completeRes.status).toBe("PENDING");
      expect(completeRes.fingerprint).toBe(keypair.fingerprint);

      // Wrong fingerprint approval fails
      await expect(
        devicesService.approveDevice(contextA, completeRes.deviceId, {
          fingerprint:
            "wrong-fingerprint-0000000000000000000000000000000000000",
        }),
      ).rejects.toThrow("Device fingerprint does not match.");

      // Correct fingerprint succeeds
      const approved = await devicesService.approveDevice(
        contextA,
        completeRes.deviceId,
        { fingerprint: keypair.fingerprint },
      );
      expect(approved.status).toBe("APPROVED");
    });

    it("strictly isolates per-adult device account grants", async () => {
      const keypair = generateTestKeyPair();
      const { pairingCode } = await devicesService.startPairing(contextA, {
        name: "Mac Studio",
      });
      const { deviceId } = await deviceAuthService.completePairing({
        pairingCode,
        name: "Mac Studio",
        publicKey: keypair.publicKey,
        proofOfPossession: "valid-proof-longer-than-32-chars-test",
      });
      await devicesService.approveDevice(contextA, deviceId, {
        fingerprint: keypair.fingerprint,
      });

      // User A can configure grants for their own account
      const grantsA = await devicesService.updateDeviceAccountGrants(
        contextA,
        deviceId,
        {
          grants: [{ accountId: "acc-a1", permission: "TRANSACTIONS" }],
        },
      );
      expect(grantsA[0]!.permission).toBe("TRANSACTIONS");
      expect(grantsA[0]!.ownerUserId).toBe(userA);

      // User A CANNOT configure grants for User B's account
      await expect(
        devicesService.updateDeviceAccountGrants(contextA, deviceId, {
          grants: [{ accountId: "acc-b1", permission: "TOTALS" }],
        }),
      ).rejects.toThrow(/User does not have owner authority/);

      // User B configures their own account independently
      const grantsB = await devicesService.updateDeviceAccountGrants(
        contextB,
        deviceId,
        {
          grants: [{ accountId: "acc-b1", permission: "TOTALS" }],
        },
      );
      expect(grantsB[0]!.permission).toBe("TOTALS");
      expect(grantsB[0]!.ownerUserId).toBe(userB);
    });
  });

  describe("Device Session Challenge & Bounded Job Protocol", () => {
    let keypair: ReturnType<typeof generateTestKeyPair>;
    let deviceId: string;
    let deviceToken: string;

    beforeEach(async () => {
      keypair = generateTestKeyPair();
      const { pairingCode } = await devicesService.startPairing(contextA, {
        name: "Mac Mini",
      });
      const paired = await deviceAuthService.completePairing({
        pairingCode,
        name: "Mac Mini",
        publicKey: keypair.publicKey,
        proofOfPossession: signWithPrivateKey(keypair.privateKey, pairingCode),
      });
      deviceId = paired.deviceId;
      await devicesService.approveDevice(contextA, deviceId, {
        fingerprint: keypair.fingerprint,
      });

      // Authenticate device session
      const { nonce } = await deviceAuthService.createSessionChallenge({
        deviceId,
      });
      const signature = signWithPrivateKey(keypair.privateKey, nonce);
      const session = await deviceAuthService.authenticateSession({
        deviceId,
        nonce,
        signature,
      });
      deviceToken = session.sessionToken;

      // User A grants TRANSACTIONS on acc-a1
      await devicesService.updateDeviceAccountGrants(contextA, deviceId, {
        grants: [{ accountId: "acc-a1", permission: "TRANSACTIONS" }],
      });
    });

    it("verifies authenticated device session token", async () => {
      const devContext =
        await deviceAuthService.authenticateDeviceToken(deviceToken);
      expect(devContext.deviceId).toBe(deviceId);
      expect(devContext.householdId).toBe(householdId);
    });

    it("enforces 5-minute lease and scoped evidence snapshot", async () => {
      const devContext =
        await deviceAuthService.authenticateDeviceToken(deviceToken);

      // 1. Create Job
      const createdJob = await insightJobsService.createJob(contextA, {
        audienceScope: "HOUSEHOLD",
        featureType: "SPEND_SUMMARY",
        parameters: { month: "2026-11" },
      });
      expect(createdJob.status).toBe("QUEUED");

      // 2. Companion claims Job
      const claim = await insightJobsService.claimJob(devContext, {
        deviceId,
        maxBatchSize: 1,
      });
      expect(claim.claimedJob).toBeDefined();
      expect(claim.claimedJob!.id).toBe(createdJob.id);
      expect(claim.leaseToken).toBeDefined();
      expect(claim.leaseExpiresAt).toBeDefined();

      // 3. Companion fetches encrypted evidence envelope
      const evidence = await insightJobsService.getEvidenceEnvelope(
        devContext,
        createdJob.id,
      );
      expect(evidence.envelopeCiphertext).toBeDefined();
      expect(evidence.evidenceHash).toBeDefined();

      // 4. Companion checks online execution permit before inference
      const permit = await insightJobsService.checkPermit(
        devContext,
        createdJob.id,
        { leaseToken: claim.leaseToken! },
      );
      expect(permit.permitted).toBe(true);

      // 5. Companion renews lease
      const renew = await insightJobsService.renewLease(
        devContext,
        createdJob.id,
        { leaseToken: claim.leaseToken! },
      );
      expect(renew.renewed).toBe(true);
      expect(renew.renewalsRemaining).toBe(1);

      // 6. Companion completes job with signed result
      const resultPayload = {
        summary: "Total grocery spend is £45.00",
        calculatedAt: "2026-11-09T18:00:00Z",
      };
      const payloadBytes =
        evidence.evidenceHash + ":" + JSON.stringify(resultPayload);
      const signature = signWithPrivateKey(keypair.privateKey, payloadBytes);

      const completion = await insightJobsService.completeJob(
        devContext,
        createdJob.id,
        {
          leaseToken: claim.leaseToken!,
          evidenceHash: evidence.evidenceHash,
          grantVersion: evidence.grantVersion,
          resultPayload,
          signature,
        },
      );
      expect(completion.accepted).toBe(true);
      expect(completion.status).toBe("AVAILABLE");

      // Job is now AVAILABLE with recorded result
      const finalJob = await insightJobsService.getJob(contextA, createdJob.id);
      expect(finalJob.status).toBe("AVAILABLE");
      expect(finalJob.resultPayload).toEqual(resultPayload);
    });

    it("denies completion if account grant changes mid-inference (privacy fence)", async () => {
      const devContext =
        await deviceAuthService.authenticateDeviceToken(deviceToken);

      const job = await insightJobsService.createJob(contextA, {
        audienceScope: "HOUSEHOLD",
        featureType: "SPEND_SUMMARY",
        parameters: {},
      });

      const claim = await insightJobsService.claimJob(devContext, {
        deviceId,
        maxBatchSize: 1,
      });
      const evidence = await insightJobsService.getEvidenceEnvelope(
        devContext,
        job.id,
      );

      // User A revokes grant to acc-a1 mid-run
      await devicesService.updateDeviceAccountGrants(contextA, deviceId, {
        grants: [{ accountId: "acc-a1", permission: "NONE" }],
      });

      // Completion with old grant version is rejected
      const resultPayload = { text: "Stale calculation" };
      const signature = signWithPrivateKey(
        keypair.privateKey,
        evidence.evidenceHash + ":" + JSON.stringify(resultPayload),
      );

      await expect(
        insightJobsService.completeJob(devContext, job.id, {
          leaseToken: claim.leaseToken!,
          evidenceHash: evidence.evidenceHash,
          grantVersion: evidence.grantVersion, // Stale grant version
          resultPayload,
          signature,
        }),
      ).rejects.toThrow(/Account grant version changed during inference/);
    });

    it("revocation terminates active sessions and jobs immediately", async () => {
      const devContext =
        await deviceAuthService.authenticateDeviceToken(deviceToken);
      const job = await insightJobsService.createJob(contextA, {
        audienceScope: "HOUSEHOLD",
        featureType: "SPEND_SUMMARY",
        parameters: {},
      });
      const claim = await insightJobsService.claimJob(devContext, {
        deviceId,
        maxBatchSize: 1,
      });

      // Owner revokes device
      await devicesService.revokeDevice(contextA, deviceId);

      // Session is now rejected
      await expect(
        deviceAuthService.authenticateDeviceToken(deviceToken),
      ).rejects.toThrow("Device session expired or invalid.");

      // Check permit fails
      const permit = await insightJobsService.checkPermit(devContext, job.id, {
        leaseToken: claim.leaseToken!,
      });
      expect(permit.permitted).toBe(false);
      expect(permit.reason).toBe("JOB_REVOKED");
    });

    it("reconciles expired leases and 24h timeouts in worker maintenance", async () => {
      const devContext =
        await deviceAuthService.authenticateDeviceToken(deviceToken);

      // 1. Create job and lease it
      const job1 = await insightJobsService.createJob(contextA, {
        audienceScope: "HOUSEHOLD",
        featureType: "SPEND_SUMMARY",
        parameters: {},
      });
      const claim1 = await insightJobsService.claimJob(devContext, {
        deviceId,
        maxBatchSize: 1,
      });
      expect(claim1.claimedJob).toBeDefined();

      // Simulate lease expiration
      const allJobs = db._getJobs();
      const leased = allJobs.find((j) => j.id === job1.id)!;
      leased.leaseExpiresAt = new Date(Date.now() - 10000); // 10s in past

      // Run worker maintenance
      const report1 = await maintainCompanionJobs(
        db as unknown as PrismaClient,
      );
      expect(report1.recoveredLeases).toBe(1);

      // Job is re-queued for another attempt
      const rechecked1 = db._getJobs().find((j) => j.id === job1.id)!;
      expect(rechecked1.status).toBe("QUEUED");
      expect(rechecked1.leaseToken).toBeNull();

      // 2. Exhaust attempts
      rechecked1.attempts = 2; // maxAttempts reached
      rechecked1.status = "LEASED";
      rechecked1.leaseExpiresAt = new Date(Date.now() - 10000);

      const report2 = await maintainCompanionJobs(
        db as unknown as PrismaClient,
      );
      expect(report2.recoveredLeases).toBe(0);
      const rechecked2 = db._getJobs().find((j) => j.id === job1.id)!;
      expect(rechecked2.status).toBe("FAILED");
    });
  });
});
