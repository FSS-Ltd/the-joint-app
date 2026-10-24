import type { ReactNode } from "react";
import type { CsvColumn } from "@joint/contracts";

function Column({
  label,
  name,
  columns,
  required = false,
}: {
  label: string;
  name: string;
  columns: CsvColumn[];
  required?: boolean;
}): ReactNode {
  return (
    <label>
      {label}
      <select name={name} required={required} defaultValue="">
        <option value="">
          {required ? "Choose a column" : "Not included"}
        </option>
        {columns.map((column) => (
          <option key={column.index} value={column.index}>
            {column.index + 1}. {column.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MappingFields({
  columns,
  pending,
  mode,
  setMode,
}: {
  columns: CsvColumn[];
  pending: boolean;
  mode: string;
  setMode: (mode: string) => void;
}): ReactNode {
  return (
    <fieldset disabled={pending}>
      <legend>Columns and conventions</legend>
      <div className="form-stack">
        <Column name="date" label="Date column" columns={columns} required />
        <Column
          name="description"
          label="Description column"
          columns={columns}
          required
        />
        <label>
          Date format
          <select name="dateFormat" required defaultValue="">
            <option value="" disabled>
              Choose a date format
            </option>
            <option value="ISO">Year-month-day (ISO)</option>
            <option value="DMY">Day/month/year (UK)</option>
            <option value="MDY">Month/day/year (US)</option>
          </select>
        </label>
        <label>
          Decimal separator
          <select name="decimalSeparator" required defaultValue="">
            <option value="" disabled>
              Choose a decimal separator
            </option>
            <option value="DOT">Decimal point: 12.34</option>
            <option value="COMMA">Decimal comma: 12,34</option>
          </select>
        </label>
        <label className="import-amount-layout">
          Amount columns
          <select
            required
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="" disabled>
              Choose an amount layout
            </option>
            <option value="SIGNED">One signed amount column</option>
            <option value="DEBIT_CREDIT">
              Separate debit and credit columns
            </option>
          </select>
        </label>
        {mode === "SIGNED" && (
          <>
            <Column
              name="amount"
              label="Amount column"
              columns={columns}
              required
            />
            <label>
              Positive amounts mean
              <select name="positiveIs" required defaultValue="">
                <option value="" disabled>
                  Choose a sign convention
                </option>
                <option value="INFLOW">Money coming in</option>
                <option value="OUTFLOW">Money going out</option>
              </select>
            </label>
          </>
        )}
        {mode === "DEBIT_CREDIT" && (
          <>
            <Column
              name="debit"
              label="Debit column"
              columns={columns}
              required
            />
            <Column
              name="credit"
              label="Credit column"
              columns={columns}
              required
            />
            <p className="field-hint">
              Debit means money going out; credit means money coming in.
            </p>
          </>
        )}
        <Column
          name="currency"
          label="Currency column (optional)"
          columns={columns}
        />
        <Column
          name="sourceId"
          label="Stable source ID column (optional)"
          columns={columns}
        />
        <p className="field-hint">
          Without a currency column, values use GBP. Map a source ID only if
          your source gives each transaction a stable identifier. Similar date,
          amount or description never identifies a duplicate by itself.
        </p>
      </div>
    </fieldset>
  );
}
