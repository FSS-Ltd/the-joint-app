import { emailSchema, passwordResetSchema } from "@joint/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { AppText } from "@/components/app-text";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { useIdentity } from "./context";
import { useNativeAuthFlow, type AuthMode } from "./use-auth-flow";

export function AuthScreen({ mode }: { mode: AuthMode }): React.JSX.Element {
  const flow = useNativeAuthFlow(mode),
    identity = useIdentity(),
    router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [code, setCode] = useState(""),
    [username, setUsername] = useState("");
  const [backup, setBackup] = useState(false),
    [validation, setValidation] = useState("");
  const credentials = flow.stage.step === "credentials";
  const passwordVisible =
    (credentials && mode !== "recovery") || flow.stage.step === "password";
  const newPassword = mode === "sign-up" || flow.stage.step === "password";
  const codeVisible = flow.stage.step === "email" || flow.stage.step === "mfa";
  function change(update: (value: string) => void) {
    return (value: string) => {
      identity.interact();
      update(value);
    };
  }
  async function submit() {
    if (identity.googlePending) return;
    setValidation("");
    if (credentials && !emailSchema.safeParse(email.trim()).success) {
      setValidation("Enter a valid email address.");
      return;
    }
    if (
      passwordVisible &&
      (newPassword
        ? !passwordResetSchema.safeParse({ password }).success ||
          password !== confirm
        : !password || password.length > 128)
    ) {
      setValidation(
        newPassword
          ? "Use 12–128 characters and match both passwords."
          : "Enter your password.",
      );
      return;
    }
    if (
      codeVisible &&
      !(backup ? code.trim().length > 0 : /^\d{6}$/.test(code.trim()))
    ) {
      setValidation("Enter your verification code.");
      return;
    }
    if (
      flow.stage.step === "username" &&
      !/^(?=.*[A-Za-z])[A-Za-z0-9_-]{4,64}$/.test(username)
    ) {
      setValidation(
        "Use 4–64 letters, numbers, hyphens or underscores, with at least one letter.",
      );
      return;
    }
    const ok = await flow.submit(
      email.trim(),
      password,
      code.trim(),
      backup,
      username,
    );
    if (ok) {
      setPassword("");
      setConfirm("");
      setCode("");
    }
  }
  const title = credentials
    ? mode === "sign-up"
      ? "Make room for what matters."
      : mode === "recovery"
        ? "Find your way back."
        : "Welcome home."
    : flow.stage.step === "username"
      ? "Choose your username."
      : flow.stage.step === "password"
        ? "A fresh password."
        : "One more check.";
  return (
    <IdentityFrame
      title={title}
      description={
        credentials
          ? "Your own sign-in. A shared home, when you choose."
          : "Keep your account private and protected."
      }
    >
      <Feedback error={validation || flow.error} notice={flow.notice} />
      {credentials && (
        <NativeField
          label="Email address"
          value={email}
          onChangeText={change(setEmail)}
          keyboardType="email-address"
          autoComplete="email"
          maxLength={254}
          editable={!flow.pending && !identity.googlePending}
        />
      )}
      {passwordVisible && (
        <>
          <NativeField
            label={newPassword ? "New password" : "Password"}
            value={password}
            onChangeText={change(setPassword)}
            password
            autoComplete={newPassword ? "new-password" : "current-password"}
            maxLength={128}
            editable={!flow.pending && !identity.googlePending}
          />
          {newPassword && (
            <>
              <AppText>Use 12–128 characters.</AppText>
              <NativeField
                label="Confirm password"
                value={confirm}
                onChangeText={change(setConfirm)}
                password
                autoComplete="new-password"
                maxLength={128}
                editable={!flow.pending && !identity.googlePending}
              />
            </>
          )}
        </>
      )}
      {flow.stage.step === "username" && (
        <NativeField
          label="Username"
          value={username}
          onChangeText={change(setUsername)}
          autoComplete="username"
          maxLength={64}
          editable={!flow.pending && !identity.googlePending}
        />
      )}
      {codeVisible && (
        <>
          <AppText>
            {flow.stage.step === "email"
              ? "Enter the six-digit code from your email."
              : backup
                ? "Use one of your private, single-use backup codes. Household access still requires an authenticator."
                : "Enter the current code from your authenticator app."}
          </AppText>
          <NativeField
            label={backup ? "Backup code" : "Verification code"}
            value={code}
            onChangeText={change(setCode)}
            keyboardType={backup ? "default" : "number-pad"}
            autoComplete="one-time-code"
            maxLength={backup ? 64 : 6}
            editable={!flow.pending && !identity.googlePending}
          />
        </>
      )}
      <NativeActions>
        <NativeAction
          label={
            credentials && mode === "recovery"
              ? "Send recovery code"
              : "Continue"
          }
          pending={flow.pending}
          onPress={() => void submit()}
        />
        {flow.stage.step === "email" && (
          <NativeAction
            label={
              flow.resendReady
                ? "Send a new code"
                : "New code available shortly"
            }
            disabled={flow.pending || !flow.resendReady}
            onPress={() => void flow.resend()}
          />
        )}
        {flow.stage.step === "mfa" && flow.backupAvailable && (
          <NativeAction
            label={backup ? "Use authenticator" : "Use a backup code"}
            disabled={flow.pending || identity.googlePending}
            onPress={() => {
              setBackup(!backup);
              setCode("");
            }}
          />
        )}
        {credentials && mode !== "recovery" && identity.google && (
          <NativeAction
            label="Continue with Google"
            tone="secondary"
            disabled={flow.pending || identity.googlePending}
            onPress={() => {
              void identity
                .google?.()
                .catch(() =>
                  setValidation(
                    "Google sign-in could not complete. Please try again.",
                  ),
                );
            }}
          />
        )}
        {credentials && mode === "sign-in" && (
          <>
            <NativeAction
              label="Create an account"
              tone="secondary"
              disabled={flow.pending || identity.googlePending}
              onPress={() => router.push("/sign-up")}
            />
            <NativeAction
              label="Forgot password?"
              tone="text"
              disabled={flow.pending || identity.googlePending}
              onPress={() => router.push("/recovery")}
            />
          </>
        )}
        {!credentials && (
          <NativeAction
            label="Start again"
            tone="text"
            disabled={flow.pending || identity.googlePending}
            onPress={() => void flow.restart()}
          />
        )}
        {mode !== "sign-in" && (
          <NativeAction
            label="Back to sign in"
            tone="text"
            disabled={flow.pending || identity.googlePending}
            onPress={() => router.replace("/")}
          />
        )}
      </NativeActions>
    </IdentityFrame>
  );
}
