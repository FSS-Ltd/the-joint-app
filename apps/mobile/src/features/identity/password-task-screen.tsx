import { useClerk, useUser } from "@clerk/expo";
import { passwordResetSchema } from "@joint/contracts";
import { useState } from "react";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { SessionActions } from "./session-actions";
import { useIdentity } from "./context";
import { useIdentityOperation } from "./use-operation";
export function PasswordTaskScreen(): React.JSX.Element {
  const { user } = useUser(),
    clerk = useClerk(),
    identity = useIdentity(),
    operation = useIdentityOperation();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  async function submit() {
    if (
      !passwordResetSchema.safeParse({ password }).success ||
      password !== confirm
    ) {
      operation.setError("Use 12–128 characters and match both passwords.");
      return;
    }
    await operation.run(async (signal) => {
      if (!user) throw new Error();
      await user.updatePassword({
        newPassword: password,
        signOutOfOtherSessions: true,
      });
      if (signal.aborted) return;
      setPassword("");
      setConfirm("");
      await clerk.session?.reload();
      await identity.refresh();
    });
  }
  return (
    <IdentityFrame
      title="A fresh password."
      description="Complete your account security check before continuing."
    >
      <Feedback error={operation.error} />
      <NativeField
        label="New password"
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="new-password"
        maxLength={128}
        editable={!operation.pending}
      />
      <NativeField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        password
        autoComplete="new-password"
        maxLength={128}
        editable={!operation.pending}
      />
      <NativeActions>
        <NativeAction
          label="Save password"
          pending={operation.pending}
          onPress={() => void submit()}
        />
      </NativeActions>
      <SessionActions />
    </IdentityFrame>
  );
}
