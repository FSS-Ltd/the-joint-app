import type { CsvColumn } from "@joint/contracts";
import { AccountChoice } from "../accounts/account-choice";
import { columnChoices, type MappingDraft } from "./import-mapping";

const modes = {
  "": "Choose…",
  SIGNED: "One signed amount column",
  DEBIT_CREDIT: "Separate debit and credit columns",
} as const;
const dates = {
  "": "Choose…",
  ISO: "Year-month-day, 2026-11-04",
  DMY: "Day/month/year, 04/11/2026",
  MDY: "Month/day/year, 11/04/2026",
} as const;
const decimals = {
  "": "Choose…",
  DOT: "Dot, 1,234.56",
  COMMA: "Comma, 1.234,56",
} as const;
const positives = {
  "": "Choose…",
  INFLOW: "Money in",
  OUTFLOW: "Money out",
} as const;

/** Suggestions can be edited in full, or completed one required field at a time. */
export function MappingFields({
  value,
  columns,
  onChange,
  disabled,
  missingOnly = false,
  requiresCurrencyColumn = false,
}: {
  value: MappingDraft;
  columns: readonly CsvColumn[];
  onChange(value: MappingDraft): void;
  disabled: boolean;
  missingOnly?: boolean;
  requiresCurrencyColumn?: boolean;
}): React.JSX.Element {
  const optional = columnChoices(columns);
  const required = columnChoices(columns, "Choose a column");
  const column = (
    label: string,
    field: keyof MappingDraft,
    isRequired = true,
  ) => (
    <AccountChoice
      key={field}
      label={label}
      value={value[field]}
      options={optional.options}
      labels={isRequired ? required.labels : optional.labels}
      onChange={(next) => onChange({ ...value, [field]: next })}
      disabled={disabled}
    />
  );
  const show = (field: keyof MappingDraft) =>
    !missingOnly || value[field] === "";
  return (
    <>
      {show("date") && column("Date column", "date")}
      {show("description") && column("Description column", "description")}
      {show("amountMode") && (
        <AccountChoice
          label="Amount layout"
          value={value.amountMode}
          options={["", "SIGNED", "DEBIT_CREDIT"] as const}
          labels={modes}
          onChange={(amountMode) => onChange({ ...value, amountMode })}
          disabled={disabled}
        />
      )}
      {value.amountMode === "SIGNED" &&
        show("amount") &&
        column("Amount column", "amount")}
      {value.amountMode === "DEBIT_CREDIT" && (
        <>
          {show("debit") && column("Debit column", "debit")}
          {show("credit") && column("Credit column", "credit")}
        </>
      )}
      {(!missingOnly || (requiresCurrencyColumn && show("currency"))) &&
        column(
          requiresCurrencyColumn
            ? "Currency column"
            : "Currency column, optional",
          "currency",
          requiresCurrencyColumn,
        )}
      {!missingOnly && column("Source ID column, optional", "sourceId", false)}
      {show("dateFormat") && (
        <AccountChoice
          label="Date format"
          value={value.dateFormat}
          options={["", "ISO", "DMY", "MDY"] as const}
          labels={dates}
          onChange={(dateFormat) => onChange({ ...value, dateFormat })}
          disabled={disabled}
        />
      )}
      {show("decimalSeparator") && (
        <AccountChoice
          label="Decimal separator"
          value={value.decimalSeparator}
          options={["", "DOT", "COMMA"] as const}
          labels={decimals}
          onChange={(decimalSeparator) =>
            onChange({ ...value, decimalSeparator })
          }
          disabled={disabled}
        />
      )}
      {value.amountMode === "SIGNED" && show("positiveIs") && (
        <AccountChoice
          label="Positive amounts are"
          value={value.positiveIs}
          options={["", "INFLOW", "OUTFLOW"] as const}
          labels={positives}
          onChange={(positiveIs) => onChange({ ...value, positiveIs })}
          disabled={disabled}
        />
      )}
    </>
  );
}
