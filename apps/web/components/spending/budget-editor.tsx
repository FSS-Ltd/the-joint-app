"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
import { parseMoneyInput } from "@joint/domain";
import { formatAggregateMoney, formatGbpMinor } from "@joint/domain/cash-flow";
import { request, errorMessage } from "../identity/client";
import { isAccessError } from "../finance/access-error";
import { categoryActual } from "./budget-presentation";
import { Feedback } from "../identity/frame";
function decimal(value: string): string {
  const n = BigInt(value);
  return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
}
export function BudgetEditor({
  report,
  householdId,
  refresh,
}: {
  report: SpendingReport;
  householdId: string;
  refresh: () => void;
}): ReactNode {
  const [lines, setLines] = useState(
      () =>
        report.budget?.lines.map((l) => ({
          category: l.category ?? "",
          amount: decimal(l.limit.amountMinor),
        })) ?? [{ category: "", amount: "" }],
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    let body;
    try {
      body = {
        accountIds: report.scope.map((a) => a.id),
        lines: lines
          .filter((l) => l.amount.trim())
          .map((l) => ({
            category: l.category.trim() || null,
            limit: parseMoneyInput(l.amount),
          })),
      };
      if (body.lines.some((l) => BigInt(l.limit.amountMinor) < 0n))
        throw new Error();
      if (new Set(body.lines.map((l) => l.category)).size !== body.lines.length)
        throw new Error();
    } catch {
      setError(
        "Use one non-negative GBP limit per category, with at most two decimal places.",
      );
      return;
    }
    setPending(true);
    try {
      await request(
        `/api/households/${householdId}/budgets/${report.month}`,
        body,
        undefined,
        { method: "PUT", ifMatch: report.budget?.version ?? 0 },
      );
      refresh();
    } catch (cause) {
      if (isAccessError(cause)) refresh();
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card">
      <h2>Plan a comfortable month</h2>
      <p>
        These limits are shared with adults who can see every selected account.
        They do not move money.
      </p>
      {!report.coverage.complete && (
        <p className="field-hint">
          Actual spending is incomplete until this month’s history and
          classifications are reviewed.
        </p>
      )}
      <form
        className="form-stack"
        onSubmit={(event) => void submit(event)}
        aria-busy={pending}
      >
        {lines.map((line, index) => (
          <fieldset className="budget-line" key={index}>
            <legend>Budget category {index + 1}</legend>
            <label>
              Category
              <input
                value={line.category}
                maxLength={80}
                placeholder="Uncategorized"
                onChange={(e) =>
                  setLines((v) =>
                    v.map((l, i) =>
                      i === index ? { ...l, category: e.target.value } : l,
                    ),
                  )
                }
                disabled={pending}
              />
            </label>
            <label>
              Monthly limit · GBP
              <input
                inputMode="decimal"
                value={line.amount}
                placeholder="0.00"
                onChange={(e) =>
                  setLines((v) =>
                    v.map((l, i) =>
                      i === index ? { ...l, amount: e.target.value } : l,
                    ),
                  )
                }
                disabled={pending}
              />
            </label>
            <button
              className="text-button"
              type="button"
              disabled={pending}
              onClick={() => setLines((v) => v.filter((_, i) => i !== index))}
            >
              Remove category {index + 1}
            </button>
          </fieldset>
        ))}
        <div className="finance-actions">
          <button
            className="button secondary"
            type="button"
            disabled={pending || lines.length >= 100}
            onClick={() =>
              setLines((v) => [...v, { category: "", amount: "" }])
            }
          >
            Add category limit
          </button>
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save monthly budget"}
          </button>
        </div>
        <Feedback error={error} />
      </form>
      {report.budget && !report.summary && (
        <p role="status">
          Spending figures are unavailable. Remaining allowances cannot be
          calculated yet.
        </p>
      )}
      {report.budget && report.summary && (
        <div className="report-table-wrap">
          <table className="report-table">
            <caption>
              Budget and refund-adjusted actuals · {report.month}
            </caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Limit</th>
                <th scope="col">Spent</th>
                <th scope="col">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {report.budget.lines.map((l) => {
                const actual = categoryActual(report, l.category);
                return (
                  <tr key={l.category ?? ""}>
                    <th scope="row">{l.category ?? "Uncategorized"}</th>
                    <td>{formatAggregateMoney(l.limit)}</td>
                    <td>{formatAggregateMoney(actual)}</td>
                    <td>
                      {formatGbpMinor(
                        BigInt(l.limit.amountMinor) -
                          BigInt(actual.amountMinor),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
