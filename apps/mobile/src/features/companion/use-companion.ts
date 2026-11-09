import { useCallback, useEffect, useState } from "react";
import type {
  DeviceAccountGrantDto,
  DeviceAccountPermission,
  DeviceDto,
  InsightFeatureType,
  InsightJobDto,
  StartPairingResponse,
} from "@joint/contracts";
import type { DevicesApi } from "../../api/devices";
import type { AccountsApi } from "../../api/accounts";

export interface CompanionStatusNotice {
  readonly text: string;
  readonly tone: "info" | "success" | "warning" | "error";
}

export interface HouseholdAccountItem {
  readonly id: string;
  readonly name: string;
}

export interface UseCompanionOptions {
  readonly householdId: string;
  readonly devicesApi: DevicesApi;
  readonly accountsApi?: AccountsApi;
}

export function useCompanion({
  householdId,
  devicesApi,
  accountsApi,
}: UseCompanionOptions) {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [accounts, setAccounts] = useState<HouseholdAccountItem[]>([]);
  const [pairingState, setPairingState] = useState<StartPairingResponse | null>(
    null,
  );
  const [pairingPending, setPairingPending] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [revocationPending, setRevocationPending] = useState(false);
  const [grants, setGrants] = useState<DeviceAccountGrantDto[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [jobs, setJobs] = useState<InsightJobDto[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [createJobPending, setCreateJobPending] = useState(false);
  const [statusNotice, setStatusNotice] =
    useState<CompanionStatusNotice | null>(null);

  const clearStatusNotice = useCallback(() => setStatusNotice(null), []);

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      const list = await devicesApi.listDevices(householdId);
      setDevices(list);

      const approvedDevice = list.find((d) => d.status === "APPROVED");
      if (approvedDevice) {
        setGrantsLoading(true);
        try {
          const gList = await devicesApi.getAccountGrants(
            householdId,
            approvedDevice.id,
          );
          setGrants(gList);
        } finally {
          setGrantsLoading(false);
        }
      } else {
        setGrants([]);
      }

      setJobsLoading(true);
      try {
        const jList = await devicesApi.listInsightJobs(householdId);
        setJobs(jList);
      } finally {
        setJobsLoading(false);
      }

      if (accountsApi) {
        const accList = await accountsApi.list(
          householdId,
          { limit: 100 },
          new AbortController().signal,
        );
        const owned = accList.items.filter((i) => i.ownership === "OWNED");
        setAccounts(owned.map((i) => ({ id: i.id, name: i.label })));
      }
    } catch (err) {
      setStatusNotice({
        text: `Failed to load devices: ${(err as Error).message}`,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [accountsApi, devicesApi, householdId]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const startPairing = useCallback(
    async (name = "MacBook Companion") => {
      try {
        setPairingPending(true);
        const res = await devicesApi.startPairing(householdId, name);
        setPairingState(res);
        setStatusNotice({
          text: `Pairing code generated: ${res.pairingCode}. Run the companion CLI on your Mac.`,
          tone: "info",
        });
      } catch (err) {
        setStatusNotice({
          text: `Pairing error: ${(err as Error).message}`,
          tone: "error",
        });
      } finally {
        setPairingPending(false);
      }
    },
    [devicesApi, householdId],
  );

  const approveDevice = useCallback(
    async (deviceId: string, fingerprint: string) => {
      try {
        setApprovalPending(true);
        const res = await devicesApi.approveDevice(
          householdId,
          deviceId,
          fingerprint,
        );
        setStatusNotice({
          text: `Device "${res.name}" approved. You can now configure account access.`,
          tone: "success",
        });
        setPairingState(null);
        await loadDevices();
      } catch (err) {
        setStatusNotice({
          text: `Approval failed: ${(err as Error).message}`,
          tone: "error",
        });
      } finally {
        setApprovalPending(false);
      }
    },
    [devicesApi, householdId, loadDevices],
  );

  const revokeDevice = useCallback(
    async (deviceId: string) => {
      try {
        setRevocationPending(true);
        await devicesApi.revokeDevice(householdId, deviceId);
        setStatusNotice({
          text: "Device revoked immediately. Active sessions and leases terminated.",
          tone: "success",
        });
        await loadDevices();
      } catch (err) {
        setStatusNotice({
          text: `Revocation failed: ${(err as Error).message}`,
          tone: "error",
        });
      } finally {
        setRevocationPending(false);
      }
    },
    [devicesApi, householdId, loadDevices],
  );

  const updateAccountGrant = useCallback(
    async (
      deviceId: string,
      accountId: string,
      permission: DeviceAccountPermission,
    ) => {
      try {
        const updated = await devicesApi.updateAccountGrants(
          householdId,
          deviceId,
          [{ accountId, permission }],
        );
        setGrants((prev) => {
          const map = new Map(prev.map((g) => [g.accountId, g]));
          for (const item of updated) {
            map.set(item.accountId, item);
          }
          return Array.from(map.values());
        });
        setStatusNotice({
          text: "Account consent updated.",
          tone: "success",
        });
      } catch (err) {
        setStatusNotice({
          text: `Failed to update consent: ${(err as Error).message}`,
          tone: "error",
        });
      }
    },
    [devicesApi, householdId],
  );

  const createInsightJob = useCallback(
    async (
      featureType: InsightFeatureType,
      audienceScope: "PERSONAL" | "HOUSEHOLD" = "HOUSEHOLD",
      promptText?: string,
    ) => {
      try {
        setCreateJobPending(true);
        const job = await devicesApi.createInsightJob(householdId, {
          featureType,
          audienceScope,
          promptText,
          parameters: {},
        });
        setJobs((prev) => [job, ...prev]);
        setStatusNotice({
          text: `Insight job created (${featureType}). Your local Mac companion will process it when connected.`,
          tone: "info",
        });
        return job;
      } catch (err) {
        setStatusNotice({
          text: `Failed to create job: ${(err as Error).message}`,
          tone: "error",
        });
        return null;
      } finally {
        setCreateJobPending(false);
      }
    },
    [devicesApi, householdId],
  );

  const activeDevice = devices.find((d) => d.status === "APPROVED") ?? null;
  const pendingDevice = devices.find((d) => d.status === "PENDING") ?? null;

  return {
    loading,
    devices,
    accounts,
    activeDevice,
    pendingDevice,
    pairingState,
    pairingPending,
    approvalPending,
    revocationPending,
    grants,
    grantsLoading,
    jobs,
    jobsLoading,
    createJobPending,
    statusNotice,
    clearStatusNotice,
    loadDevices,
    startPairing,
    approveDevice,
    revokeDevice,
    updateAccountGrant,
    createInsightJob,
  };
}
