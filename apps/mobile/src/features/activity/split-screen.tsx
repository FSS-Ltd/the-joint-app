import { classificationKindSchema } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { AccountChoice } from "../accounts/account-choice";
import { kindLabels } from "./kind-labels";
import {
  blankSplitLine,
  maxSplitLines,
  splitRemaining,
  type SplitLineDraft,
} from "./split-input";
import { TransactionWriteBoundary } from "./transaction-write-boundary";
import { useSplitWrite } from "./use-split-write";

function allocation(remaining: string | null): string {
  if (remaining === null)
    return "Check the amounts: use pounds and pence, such as -7.05.";
  if (remaining === "0") return "Fully allocated.";
  return `Left to allocate: ${formatAggregateMoney({ amountMinor: remaining, currency: "GBP" })}`;
}

export function SplitScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const session = useSplitWrite(transactionId);
  const { draft, mutation, editable } = session;
  const base = draft.base;
  const lines = draft.value.lines;
  const change = (index: number, next: Partial<SplitLineDraft>) =>
    draft.change({
      lines: lines.map((line, i) =>
        i === index ? { ...line, ...next } : line,
      ),
    });
  return (
    <TransactionWriteBoundary
      session={session}
      transactionId={transactionId}
      title="Split across categories"
    >
      {base && (
        <>
          <AppText>
            Components replace this record in reports. Use negative amounts for
            spending and positive amounts for refunds or income.
          </AppText>
          <AppText accessibilityLiveRegion="polite">
            {allocation(splitRemaining(base, draft.value))}
          </AppText>
          {lines.map((line, index) => (
            <SplitComponent
              key={index}
              index={index}
              line={line}
              editable={editable}
              removable={lines.length > 2}
              onChange={(next) => change(index, next)}
              onRemove={() =>
                draft.change({ lines: lines.filter((_, i) => i !== index) })
              }
            />
          ))}
          <NativeActions>
            <NativeAction
              label="Add component"
              tone="secondary"
              disabled={!editable || lines.length >= maxSplitLines}
              onPress={() =>
                base &&
                draft.change({ lines: [...lines, blankSplitLine(base)] })
              }
            />
            <NativeAction
              label="Save split"
              disabled={!editable}
              pending={mutation.kind === "pending"}
              onPress={() => void session.submit()}
            />
            {base.splits.length > 0 && (
              <NativeAction
                label="Clear split"
                tone="secondary"
                disabled={!editable}
                onPress={() => void session.submit({ lines: [] })}
              />
            )}
          </NativeActions>
        </>
      )}
    </TransactionWriteBoundary>
  );
}

function SplitComponent({
  index,
  line,
  editable,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  line: SplitLineDraft;
  editable: boolean;
  removable: boolean;
  onChange(next: Partial<SplitLineDraft>): void;
  onRemove(): void;
}): React.JSX.Element {
  const name = `Component ${index + 1}`;
  return (
    <>
      <AppText variant="heading" accessibilityRole="header">
        {name}
      </AppText>
      <NativeField
        label={`${name} category`}
        value={line.category}
        onChangeText={(category) => onChange({ category })}
        autoCapitalize="sentences"
        maxLength={80}
        editable={editable}
      />
      <NativeField
        label={`${name} amount in GBP`}
        value={line.amount}
        onChangeText={(amount) => onChange({ amount })}
        keyboardType="numbers-and-punctuation"
        editable={editable}
      />
      <AccountChoice
        label={`${name} type`}
        value={line.classificationKind}
        options={classificationKindSchema.options}
        labels={kindLabels}
        onChange={(classificationKind) => onChange({ classificationKind })}
        disabled={!editable}
      />
      {removable && (
        <NativeActions>
          <NativeAction
            label={`Remove ${name.toLowerCase()}`}
            tone="text"
            disabled={!editable}
            onPress={onRemove}
          />
        </NativeActions>
      )}
    </>
  );
}
