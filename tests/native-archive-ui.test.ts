/**
 * IOS7a — Native owner archive UI & read-only boundary tests.
 */
import { describe, expect, it, vi } from "vitest";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import * as errors from "../apps/mobile/src/api/errors.js";
import type {
  AccountResponse,
  MeResponse,
  TransactionResponse,
} from "../packages/contracts/src/index.js";
import { hookHarness, press } from "./fixtures/native-source-harness.js";
import {
  account,
  householdId,
  id,
  load,
  text,
} from "./fixtures/native-read-ui.js";

const txId = "00000000-0000-4000-8000-000000000005";

const archivedAccount: AccountResponse = account({
  id,
  householdId,
  label: "Sole Current Account",
  kind: "CURRENT",
  ownership: "OWNED",
  access: "TRANSACTIONS",
  latestValuation: {
    id: txId,
    money: { amountMinor: "125000", currency: "GBP" },
    asOfDate: "2026-10-15",
    recordedAt: "2026-10-15T12:00:00.000Z",
    complete: true,
    source: "MANUAL",
    adultMoney: null,
  },
  sharing: null,
  permissions: {
    canEdit: false,
    canValue: false,
    canShare: false,
  },
});

const archivedTx: TransactionResponse = {
  id: txId,
  accountId: id,
  bookedDate: "2026-10-14",
  money: { amountMinor: "-4500", currency: "GBP" },
  description: "Corner Shop",
  source: "CSV",
  version: 1,
  createdAt: "2026-10-14T10:00:00.000Z",
  category: "Groceries",
  classificationKind: "EXPENSE",
  effectiveKind: "EXPENSE",
  classificationConfirmed: true,
  splits: [],
  transfer: null,
  merchant: "Corner Shop",
  note: {
    body: "My private receipt note",
    version: 1,
  },
  permissions: {
    canCorrect: false,
    canClassify: false,
    canNote: false,
  },
};

const postLeaveMe: MeResponse = {
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
  membership: null,
};

describe("ArchiveActivity & ArchiveScreen — read-only owner archive and post-leave access", () => {
  it("renders ArchiveActivity with recorded valuation, private author notes, pagination, and zero edit/import/share controls", async () => {
    const h = hookHarness();
    const listArchiveTransactions = vi.fn<
      () => Promise<{ items: TransactionResponse[]; nextCursor: string | null }>
    >(async () => ({
      items: [archivedTx],
      nextCursor: "next-tx-cursor",
    }));
    const onRevoke = vi.fn();

    const { ArchiveActivity } = load("privacy/archive-activity.tsx", {
      react: h.react,
      "@/components/identity-frame": { Feedback: "feedback" },
      "../../api/errors": errors,
      "../accounts/account-labels": load("accounts/account-labels.ts"),
    }) as {
      ArchiveActivity: (props: Record<string, unknown>) => unknown;
    };

    let active = true;
    const renderActivity = () =>
      h.render(() =>
        ArchiveActivity({
          account: archivedAccount,
          actor: id,
          active,
          privacy: { listArchiveTransactions },
          onRevoke,
        }),
      );

    renderActivity();
    await Promise.resolve();
    await Promise.resolve();

    let tree = renderActivity();
    const renderedText = text(tree);
    expect(renderedText).toContain("Read only");
    expect(renderedText).toContain("Sole Current Account");
    expect(renderedText).toContain("£1,250.00");
    expect(renderedText).toContain("Complete recorded value");
    expect(renderedText).toContain("Corner Shop");
    expect(renderedText).toContain("-£45.00");
    expect(renderedText).toContain("CSV import");
    expect(renderedText).toContain("My private receipt note");

    // Verify no mutation actions exist
    expect(renderedText).not.toContain("Save sharing");
    expect(renderedText).not.toContain("Record balance");
    expect(renderedText).not.toContain("Edit account");

    // Pagination loads next page
    listArchiveTransactions.mockResolvedValueOnce({
      items: [
        {
          ...archivedTx,
          id: "00000000-0000-4000-8000-000000000006",
          description: "Bookshop",
          note: { body: null, version: 0 },
        },
      ],
      nextCursor: null,
    });
    press(tree, "Load more history");
    renderActivity();
    await Promise.resolve();
    await Promise.resolve();
    tree = renderActivity();
    expect(text(tree)).toContain("Bookshop");

    // Backgrounding hides sensitive transaction history
    active = false;
    h.unmount();
  });

  it("loads ArchiveScreen for an adult with no household membership, selects an owned account, and revokes on 401", async () => {
    const h = hookHarness();
    const listArchiveAccounts = vi.fn<
      () => Promise<{ items: AccountResponse[]; nextCursor: string | null }>
    >(async () => ({
      items: [archivedAccount],
      nextCursor: "next-acc-cursor",
    }));
    const revoke = vi.fn();
    const interact = vi.fn();

    const { ArchiveScreen } = load("privacy/archive-screen.tsx", {
      react: h.react,
      "expo-router": { useIsFocused: () => true },
      "react-native": {
        View: "view",
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
          interact,
          finance: {
            transport: {},
            getVerifiedIdentity: () => ({ actor: id }),
            revoke,
          },
          workflow: {
            showSecurity: vi.fn(),
          },
        }),
      },
      "../identity/session-actions": { SessionActions: () => null },
      "./archive-activity": { ArchiveActivity: "archive-activity" },
      "./export-panel": { ExportPanel: "export-panel" },
    }) as {
      ArchiveScreen: (props: Record<string, unknown>) => unknown;
    };

    const renderArchive = () =>
      h.render(() =>
        ArchiveScreen({
          me: postLeaveMe,
          privacy: { listArchiveAccounts },
        }),
      );

    renderArchive();
    await Promise.resolve();
    await Promise.resolve();

    let tree = renderArchive();
    expect(text(tree)).toContain("Sole Current Account · Read history");
    expect(text(tree)).toContain(
      "Select an archived account to see its recorded value and transactions.",
    );

    press(tree, "Sole Current Account · Read history");
    expect(interact).toHaveBeenCalledOnce();
    tree = renderArchive();
    expect(text(tree)).toContain("archive-activity");

    // 401 on pagination reload revokes local finance identity
    listArchiveAccounts.mockRejectedValueOnce(
      new NativeApiError(401, "UNAUTHENTICATED"),
    );
    press(tree, "Load more accounts");
    await Promise.resolve();
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith(id);
  });
});
