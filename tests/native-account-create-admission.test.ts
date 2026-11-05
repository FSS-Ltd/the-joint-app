import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture } from "./fixtures/native-finance.js";
import { load, account } from "./fixtures/native-read-ui.js";
import { press } from "./fixtures/native-source-harness.js";
import { flush } from "./fixtures/native-stream.js";
import * as labels from "../apps/mobile/src/features/accounts/account-labels.js";
import * as input from "../apps/mobile/src/features/accounts/write-input.js";
import * as intents from "../apps/mobile/src/features/accounts/write-intent.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import type { AccountResponse } from "../packages/contracts/src/index.js";
import type { FinanceMutationResult } from "../apps/mobile/src/features/finance/state.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
it.each(["success", "error"])(
  "retained create callback cannot replace a %s intent before explicit reset",
  async (outcome) => {
    const f = await financeFixture();
    const create = vi
      .spyOn(f.finance.accounts, "create")
      .mockImplementation(async () => {
        if (outcome === "error")
          throw new errors.NativeApiError(400, "INVALID_INPUT");
        return account({ householdId: f.finance.authority.householdId });
      });
    const draft = {
      visible: true,
      value: { label: "Savings", liquidity: "AVAILABLE", kind: "SAVINGS" },
      message: "",
      error: vi.fn(),
      clear: vi.fn(),
      change: vi.fn(),
    };
    let serial = 0,
      mutation: FinanceMutationResult<AccountResponse> | undefined;
    const Screen = load("accounts/create-screen.tsx", {
      "expo-crypto": {
        randomUUID: () =>
          `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`,
      },
      "./use-write-draft": { useWriteDraft: () => draft },
      "../finance/context": { useNativeFinance: () => f.finance },
      "../finance/use-mutation": {
        useFinanceMutation: () =>
          (mutation = f.mutation<AccountResponse>("create-account")),
      },
      "../finance/errors": errors,
      "./write-intent": intents,
      "./write-input": input,
      "./metadata-fields": { MetadataFields: "fields" },
      "./account-choice": { AccountChoice: "choice" },
      "./account-labels": labels,
      "./write-feedback": { WriteFeedback: "feedback" },
    }).CreateAccountScreen as () => unknown;
    try {
      const retained = f.h.render(Screen);
      press(retained, "Create private account");
      await flush();
      // Invoke the same rendered handler after completion, before React renders.
      press(retained, "Create private account");
      await flush();
      expect(create).toHaveBeenCalledOnce();
      const firstKey = create.mock.calls[0]?.[2];
      f.h.render(Screen);
      expect(mutation?.kind).toBe(outcome);
      mutation?.reset();
      draft.clear();
      press(f.h.render(Screen), "Create private account");
      await flush();
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[1]?.[2]).not.toBe(firstKey);
    } finally {
      f.close();
    }
  },
);
