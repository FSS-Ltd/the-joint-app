"use client";
import { useState, type ReactNode } from "react";
import {
  classificationKindSchema,
  type ClassificationKind,
  type TransactionResponse,
} from "@joint/contracts";
import { formatMoney, parseMoneyInput } from "@joint/domain";
import { request, errorMessage } from "../identity/client";
import { isAccessError } from "../finance/access-error";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { KindOptions } from "./kinds";
interface Line {
  category: string;
  amount: string;
  classificationKind: ClassificationKind;
}
function decimal(value: string): string {
  const n = BigInt(value),
    abs = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
export function SplitForm({
  householdId,
  transaction,
  saved,
  unavailable,
}: {
  householdId: string;
  transaction: TransactionResponse;
  saved: (value: TransactionResponse) => void;
  unavailable?: () => void;
}): ReactNode {
  const [lines, setLines] = useState<Line[]>(() =>
      transaction.splits.length
        ? transaction.splits.map((l) => ({
            category: l.category ?? "",
            amount: decimal(l.money.amountMinor),
            classificationKind: l.classificationKind,
          }))
        : [
            {
              category: "",
              amount: "",
              classificationKind: transaction.effectiveKind ?? "UNCLASSIFIED",
            },
            {
              category: "",
              amount: "",
              classificationKind: transaction.effectiveKind ?? "UNCLASSIFIED",
            },
          ],
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function change(clear = false) {
    setError("");
    setSuccess("");
    let body;
    try {
      body = {
        lines: clear
          ? []
          : lines.map((l) => ({
              category: l.category.trim() || null,
              money: parseMoneyInput(l.amount),
              classificationKind: l.classificationKind,
            })),
      };
      if (
        !clear &&
        body.lines.reduce((sum, l) => sum + BigInt(l.money.amountMinor), 0n) !==
          BigInt(transaction.money.amountMinor)
      )
        throw new Error();
      if (body.lines.some((l) => BigInt(l.money.amountMinor) === 0n))
        throw new Error();
    } catch {
      setError(
        "Use non-zero signed amounts that add exactly to the original transaction.",
      );
      return;
    }
    setPending(true);
    try {
      saved(
        await request<TransactionResponse>(
          `${financePath(householdId, "transactions", transaction.id)}/splits`,
          body,
          undefined,
          { method: "PUT", ifMatch: transaction.version },
        ),
      );
      setSuccess(
        clear
          ? "Split cleared. The original transaction is used again."
          : "Split saved. Components replace the original in reports.",
      );
    } catch (cause) {
      if (isAccessError(cause)) unavailable?.();
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card">
      <h2>Split across categories</h2>
      <p>
        Components replace this {formatMoney(transaction.money)} record in
        reports. Use negative amounts for expenses and positive amounts for
        refunds or income.
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void change();
        }}
        aria-busy={pending}
      >
        {lines.map((l, index) => (
          <fieldset className="budget-line" key={index}>
            <legend>Split component {index + 1}</legend>
            <label>
              Category
              <input
                value={l.category}
                maxLength={80}
                disabled={pending}
                onChange={(e) =>
                  setLines((v) =>
                    v.map((x, i) =>
                      i === index ? { ...x, category: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Signed amount · GBP
              <input
                value={l.amount}
                inputMode="decimal"
                required
                disabled={pending}
                onChange={(e) =>
                  setLines((v) =>
                    v.map((x, i) =>
                      i === index ? { ...x, amount: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Financial type
              <select
                value={l.classificationKind}
                disabled={pending}
                onChange={(e) =>
                  setLines((v) =>
                    v.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            classificationKind: classificationKindSchema.parse(
                              e.target.value,
                            ),
                          }
                        : x,
                    ),
                  )
                }
              >
                <KindOptions />
              </select>
            </label>
            {lines.length > 2 && (
              <button
                className="text-button"
                type="button"
                disabled={pending}
                onClick={() => setLines((v) => v.filter((_, i) => i !== index))}
              >
                Remove component {index + 1}
              </button>
            )}
          </fieldset>
        ))}
        <div className="finance-actions">
          <button
            className="button secondary"
            type="button"
            disabled={pending || lines.length >= 20}
            onClick={() =>
              setLines((v) => [
                ...v,
                {
                  category: "",
                  amount: "",
                  classificationKind:
                    transaction.effectiveKind ?? "UNCLASSIFIED",
                },
              ])
            }
          >
            Add component
          </button>
          <button className="button primary" disabled={pending} type="submit">
            Save split
          </button>
          {transaction.splits.length > 0 && (
            <button
              className="text-button"
              disabled={pending}
              type="button"
              onClick={() => void change(true)}
            >
              Clear split
            </button>
          )}
        </div>
        <Feedback error={error} success={success} />
      </form>
    </section>
  );
}
