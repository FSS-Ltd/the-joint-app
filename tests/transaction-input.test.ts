import { expect, it } from "vitest";
import {
  transactionCreateSchema,
  transactionAnnotationSchema,
} from "../packages/contracts/src/transactions.js";
it("rejects unsupported text and year zero before database writes", () => {
  const valid = {
    accountId: "00000000-0000-4000-8000-000000000001",
    bookedDate: "2026-01-01",
    money: { amountMinor: "1", currency: "GBP" },
    description: "Synthetic",
  };
  expect(transactionCreateSchema.safeParse(valid).success).toBe(true);
  expect(
    transactionCreateSchema.safeParse({ ...valid, bookedDate: "0000-01-01" })
      .success,
  ).toBe(false);
  for (const value of ["bad\u0000text", "bad\ud800text"]) {
    expect(
      transactionCreateSchema.safeParse({ ...valid, description: value })
        .success,
    ).toBe(false);
    for (const field of ["category", "merchant", "note"])
      expect(
        transactionAnnotationSchema.safeParse({
          [field]: value,
          ...(field === "note" ? { noteVersion: 0 } : {}),
        }).success,
      ).toBe(false);
  }
  expect(
    transactionCreateSchema.safeParse({ ...valid, description: "Family 💚" })
      .success,
  ).toBe(true);
});
