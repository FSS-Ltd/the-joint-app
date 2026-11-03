import { expect, it, vi } from "vitest";
import {
  householdCreateSchema,
  inviteSchema,
  meResponseSchema,
  type MeResponse,
} from "../packages/contracts/src/index.js";
import { NativeWorkflow } from "../apps/mobile/src/features/identity/workflow.js";
import { clerkFlowError } from "../packages/identity-runtime/src/clerk-flow.js";
import {
  elements,
  field,
  hookHarness,
  jsxBoundary,
  press,
  sourceExports,
} from "./fixtures/native-source-harness.js";

type Operation = {
  pending: boolean;
  error: string;
  notice: string;
  setError(value: string): void;
  setNotice(value: string): void;
  run(
    action: (
      signal: AbortSignal,
      lifetime: { active(): boolean; current(): boolean },
    ) => Promise<void>,
  ): Promise<boolean>;
};

function fixture(role: "ADMIN" | "MEMBER" = "ADMIN", memberCount = 1) {
  const me = meResponseSchema.parse({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "organiser@example.test",
    },
    membership: {
      id: "22222222-2222-4222-8222-222222222222",
      householdId: "33333333-3333-4333-8333-333333333333",
      role,
      grantVersion: 0,
      household: {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Synthetic home",
        baseCurrency: "GBP",
        timezone: "Europe/London",
        memberCount,
      },
    },
    session: {
      aal: "aal2",
      expiresAt: "2030-01-01T00:00:00.000Z",
      needsMfa: false,
      mfaVerifiedAt: "2026-11-03T08:00:00.000Z",
      purpose: "NORMAL",
    },
    factors: [],
  });
  const h = hookHarness(),
    workflow = new NativeWorkflow();
  workflow.identify("organiser:session");
  const identity = {
    workflow,
    interact: vi.fn(),
    refresh: vi.fn(async () => {}),
    api: {
      invite: vi.fn<
        (
          id: string,
          email: string,
          key: string,
          signal: AbortSignal,
        ) => Promise<{ token: string }>
      >(async () => ({ token: "synthetic-private-invitation" })),
    },
  };
  const deps = {
    react: h.react,
    "./context": { useIdentity: () => identity },
  };
  const useOperation = sourceExports(
    "apps/mobile/src/features/identity/use-operation.ts",
    {
      ...deps,
      "./api": {
        IdentityApiError: Error,
        identityError: () => "Invitation failed.",
      },
      "@joint/identity-runtime": { clerkFlowError },
    },
  ).useIdentityOperation as () => Operation;
  let pending: Promise<boolean> | undefined;
  const InviteAdult = sourceExports(
    "apps/mobile/src/features/identity/household-forms.tsx",
    {
      ...deps,
      "react/jsx-runtime": jsxBoundary,
      "@joint/contracts": { householdCreateSchema, inviteSchema },
      "expo-crypto": {
        randomUUID: () => "44444444-4444-4444-8444-444444444444",
      },
      "react-native": { Share: { share: vi.fn(async () => ({})) } },
      "@/components/app-text": { AppText: "text" },
      "@/components/identity-frame": { Feedback: "feedback" },
      "@/components/native-field": { NativeField: "field" },
      "@/components/native-action": { NativeAction: "action" },
      "@/components/native-actions": { NativeActions: "actions" },
      "./use-operation": {
        useIdentityOperation: () => {
          const operation = useOperation();
          return {
            ...operation,
            run: (action: Parameters<Operation["run"]>[0]) => {
              pending = operation.run(action);
              return pending;
            },
          };
        },
      },
    },
  ).InviteAdult as (props: { me: MeResponse }) => unknown;
  return {
    me,
    identity,
    render: () => h.render(() => InviteAdult({ me })),
    done: () => pending,
  };
}

function actionLabels(tree: unknown) {
  return elements(tree)
    .filter((item) => item.type === "action")
    .map((item) => item.props.label);
}

it("keeps the invitation form optional in the household profile", () => {
  const f = fixture();
  expect(actionLabels(f.render())).toContain("Invite another adult");
  expect(elements(f.render()).some((item) => item.type === "field")).toBe(
    false,
  );
  expect(f.identity.api.invite).not.toHaveBeenCalled();
});

it("defers without a server write and permits reopening from the profile", () => {
  const f = fixture();
  press(f.render(), "Invite another adult");
  field(f.render(), "Other adult’s email").onChangeText("partner@example.test");
  press(f.render(), "Invite later");
  expect(elements(f.render()).some((item) => item.type === "field")).toBe(
    false,
  );
  expect(f.identity.api.invite).not.toHaveBeenCalled();
  press(f.render(), "Invite another adult");
  expect(field(f.render(), "Other adult’s email").value).toBe(
    "partner@example.test",
  );
});

it("blocks deferral during a write and never cancels an invitation already created", async () => {
  const f = fixture();
  let resolve: ((value: { token: string }) => void) | undefined;
  f.identity.api.invite.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  press(f.render(), "Invite another adult");
  field(f.render(), "Other adult’s email").onChangeText("partner@example.test");
  press(f.render(), "Create invitation");
  const later = elements(f.render()).find(
    (item) => item.props.label === "Invite later",
  );
  expect(later?.props.disabled).toBe(true);
  press(f.render(), "Invite later");
  expect(field(f.render(), "Other adult’s email").value).toBe(
    "partner@example.test",
  );
  resolve?.({ token: "synthetic-private-invitation" });
  await f.done();
  press(f.render(), "Invite later");
  expect(JSON.stringify(f.render())).not.toContain(
    "synthetic-private-invitation",
  );
  press(f.render(), "Invite another adult");
  expect(actionLabels(f.render())).toContain("Share invitation");
  expect(f.identity.api.invite).toHaveBeenCalledExactlyOnceWith(
    "33333333-3333-4333-8333-333333333333",
    "partner@example.test",
    "44444444-4444-4444-8444-444444444444",
    expect.any(AbortSignal),
  );
});

it("does not offer invitations to a non-admin or a full household", () => {
  const individual = fixture();
  individual.me.membership = null;
  expect(individual.render()).toBeNull();
  const member = fixture("MEMBER");
  expect(member.render()).toBeNull();
  const full = fixture("ADMIN", 2);
  expect(actionLabels(full.render())).not.toContain("Invite another adult");
  expect(elements(full.render()).some((item) => item.type === "field")).toBe(
    false,
  );
});
