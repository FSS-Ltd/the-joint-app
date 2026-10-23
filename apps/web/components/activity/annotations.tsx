"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";

type Classification = Pick<TransactionResponse, "category" | "merchant">;
export function ClassificationForm({
  householdId,
  transaction,
  saved,
}: {
  householdId: string;
  transaction: TransactionResponse;
  saved: (transaction: TransactionResponse) => void;
}): ReactNode {
  const [previous, setPrevious] = useState<Classification | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function change(value: Classification, undo = false) {
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const result = await request<TransactionResponse>(
        `${financePath(householdId, "transactions", transaction.id)}/annotation`,
        value,
        undefined,
        { method: "PATCH", ifMatch: transaction.version },
      );
      setPrevious(
        undo
          ? null
          : { category: transaction.category, merchant: transaction.merchant },
      );
      saved(result);
      setSuccess(
        undo ? "Classification change undone." : "Classification saved.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void change({
      category: String(form.get("category")).trim() || null,
      merchant: String(form.get("merchant")).trim() || null,
    });
  }
  return (
    <section className="surface form-card">
      <h2>Classification</h2>
      <p>
        Category and merchant are visible to adults with Values and details
        access. The original description remains unchanged.
      </p>
      <form className="form-stack" onSubmit={submit} aria-busy={pending}>
        <label>
          Category
          <input
            key={`category-${transaction.version}`}
            name="category"
            maxLength={80}
            defaultValue={transaction.category ?? ""}
            disabled={pending}
          />
        </label>
        <label>
          Merchant
          <input
            key={`merchant-${transaction.version}`}
            name="merchant"
            maxLength={120}
            defaultValue={transaction.merchant ?? ""}
            disabled={pending}
          />
        </label>
        <button className="button primary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save classification"}
        </button>
      </form>
      <div className="finance-actions">
        {previous && (
          <button
            className="text-button"
            disabled={pending}
            type="button"
            onClick={() => void change(previous, true)}
          >
            Undo last classification change
          </button>
        )}
        {(transaction.category || transaction.merchant) && (
          <button
            className="text-button"
            disabled={pending}
            type="button"
            onClick={() => void change({ category: null, merchant: null })}
          >
            Clear classification
          </button>
        )}
      </div>
      <Feedback error={error} success={success} />
    </section>
  );
}
export function PrivateNoteForm({
  householdId,
  transaction,
  saved,
}: {
  householdId: string;
  transaction: TransactionResponse;
  saved: (transaction: TransactionResponse) => void;
}): ReactNode {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setSuccess("");
    try {
      saved(
        await request<TransactionResponse>(
          `${financePath(householdId, "transactions", transaction.id)}/annotation`,
          {
            note: String(form.get("note")).trim() || null,
            noteVersion: transaction.note.version,
          },
          undefined,
          { method: "PATCH", ifMatch: transaction.version },
        ),
      );
      setSuccess("Your private note was saved.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card">
      <p className="step-label">Only you</p>
      <h2>Your private note</h2>
      <p>
        This note is visible only to you, including on a shared account. Leave
        it empty to delete it.
      </p>
      <form className="form-stack" onSubmit={submit} aria-busy={pending}>
        <label>
          Private note
          <textarea
            key={transaction.note.version}
            name="note"
            maxLength={2000}
            rows={5}
            defaultValue={transaction.note.body ?? ""}
            disabled={pending}
          />
        </label>
        <button className="button primary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save private note"}
        </button>
        <Feedback error={error} success={success} />
      </form>
    </section>
  );
}
