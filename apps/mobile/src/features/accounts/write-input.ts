import {
  accountPatchSchema,
  valuationInputSchema,
  type AccountResponse,
  type ValuationInput,
} from "@joint/contracts";
import { isLiabilityKind, parseMoneyInput } from "@joint/domain";

export type InputResult<T> =
  { ok: true; value: T } | { ok: false; message: string };
export type MetadataDraft = {
  label: string;
  liquidity: AccountResponse["liquidity"];
};
export type ValuationDraft = {
  amount: string;
  date: string;
  attested: boolean;
  adultAmount: string;
};

export function metadataInput(
  draft: MetadataDraft,
): InputResult<MetadataDraft> {
  const result = accountPatchSchema.safeParse(draft);
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        message:
          "Enter an account name between 1 and 80 characters and choose its availability.",
      };
}
export function valuationInput(
  account: AccountResponse,
  draft: ValuationDraft,
): InputResult<ValuationInput> {
  try {
    const money = parseMoneyInput(draft.amount);
    const adultMoney = draft.attested
      ? parseMoneyInput(draft.adultAmount)
      : undefined;
    if (
      isLiabilityKind(account.kind) &&
      (BigInt(money.amountMinor) < 0n ||
        (adultMoney && adultMoney.amountMinor !== money.amountMinor))
    )
      return {
        ok: false,
        message:
          "Enter a nonnegative outstanding debt. An attested adult portion must cover the full debt.",
      };
    const parsed = valuationInputSchema.safeParse({
      money,
      asOfDate: draft.date,
      ...(adultMoney ? { adultMoney } : {}),
    });
    return parsed.success
      ? { ok: true, value: parsed.data }
      : {
          ok: false,
          message:
            "Check the date and adult portion. Use YYYY-MM-DD and an adult portion within the balance; negative assets require the full negative amount.",
        };
  } catch {
    return {
      ok: false,
      message:
        "Enter an exact GBP amount with no more than two decimal places, within the supported range.",
    };
  }
}
