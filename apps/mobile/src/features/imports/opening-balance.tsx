import { useState } from "react";
import type { Money, ValuationInput } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { WriteFeedback } from "../accounts/write-feedback";
import type { ImportFlow } from "./use-import-flow";

export function OpeningBalance({
  flow,
  statement,
}: {
  flow: ImportFlow;
  statement?: { money: Money; asOfDate: string };
}): React.JSX.Element {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const mutation = flow.openingMutation;
  const editable = flow.editable && !!flow.account?.permissions.canValue;
  const input: ValuationInput | undefined = statement && {
    money: statement.money,
    asOfDate: statement.asOfDate,
  };
  return (
    <>
      <AppText variant="title" accessibilityRole="header">
        {flow.needsOpening ? "Record a starting balance" : "Statement balance"}
      </AppText>
      <AppText>
        {flow.needsOpening
          ? "Enter the balance before transactions on the selected date. The adult-owned portion remains unknown."
          : "You can record the statement closing balance. The adult-owned portion remains unknown."}
      </AppText>
      {!flow.account?.permissions.canValue && !flow.preservingDraft && (
        <AppText>
          You need permission to record a balance for this account.
        </AppText>
      )}
      {input && (
        <NativeActions>
          <NativeAction
            label="Use statement balance"
            tone="secondary"
            disabled={!editable}
            onPress={() => void flow.saveStatementBalance(input)}
          />
        </NativeActions>
      )}
      {input && (
        <AppText>
          Statement closing balance · {formatMoney(input.money)} ·{" "}
          {input.asOfDate}. Confirming records this value.
        </AppText>
      )}
      {flow.needsOpening && (
        <>
          <NativeField
            label="Opening balance in GBP"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numbers-and-punctuation"
            editable={editable}
          />
          <NativeField
            label="Opening date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            editable={editable}
          />
          <NativeActions>
            <NativeAction
              label="Save opening balance"
              disabled={!editable}
              pending={mutation.kind === "pending"}
              onPress={() => void flow.saveOpening(amount, date)}
            />
          </NativeActions>
        </>
      )}
      {mutation.kind === "success" &&
        (flow.resource.kind === "ready" &&
        flow.needsOpening &&
        flow.resource.value.version >= mutation.value.version ? (
          <>
            <AppText accessibilityLiveRegion="polite">
              The saved balance cannot be used as the starting value. Record a
              usable value to continue.
            </AppText>
            <NativeActions>
              <NativeAction
                label="Correct opening balance"
                onPress={flow.correctOpening}
              />
            </NativeActions>
          </>
        ) : (
          <AppText accessibilityLiveRegion="polite">
            Checking the saved balance before preview…
          </AppText>
        ))}
      {!flow.preservingDraft &&
        mutation.kind === "error" &&
        mutation.recovery !== "security" && (
          <>
            <AppText accessibilityLiveRegion="polite">
              {mutation.message}
            </AppText>
            <NativeActions>
              <NativeAction
                label="Correct opening balance"
                tone="secondary"
                onPress={flow.correctOpening}
              />
            </NativeActions>
          </>
        )}
      {!flow.preservingDraft &&
        (mutation.kind === "uncertain" ||
          (mutation.kind === "error" && mutation.recovery === "security")) && (
          <WriteFeedback mutation={mutation} reload={flow.reload} />
        )}
    </>
  );
}
