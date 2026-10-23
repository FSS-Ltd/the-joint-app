"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  classificationKindSchema,
  type TransactionResponse,
} from "@joint/contracts";
import { request, errorMessage } from "../identity/client";
import { isAccessError } from "../finance/access-error";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { KindOptions } from "./kinds";

type Classification = Pick<
  TransactionResponse,
  "category" | "merchant" | "classificationKind"
>;
export function ClassificationForm({
  householdId,
  transaction,
  saved,
  unavailable,
}: {
  householdId: string;
  transaction: TransactionResponse;
  saved: (transaction: TransactionResponse) => void;
  unavailable?: () => void;
}): ReactNode {
  const [previous, setPrevious] = useState<Classification | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function change(value: Partial<Classification>, undo = false) {
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const body =
        transaction.transfer?.confirmed || transaction.splits.length > 0
          ? { merchant: value.merchant }
          : value;
      const result = await request<TransactionResponse>(
        `${financePath(householdId, "transactions", transaction.id)}/annotation`,
        body,
        undefined,
        { method: "PATCH", ifMatch: transaction.version },
      );
      setPrevious(
        undo
          ? null
          : {
              category: transaction.category,
              merchant: transaction.merchant,
              classificationKind: transaction.classificationKind,
            },
      );
      saved(result);
      setSuccess(
        undo ? "Classification change undone." : "Classification saved.",
      );
    } catch (cause) {
      if (isAccessError(cause)) unavailable?.();
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void change({
      classificationKind:
        transaction.transfer?.confirmed || transaction.splits.length > 0
          ? transaction.classificationKind
          : form.get("classificationKind")
            ? classificationKindSchema.parse(form.get("classificationKind"))
            : null,
      category:
        transaction.transfer?.confirmed || transaction.splits.length > 0
          ? transaction.category
          : String(form.get("category")).trim() || null,
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
      {(transaction.transfer?.confirmed || transaction.splits.length > 0) && (
        <p className="field-hint">
          Financial type and category use the confirmed pair or split
          components. Remove the pair or clear the split before changing them.
          Merchant remains editable.
        </p>
      )}
      <form className="form-stack" onSubmit={submit} aria-busy={pending}>
        <label>
          Financial type
          <select
            name="classificationKind"
            key={`kind-${transaction.version}`}
            defaultValue={transaction.classificationKind ?? ""}
            disabled={
              pending ||
              transaction.transfer?.confirmed ||
              transaction.splits.length > 0
            }
          >
            <option value="">Unreviewed default</option>
            <KindOptions />
          </select>
        </label>
        <label>
          Category
          <input
            key={`category-${transaction.version}`}
            name="category"
            maxLength={80}
            defaultValue={transaction.category ?? ""}
            disabled={
              pending ||
              transaction.transfer?.confirmed ||
              transaction.splits.length > 0
            }
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
        {previous &&
          !transaction.transfer?.confirmed &&
          !transaction.splits.length && (
            <button
              className="text-button"
              disabled={pending}
              type="button"
              onClick={() => void change(previous, true)}
            >
              Undo last classification change
            </button>
          )}
        {(transaction.category ||
          transaction.merchant ||
          transaction.classificationKind) &&
          !transaction.transfer?.confirmed &&
          !transaction.splits.length && (
            <button
              className="text-button"
              disabled={pending}
              type="button"
              onClick={() =>
                void change({
                  category: null,
                  merchant: null,
                  classificationKind: null,
                })
              }
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
  unavailable,
}: {
  householdId: string;
  transaction: TransactionResponse;
  saved: (transaction: TransactionResponse) => void;
  unavailable?: () => void;
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
      if (isAccessError(cause)) unavailable?.();
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
