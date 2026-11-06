import type { ClassificationKind } from "@joint/contracts";

export const kindLabels: Record<ClassificationKind | "", string> = {
  "": "Not set",
  EXPENSE: "Expense",
  INCOME: "Income",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  DEBT_PAYMENT: "Debt payment",
  PRINCIPAL: "Principal",
  CONTRIBUTION: "Contribution",
  UNCLASSIFIED: "Unclassified",
};
