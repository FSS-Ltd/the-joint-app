"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { type TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { request, errorMessage, RequestError } from "../identity/client";
import { isAccessError } from "../finance/access-error";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { useAccountList } from "../accounts/use-account-list";
export function TransferForm({
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
  const accounts = useAccountList(householdId),
    [accountId, setAccountId] = useState(""),
    [items, setItems] = useState<TransactionResponse[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [pair, setPair] = useState<{
      id: string;
      from: TransactionResponse;
      to: TransactionResponse;
    } | null>(null);
  const base = `/api/households/${householdId}/transfers`;
  useEffect(() => {
    let current = true;
    setPair(null);
    if (transaction.transfer?.id)
      void request<{
        id: string;
        from: TransactionResponse;
        to: TransactionResponse;
      }>(`${base}/${transaction.transfer?.id}`)
        .then((v) => {
          if (current) setPair(v);
        })
        .catch((cause) => {
          if (current && isAccessError(cause)) unavailable?.();
          if (current) setError(errorMessage(cause));
        });
    return () => {
      current = false;
    };
  }, [base, transaction.transfer?.id, transaction.version]);
  useEffect(() => {
    let current = true;
    setItems([]);
    setCursor(null);
    setSelected("");
    setError("");
    if (!accountId) return;
    void request<{ items: TransactionResponse[]; nextCursor: string | null }>(
      `${financePath(householdId, "transactions")}?${new URLSearchParams({ accountId, limit: "50" })}`,
    )
      .then((v) => {
        if (current) {
          setItems(v.items);
          setCursor(v.nextCursor);
        }
      })
      .catch((cause) => {
        if (current && isAccessError(cause)) unavailable?.();
        if (current) setError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [householdId, accountId, transaction.version]);
  async function more() {
    if (!cursor) return;
    setPending(true);
    try {
      const v = await request<{
        items: TransactionResponse[];
        nextCursor: string | null;
      }>(
        `${financePath(householdId, "transactions")}?${new URLSearchParams({ accountId, limit: "50", cursor })}`,
      );
      setItems((vv) => [...vv, ...v.items]);
      setCursor(v.nextCursor);
    } catch (cause) {
      if (isAccessError(cause)) unavailable?.();
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const other = items.find((v) => v.id === selected);
    if (!other) return;
    setPending(true);
    setError("");
    const [from, to] =
      BigInt(transaction.money.amountMinor) < 0n
        ? [transaction, other]
        : [other, transaction];
    try {
      const result = await request<{
        id: string;
        from: TransactionResponse;
        to: TransactionResponse;
      }>(
        `${base}/confirm`,
        {
          fromTransactionId: from.id,
          toTransactionId: to.id,
          fromVersion: from.version,
          toVersion: to.version,
        },
        crypto.randomUUID(),
      );
      saved(result.from.id === transaction.id ? result.from : result.to);
    } catch (cause) {
      if (isAccessError(cause)) unavailable?.();
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!pair) return;
    setPending(true);
    setError("");
    try {
      const csrf = await request<{ csrfToken: string }>("/api/auth/csrf");
      const response = await fetch(`${base}/${pair.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf.csrfToken,
        },
        body: JSON.stringify({
          fromVersion: pair.from.version,
          toVersion: pair.to.version,
        }),
      });
      if (!response.ok)
        throw new RequestError(
          "This pair could not be removed. Reload the transaction and try again.",
          response.status,
        );
      const result: unknown = await response.json();
      const { transferResultSchema } = await import("@joint/contracts");
      const parsed = transferResultSchema.parse(result);
      saved(parsed.from.id === transaction.id ? parsed.from : parsed.to);
    } catch (cause) {
      if (isAccessError(cause)) unavailable?.();
      setError(
        "This pair changed or could not be removed. Reload the transaction and try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card">
      <h2>
        {transaction.transfer?.confirmed
          ? "Confirmed transfer"
          : "Link a transfer"}
      </h2>
      <p>
        Pair equal and opposite entries between two accounts you own. This
        records a relationship; it never moves money.
      </p>
      {transaction.transfer?.confirmed ? (
        <>
          {pair && (
            <p>
              {pair.from.description} ↔ {pair.to.description}
            </p>
          )}
          {transaction.transfer?.canRemove && (
            <button
              className="button secondary"
              type="button"
              disabled={pending || !pair}
              onClick={() => void remove()}
            >
              Remove transfer pair
            </button>
          )}
        </>
      ) : (
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label>
            Other account
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              disabled={pending}
            >
              <option value="">Choose an owned account</option>
              {accounts.items
                .filter(
                  (a) =>
                    a.ownership === "OWNED" && a.id !== transaction.accountId,
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
            </select>
          </label>
          {accounts.nextCursor && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void accounts.load(accounts.nextCursor ?? undefined)
              }
            >
              Load more owned accounts
            </button>
          )}
          <label>
            Matching entry
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              required
              disabled={!accountId || pending}
            >
              <option value="">Choose the opposite booked entry</option>
              {items
                .filter(
                  (v) =>
                    BigInt(v.money.amountMinor) ===
                      -BigInt(transaction.money.amountMinor) &&
                    !v.transfer?.confirmed &&
                    !v.splits.length,
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.bookedDate} · {v.description} · {formatMoney(v.money)}
                  </option>
                ))}
            </select>
          </label>
          {cursor && (
            <button
              type="button"
              disabled={pending}
              className="text-button"
              onClick={() => void more()}
            >
              Load more matching activity
            </button>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={pending || !selected}
          >
            Confirm transfer pair
          </button>
        </form>
      )}
      <Feedback error={accounts.error || error} />
    </section>
  );
}
