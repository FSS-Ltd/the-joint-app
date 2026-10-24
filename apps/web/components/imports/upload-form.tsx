"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  csvInspectionSchema,
  csvMappingSchema,
  importJobResultSchema,
  MAX_CSV_BYTES,
  type CsvColumn,
} from "@joint/contracts";
import { MappingFields } from "./mapping-fields";
import { ImportSteps } from "./steps";
import { errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath, uploadCsv } from "../finance/http";

export function UploadForm({
  householdId,
  accountId,
}: {
  householdId: string;
  accountId: string;
}): ReactNode {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<{
    columns: CsvColumn[];
    rowCount: number;
  } | null>(null);
  const [mode, setMode] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setPending(true);
    setError("");
    try {
      setInspection(
        await uploadCsv(
          `${financePath(householdId, "imports")}/inspect`,
          file,
          accountId,
          csvInspectionSchema,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !inspection) return;
    const form = new FormData(event.currentTarget);
    const index = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value !== "" ? Number(value) : null;
    };
    const parsed = csvMappingSchema.safeParse({
      date: index("date"),
      description: index("description"),
      amount: mode === "SIGNED" ? index("amount") : null,
      debit: mode === "DEBIT_CREDIT" ? index("debit") : null,
      credit: mode === "DEBIT_CREDIT" ? index("credit") : null,
      currency: index("currency"),
      sourceId: index("sourceId"),
      dateFormat: form.get("dateFormat"),
      decimalSeparator: form.get("decimalSeparator"),
      amountMode: mode,
      positiveIs: mode === "SIGNED" ? form.get("positiveIs") : "INFLOW",
    });
    if (!parsed.success) {
      setError(
        "Choose different columns for each field and select every date, decimal and sign convention.",
      );
      return;
    }
    const idempotencyKey = key || crypto.randomUUID();
    setKey(idempotencyKey);
    setPending(true);
    setError("");
    try {
      const result = await uploadCsv(
        `${financePath(householdId, "imports")}/preview`,
        file,
        accountId,
        importJobResultSchema,
        parsed.data,
        idempotencyKey,
      );
      setFile(null);
      window.location.assign(
        `/imports/${result.batch.id}?account=${accountId}`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card import-upload">
      <ImportSteps stage={inspection ? "map" : "inspect"} />
      <p className="step-label">Your file, your choices</p>
      <h2>Import a CSV</h2>
      <p>
        Choose a UTF-8 CSV of up to 10 MiB and 50,000 data rows. Your file is
        inspected before you map its columns.
      </p>
      <form className="form-stack" onSubmit={inspect} aria-busy={pending}>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            required
            disabled={pending}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setInspection(null);
              setMode("");
              setKey("");
              setError("");
              if (next && next.size > MAX_CSV_BYTES) {
                setFile(null);
                setError("Choose a CSV file of 10 MiB or less.");
              } else setFile(next);
            }}
          />
        </label>
        <button
          className="button secondary"
          disabled={pending || !file}
          type="submit"
        >
          {pending && !inspection ? "Inspecting file…" : "Inspect columns"}
        </button>
      </form>
      {inspection && (
        <form
          className="form-stack import-mapping"
          onSubmit={preview}
          onChange={() => setKey("")}
          aria-busy={pending}
        >
          <p className="finance-warning">
            {inspection.rowCount.toLocaleString("en-GB")} data rows found.
            Choose the meaning of every column explicitly; nothing is guessed.
          </p>
          <MappingFields
            columns={inspection.columns}
            pending={pending}
            mode={mode}
            setMode={setMode}
          />
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? "Queueing preview…" : "Create preview"}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
      <Feedback error={error} />
      <p className="field-hint">
        Original files are encrypted locally, retained for at most seven days
        after commit, and can be deleted earlier. Preview retention is 24 hours.
      </p>
    </section>
  );
}
