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

/** Every convention is an explicit choice; nothing is guessed from the file. */
export function MappingFields({
  value,
  columns,
  onChange,
  disabled,
}: {
  value: MappingDraft;
  columns: readonly CsvColumn[];
  onChange(value: MappingDraft): void;
  disabled: boolean;
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
  return (
    <>
      {column("Date column", "date")}
      {column("Description column", "description")}
      <AccountChoice
        label="Amount layout"
        value={value.amountMode}
        options={["", "SIGNED", "DEBIT_CREDIT"] as const}
        labels={modes}
        onChange={(amountMode) => onChange({ ...value, amountMode })}
        disabled={disabled}
      />
      {value.amountMode === "SIGNED" && column("Amount column", "amount")}
      {value.amountMode === "DEBIT_CREDIT" && (
        <>
          {column("Debit column", "debit")}
          {column("Credit column", "credit")}
        </>
      )}
      {column("Currency column, optional", "currency", false)}
      {column("Source ID column, optional", "sourceId", false)}
      <AccountChoice
        label="Date format"
        value={value.dateFormat}
        options={["", "ISO", "DMY", "MDY"] as const}
        labels={dates}
        onChange={(dateFormat) => onChange({ ...value, dateFormat })}
        disabled={disabled}
      />
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
      {value.amountMode === "SIGNED" && (
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
