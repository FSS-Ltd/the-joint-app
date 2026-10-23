import type { ReactNode } from "react";
import {
  classificationKindSchema,
  type ClassificationKind,
} from "@joint/contracts";
export const kindLabels: Record<ClassificationKind, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  DEBT_PAYMENT: "Debt payment",
  PRINCIPAL: "Principal",
  CONTRIBUTION: "Investment contribution",
  UNCLASSIFIED: "Unclassified",
};
export function KindOptions(): ReactNode {
  return classificationKindSchema.options.map((k) => (
    <option key={k} value={k}>
      {kindLabels[k]}
    </option>
  ));
}
