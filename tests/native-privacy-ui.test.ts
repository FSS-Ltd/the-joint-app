/**
 * IOS7a — Native privacy, export, leave, deletion receipt, and temporary CSV file UI tests.
 */
import { describe, expect, it, vi } from "vitest";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import * as errors from "../apps/mobile/src/api/errors.js";
import type {
  AccountResponse,
  DeletionReceipt,
  EntitlementResponse,
  ExportStatus,
  MeResponse,
} from "../packages/contracts/src/index.js";
import {
  elements,
  hookHarness,
  press,
  sourceExports,
} from "./fixtures/native-source-harness.js";
import {
  account,
  householdId,
  id,
  load,
  text,
} from "./fixtures/native-read-ui.js";

const exportId = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";
const membershipId = "00000000-0000-4000-8000-000000000007";
const validStatusToken = "B".repeat(43);

const baseMe: MeResponse = {
  user: {
    id,
    email: "alex@example.test",
  },
  session: {
    aal: "aal2",
    expiresAt: "2026-10-20T12:00:00.000Z",
    needsMfa: false,
    mfaVerifiedAt: "2026-10-20T10:00:00.000Z",
    purpose: "NORMAL",
  },
  factors: [
    {
      id: "clerk_totp",
      friendlyName: "Authenticator",
      status: "verified",
    },
  ],
  membership: {
    id: membershipId,
    householdId,
    role: "ADMIN",
    grantVersion: 1,
    household: {
      id: householdId,
      name: "Our Home",
      baseCurrency: "GBP",
      timezone: "Europe/London",
      memberCount: 2,
    },
  },
};

describe("ExportFileRegistry temporary CSV security & cleanup", () => {
  it("writes temporary CSV to cache, shares it, and deletes it immediately after share or on cleanupAll", async () => {
    const written = new Map<string, Uint8Array>();
    const shared: string[] = [];
    const { ExportFileRegistry } = sourceExports(
      "apps/mobile/src/features/privacy/export-file.ts",
      {
        "expo-crypto": { randomUUID: () => exportId },
        "expo-file-system": {
          Paths: { cache: { uri: "file:///cache" } },
          File: class {},
        },
        "react-native": { Share: { share: vi.fn() } },
      },
    ) as {
      ExportFileRegistry: new (fs: {
        cacheUri: string;
        write(uri: string, bytes: Uint8Array): void;
        delete(uri: string): void;
        share(uri: string): Promise<void>;
      }) => {
        writeTempCsv(bytes: Uint8Array): string;
        cleanupAll(): void;
        count(): number;
        shareAndCleanup(bytes: Uint8Array): Promise<void>;
      };
    };

    const registry = new ExportFileRegistry({
      cacheUri: "file:///cache",
      write(uri, bytes) {
        written.set(uri, bytes);
      },
      delete(uri) {
        written.delete(uri);
      },
      async share(uri) {
        shared.push(uri);
      },
    });

    const payload = new Uint8Array([1, 2, 3]);
    await registry.shareAndCleanup(payload);
    expect(shared).toEqual([`file:///cache/joint-export-${exportId}.csv`]);
    expect(written.size).toBe(0);
    expect(registry.count()).toBe(0);

    // Cleanup on background/unmount
    const uri = registry.writeTempCsv(payload);
    expect(written.has(uri)).toBe(true);
    expect(registry.count()).toBe(1);
    registry.cleanupAll();
    expect(written.size).toBe(0);
    expect(registry.count()).toBe(0);
  });

  it("cleans up temporary CSV even when Share.share rejects and refuses path traversal URIs", async () => {
    const deleted: string[] = [];
    const { ExportFileRegistry } = sourceExports(
      "apps/mobile/src/features/privacy/export-file.ts",
      {
        "expo-crypto": { randomUUID: () => "../evil" },
        "expo-file-system": {
          Paths: { cache: { uri: "file:///cache" } },
          File: class {},
        },
        "react-native": { Share: { share: vi.fn() } },
      },
    ) as {
      ExportFileRegistry: new (fs: {
        cacheUri: string;
        write(uri: string, bytes: Uint8Array): void;
        delete(uri: string): void;
        share(uri: string): Promise<void>;
      }) => {
        writeTempCsv(bytes: Uint8Array): string;
        cleanupAll(): void;
        count(): number;
        shareAndCleanup(bytes: Uint8Array): Promise<void>;
      };
    };

    const badRegistry = new ExportFileRegistry({
      cacheUri: "file:///cache",
      write: vi.fn(),
      delete: (u) => deleted.push(u),
      share: vi.fn(),
    });
    expect(() => badRegistry.writeTempCsv(new Uint8Array([1]))).toThrow(
      /Invalid cache export path/,
    );
    expect(deleted).toHaveLength(0);
  });
});

describe("PrivacyContextCard — Plus vs Free downgrade & bank connection unavailability", () => {
  it("renders Plus access, Free essentials after downgrade, and disabled bank connection action", () => {
    const { PrivacyContextCard } = load("privacy/privacy-context-card.tsx", {
      "@/components/identity-frame": { Feedback: "feedback" },
    }) as {
      PrivacyContextCard: (props: {
        entitlements: EntitlementResponse | null;
        error: string;
        onOpenAccounts?: () => void;
      }) => unknown;
    };

    const onOpenAccounts = vi.fn();
    const plusPlan: EntitlementResponse = {
      plan: "PLUS",
      version: "a".repeat(64),
      capabilities: ["finance.manual", "projections.basic"],
      caps: {
        bankAuthorisations: 4,
        brokerConnections: 2,
        companionDevices: 1,
      },
      effectiveUntil: "2026-12-01T00:00:00.000Z",
    };

    const plusTree = PrivacyContextCard({
      entitlements: plusPlan,
      error: "",
      onOpenAccounts,
    });
    expect(text(plusTree)).toContain("Plus access");
    press(plusTree, "Manage account sharing");
    expect(onOpenAccounts).toHaveBeenCalledOnce();

    const freePlan: EntitlementResponse = {
      ...plusPlan,
      plan: "FREE",
      caps: {
        bankAuthorisations: 0,
        brokerConnections: 0,
        companionDevices: 0,
      },
      effectiveUntil: null,
    };
    const freeTree = PrivacyContextCard({
      entitlements: freePlan,
      error: "",
    });
    expect(text(freeTree)).toContain("Free essentials");
    expect(text(freeTree)).toContain(
      "Export, revoke sharing, leave and delete your account remain available on Free.",
    );

    const bankAction = elements(freeTree).find(
      (e) => e.props.label === "Disconnect bank · unavailable",
    );
    expect(bankAction?.props.disabled).toBe(true);
  });
});

describe("ExportPanel & useExportJob — selection, grant invalidation, MFA recovery, expired download", () => {
  it("selects accounts, invalidates active export when sharing grant changes, handles MFA_REAUTH_REQUIRED and expired 410 downloads", async () => {
    const h = hookHarness();
    const acc1: AccountResponse = account({
      id,
      label: "Joint Current",
      access: "TRANSACTIONS",
      sharing: {
        membershipId: "11111111-1111-4111-8111-111111111111",
        level: "TRANSACTIONS",
        version: 1,
      },
    });
    const acc2: AccountResponse = account({
      id: "22222222-2222-4222-8222-222222222222",
      label: "Shared Savings",
      ownership: "SHARED",
      access: "TOTALS",
      sharing: {
        membershipId: "33333333-3333-4333-8333-333333333333",
        level: "TOTALS",
        version: 1,
      },
    });

    const readyJob: ExportStatus = {
      id: exportId,
      state: "READY",
      createdAt: "2026-10-20T10:00:00.000Z",
      expiresAt: "2026-10-21T10:00:00.000Z",
      downloadExpiresAt: "2026-10-20T10:15:00.000Z",
    };

    const requestExport = vi.fn(async () => readyJob);
    const readExportStatus = vi.fn(async () => readyJob);
    const downloadExport = vi.fn<() => Promise<Uint8Array<ArrayBuffer>>>();
    const shareAndCleanup = vi.fn(async () => {});
    const cleanupAll = vi.fn();
    const onAccessChanged = vi.fn();
    const onRevoke = vi.fn();
    const onOpenSecurity = vi.fn();

    const useExportJobMod = load("privacy/use-export-job.ts", {
      react: h.react,
      "../../api/errors": errors,
      "./export-file": {
        defaultExportFiles: { shareAndCleanup, cleanupAll },
      },
      "./watch-status": {
        isRetryablePrivacyStatusError: () => false,
        watchPrivacyStatus: (res: { receive: (v: ExportStatus) => void }) => {
          res.receive(readyJob);
          return () => {};
        },
      },
    });

    const { permissionScope } = useExportJobMod as {
      permissionScope: (
        accounts: readonly AccountResponse[],
        ids: readonly string[],
      ) => Record<string, string>;
    };

    const { ExportPanel } = load("privacy/export-panel.tsx", {
      react: h.react,
      "@/components/identity-frame": { Feedback: "feedback" },
      "./use-export-job": useExportJobMod,
    }) as {
      ExportPanel: (props: Record<string, unknown>) => unknown;
    };

    const renderPanel = () =>
      h.render(() =>
        ExportPanel({
          accounts: [acc1, acc2],
          streamScope: { kind: "export", householdId },
          actor: id,
          refreshing: false,
          scopeError: false,
          active: true,
          privacy: {
            requestExport,
            readExportStatus,
            downloadExport,
          },
          transport: {},
          onAccessChanged,
          onRevoke,
          onOpenSecurity,
          files: { shareAndCleanup, cleanupAll },
        }),
      );

    // 1. Select account 1 and request export
    let tree = renderPanel();
    expect(text(tree)).toContain("Values only · balances and account details");
    expect(text(tree)).toContain("Values and details · history and your notes");
    press(tree, "Select Joint Current");

    tree = renderPanel();
    expect(text(tree)).toContain("Deselect Joint Current");
    press(tree, "Request CSV export");
    await Promise.resolve();
    await Promise.resolve();

    tree = renderPanel();
    expect(requestExport).toHaveBeenCalledWith(
      householdId,
      [id],
      expect.any(AbortSignal),
    );
    expect(text(tree)).toContain("Your export is ready.");

    // 2. Download fails with MFA_REAUTH_REQUIRED -> shows Verify a fresh authenticator code
    downloadExport.mockRejectedValueOnce(
      new NativeApiError(403, "MFA_REAUTH_REQUIRED"),
    );
    press(tree, "Download CSV");
    await Promise.resolve();
    tree = renderPanel();
    expect(text(tree)).toContain(
      "Verify a fresh authenticator code in Account security, then try again.",
    );
    press(tree, "Verify a fresh authenticator code");
    expect(onOpenSecurity).toHaveBeenCalledOnce();

    // 3. Download succeeds -> shares & cleans up temp file
    const csvBytes = new Uint8Array([65, 66, 67]);
    downloadExport.mockResolvedValueOnce(csvBytes);
    press(tree, "Download CSV");
    await Promise.resolve();
    await Promise.resolve();
    expect(shareAndCleanup).toHaveBeenCalledWith(csvBytes);

    // 4. Expired download (410) clears job, triggers onAccessChanged, and shows recovery message
    tree = renderPanel();
    downloadExport.mockRejectedValueOnce(
      new NativeApiError(410, "EXPORT_EXPIRED"),
    );
    press(tree, "Download CSV");
    await Promise.resolve();
    await Promise.resolve();
    tree = renderPanel();
    expect(text(tree)).toContain(
      "This download is unavailable or expired, or your access changed. Refresh your accounts and request a new export.",
    );
    expect(onAccessChanged).toHaveBeenCalledOnce();

    // 5. permissionScope changes whenever access, ownership, sharing version, or permissions change
    const before = permissionScope([acc1], [id]);
    const after = permissionScope(
      [
        {
          ...acc1,
          sharing: {
            membershipId: "11111111-1111-4111-8111-111111111111",
            level: "NONE",
            version: 2,
          },
        },
      ],
      [id],
    );
    expect(before[id]).not.toBe(after[id]);

    // 6. Unmounting cleans up temporary files
    h.unmount();
    expect(cleanupAll).toHaveBeenCalled();
  });
});

describe("PrivacyActions & DeletionReceiptScreen — canceled actions, leave household, deletion receipt", () => {
  it("makes zero network calls when Leave or Delete is canceled, and executes Leave or Delete with confirmation and stable requestId", async () => {
    const h = hookHarness();
    const leaveHousehold = vi.fn(async () => ({ left: true as const }));
    const requestDeletion = vi.fn(async (): Promise<DeletionReceipt> => ({
      id: requestId,
      state: "PENDING",
      statusToken: validStatusToken,
      expiresAt: "2026-10-27T10:00:00.000Z",
    }));
    const onOpenSecurity = vi.fn();
    const onRevoke = vi.fn();
    const onEndSession = vi.fn(async () => {});
    const onDeletionReceipt = vi.fn();

    const { PrivacyActions } = load("privacy/privacy-actions.tsx", {
      react: h.react,
      "expo-crypto": { randomUUID: () => requestId },
      "@/components/identity-frame": { Feedback: "feedback" },
      "../../api/errors": errors,
    }) as {
      PrivacyActions: (props: Record<string, unknown>) => unknown;
    };

    const renderActions = () =>
      h.render(() =>
        PrivacyActions({
          householdId,
          actor: id,
          active: true,
          privacy: { leaveHousehold, requestDeletion },
          onOpenSecurity,
          onRevoke,
          onEndSession,
          onDeletionReceipt,
        }),
      );

    // 1. Choose Delete my account, then Cancel -> zero network calls
    let tree = renderActions();
    press(tree, "Delete my account");
    tree = renderActions();
    expect(text(tree)).toContain("Confirm account deletion");
    const confirmBtn = elements(tree).find(
      (e) => e.props.label === "Confirm and delete my account",
    );
    expect(confirmBtn?.props.disabled).toBe(true);

    press(tree, "Cancel");
    tree = renderActions();
    expect(text(tree)).not.toContain("Confirm account deletion");
    expect(requestDeletion).not.toHaveBeenCalled();
    expect(leaveHousehold).not.toHaveBeenCalled();

    // 2. Choose Leave household, confirm, and submit
    press(tree, "Leave household");
    tree = renderActions();
    press(
      tree,
      "I understand these consequences and want to leave my household",
    );
    tree = renderActions();
    press(tree, "Confirm and leave household");
    await Promise.resolve();
    await Promise.resolve();
    expect(leaveHousehold).toHaveBeenCalledWith(
      householdId,
      requestId,
      expect.any(AbortSignal),
    );
    expect(onEndSession).toHaveBeenCalledWith(
      "You left your household. Sign in again to read and export accounts you own in your owner archive.",
    );

    // 3. Fresh harness for Delete my account -> sets receipt and ends session
    const h2 = hookHarness();
    const { PrivacyActions: PrivacyActions2 } = load(
      "privacy/privacy-actions.tsx",
      {
        react: h2.react,
        "expo-crypto": { randomUUID: () => requestId },
        "@/components/identity-frame": { Feedback: "feedback" },
        "../../api/errors": errors,
      },
    ) as {
      PrivacyActions: (props: Record<string, unknown>) => unknown;
    };

    const renderDelete = () =>
      h2.render(() =>
        PrivacyActions2({
          householdId,
          actor: id,
          active: true,
          privacy: { leaveHousehold, requestDeletion },
          onOpenSecurity,
          onRevoke,
          onEndSession,
          onDeletionReceipt,
        }),
      );

    let delTree = renderDelete();
    press(delTree, "Delete my account");
    delTree = renderDelete();
    press(
      delTree,
      "I understand these consequences and want to delete my account",
    );
    delTree = renderDelete();
    press(delTree, "Confirm and delete my account");
    await Promise.resolve();
    await Promise.resolve();
    expect(requestDeletion).toHaveBeenCalledWith(
      requestId,
      expect.any(AbortSignal),
    );
    expect(onDeletionReceipt).toHaveBeenCalledWith({
      id: requestId,
      state: "PENDING",
      statusToken: validStatusToken,
      expiresAt: "2026-10-27T10:00:00.000Z",
    });
  });

  it("renders DeletionReceiptScreen with receipt-scoped status updates and closes cleanly", () => {
    const h = hookHarness();
    const onClose = vi.fn();
    let watchedAuth: unknown = null;

    const { DeletionReceiptScreen } = load(
      "privacy/deletion-receipt-screen.tsx",
      {
        react: h.react,
        "react-native": {
          AppState: {
            currentState: "active",
            addEventListener: () => ({ remove: () => {} }),
          },
        },
        "@/components/identity-frame": {
          IdentityFrame: "frame",
          Feedback: "feedback",
        },
        "../../api/errors": errors,
        "../../api/privacy": { createPrivacyApi: () => ({}) },
        "../identity/context": {
          useIdentity: () => ({
            privacy: { readDeletionStatus: vi.fn() },
            finance: { transport: {} },
          }),
        },
        "./watch-status": {
          watchPrivacyStatus: (opts: {
            authorization: unknown;
            receive: (s: unknown) => void;
          }) => {
            watchedAuth = opts.authorization;
            opts.receive({
              id: requestId,
              state: "PROVIDER_PENDING",
              requestedAt: "2026-10-20T10:00:00.000Z",
              completedAt: null,
            });
            return () => {};
          },
        },
      },
    ) as {
      DeletionReceiptScreen: (props: {
        receipt: DeletionReceipt | null;
        onClose: () => void;
      }) => unknown;
    };

    const receipt: DeletionReceipt = {
      id: requestId,
      state: "PENDING",
      statusToken: validStatusToken,
      expiresAt: "2026-10-27T10:00:00.000Z",
    };

    const renderReceipt = () =>
      h.render(() =>
        DeletionReceiptScreen({
          receipt,
          onClose,
        }),
      );
    renderReceipt();
    const tree = renderReceipt();
    expect(watchedAuth).toEqual({
      kind: "deletion-receipt",
      token: validStatusToken,
    });
    expect(text(tree)).toContain(
      "App access has ended. Provider cleanup is still pending.",
    );
    press(tree, "Close receipt");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("AccountScreen & PrivacyScreen navigation and post-leave access", () => {
  it("navigates between AccountScreen, PrivacyScreen, ArchiveScreen, and SecurityScreen, and conceals on background", () => {
    const h = hookHarness();
    const { NativeWorkflow } = sourceExports(
      "apps/mobile/src/features/identity/workflow.ts",
      {
        "@joint/identity-runtime": {
          signInStage: () => null,
          signUpStage: () => null,
        },
      },
    ) as {
      NativeWorkflow: new (isActive: () => boolean) => {
        view: string;
        securityOpen: boolean;
        deletionReceipt: DeletionReceipt | null;
        showSecurity(value: boolean, from?: string): void;
        setDeletionReceipt(receipt: DeletionReceipt | null): void;
        conceal(): void;
      };
    };

    const workflow = new NativeWorkflow(() => true);
    const { AccountScreen } = load("identity/account-screen.tsx", {
      "expo-router": {
        useRouter: () => ({ replace: vi.fn() }),
        useLocalSearchParams: () => ({}),
      },
      react: {
        ...h.react,
        useSyncExternalStore: (_sub: unknown, get: () => unknown) => get(),
      },
      "@/components/identity-frame": { IdentityFrame: "frame" },
      "./household-forms": {
        AcceptInvitation: () => null,
        CreateHousehold: () => null,
        InviteAdult: () => null,
      },
      "../privacy/archive-screen": { ArchiveScreen: "archive-screen" },
      "../privacy/privacy-screen": { PrivacyScreen: "privacy-screen" },
      "./context": { useIdentity: () => ({ workflow }) },
      "./security-screen": { SecurityScreen: "security-screen" },
      "./session-actions": { SessionActions: () => null },
    }) as {
      AccountScreen: (props: { me: MeResponse }) => unknown;
    };

    let tree = h.render(() => AccountScreen({ me: baseMe }));
    press(tree, "Privacy and data");
    expect(workflow.view).toBe("privacy");

    tree = h.render(() => AccountScreen({ me: baseMe }));
    expect(elements(tree)[0]?.type).toBe("privacy-screen");

    workflow.showSecurity(true, "privacy");
    expect(workflow.view).toBe("security");
    expect(workflow.securityOpen).toBe(true);

    // Returning from security restores the caller view ("privacy")
    workflow.showSecurity(false);
    expect(workflow.view).toBe("privacy");
    expect(workflow.securityOpen).toBe(false);

    // Conceal clears deletionReceipt on backgrounding while preserving non-secret view navigation
    workflow.setDeletionReceipt({
      id: requestId,
      state: "PENDING",
      statusToken: validStatusToken,
      expiresAt: "2026-10-27T10:00:00.000Z",
    });
    workflow.conceal();
    expect(workflow.view).toBe("privacy");
    expect(workflow.deletionReceipt).toBeNull();
  });

  it("loads PrivacyScreen with household accounts and entitlements, and renders post-leave archive card when membership is null", async () => {
    const h = hookHarness();
    const acc = account({ id, label: "Joint Current" });
    const listAccounts = vi.fn(async () => ({
      items: [acc],
      nextCursor: null,
    }));
    const readEntitlements = vi.fn(async (): Promise<EntitlementResponse> => ({
      plan: "FREE",
      version: "a".repeat(64),
      capabilities: ["finance.manual", "projections.basic"],
      caps: {
        bankAuthorisations: 0,
        brokerConnections: 0,
        companionDevices: 0,
      },
      effectiveUntil: null,
    }));
    const push = vi.fn();
    const showView = vi.fn();
    const showSecurity = vi.fn();
    const revoke = vi.fn();

    const { PrivacyScreen } = load("privacy/privacy-screen.tsx", {
      react: h.react,
      "expo-router": {
        useRouter: () => ({ push }),
        useIsFocused: () => true,
      },
      "react-native": {
        AppState: {
          currentState: "active",
          addEventListener: () => ({ remove: () => {} }),
        },
      },
      "@/components/identity-frame": {
        IdentityFrame: "frame",
        Feedback: "feedback",
      },
      "../../api/accounts": {
        createAccountsApi: () => ({ list: listAccounts }),
      },
      "../../api/errors": errors,
      "../../api/privacy": {
        createPrivacyApi: () => ({ readEntitlements }),
      },
      "../identity/context": {
        useIdentity: () => ({
          refresh: vi.fn(),
          finance: {
            transport: {},
            getVerifiedIdentity: () => ({ actor: id }),
            revoke,
          },
          workflow: {
            showView,
            showSecurity,
            setDeletionReceipt: vi.fn(),
          },
          logout: vi.fn(),
        }),
      },
      "../identity/session-actions": { SessionActions: () => null },
      "./export-panel": { ExportPanel: "export-panel" },
      "./privacy-actions": { PrivacyActions: "privacy-actions" },
      "./privacy-context-card": { PrivacyContextCard: "privacy-context-card" },
    }) as {
      PrivacyScreen: (props: { me: MeResponse }) => unknown;
    };

    const renderWithHousehold = () =>
      h.render(() =>
        PrivacyScreen({
          me: baseMe,
        }),
      );

    renderWithHousehold();
    await Promise.resolve();
    await Promise.resolve();
    const householdTree = renderWithHousehold();
    expect(listAccounts).toHaveBeenCalledWith(
      householdId,
      { limit: 50 },
      expect.any(AbortSignal),
    );
    expect(readEntitlements).toHaveBeenCalledWith(
      householdId,
      expect.any(AbortSignal),
    );
    expect(text(householdTree)).toContain("export-panel");
    expect(text(householdTree)).toContain("privacy-context-card");
    expect(text(householdTree)).toContain("privacy-actions");
    press(householdTree, "Open owner archive");
    expect(showView).toHaveBeenCalledWith("archive");

    // Post-leave adult (membership: null) renders direct Owner archive panel and omits household export
    const h2 = hookHarness();
    const { PrivacyScreen: PrivacyScreen2 } = load(
      "privacy/privacy-screen.tsx",
      {
        react: h2.react,
        "expo-router": {
          useRouter: () => ({ push }),
          useIsFocused: () => true,
        },
        "react-native": {
          AppState: {
            currentState: "active",
            addEventListener: () => ({ remove: () => {} }),
          },
        },
        "@/components/identity-frame": {
          IdentityFrame: "frame",
          Feedback: "feedback",
        },
        "../../api/accounts": {
          createAccountsApi: () => ({ list: listAccounts }),
        },
        "../../api/errors": errors,
        "../../api/privacy": {
          createPrivacyApi: () => ({ readEntitlements }),
        },
        "../identity/context": {
          useIdentity: () => ({
            refresh: vi.fn(),
            finance: {
              transport: {},
              getVerifiedIdentity: () => ({ actor: id }),
              revoke,
            },
            workflow: {
              showView,
              showSecurity,
              setDeletionReceipt: vi.fn(),
            },
            logout: vi.fn(),
          }),
        },
        "../identity/session-actions": { SessionActions: () => null },
        "./export-panel": { ExportPanel: "export-panel" },
        "./privacy-actions": { PrivacyActions: "privacy-actions" },
        "./privacy-context-card": {
          PrivacyContextCard: "privacy-context-card",
        },
      },
    ) as {
      PrivacyScreen: (props: { me: MeResponse }) => unknown;
    };

    const postLeaveTree = h2.render(() =>
      PrivacyScreen2({
        me: { ...baseMe, membership: null },
      }),
    );
    expect(text(postLeaveTree)).not.toContain("export-panel");
    expect(text(postLeaveTree)).toContain(
      "After leaving, accounts you legally own remain available to read and export.",
    );
  });
});
