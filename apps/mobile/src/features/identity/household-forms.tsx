import {
  householdCreateSchema,
  inviteSchema,
  type MeResponse,
} from "@joint/contracts";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { Share } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback } from "@/components/identity-frame";
import { NativeField } from "@/components/native-field";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { useIdentity } from "./context";
import { useIdentityOperation } from "./use-operation";

/** An unchanged draft keeps its key after failure; editing creates a new operation. */
function useWriteKey() {
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  return (payload: string) => {
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: randomUUID() };
    return attempt.current.key;
  };
}
export function CreateHousehold(): React.JSX.Element {
  const [name, setName] = useState("");
  const identity = useIdentity(),
    operation = useIdentityOperation(),
    key = useWriteKey();
  async function create() {
    const parsed = householdCreateSchema.safeParse({ name });
    if (!parsed.success) {
      operation.setError("Name your household using 1–80 characters.");
      return;
    }
    await operation.run(async (signal, lifetime) => {
      await identity.api.createHousehold(
        parsed.data.name,
        key(parsed.data.name),
        signal,
      );
      if (lifetime.active()) await identity.refresh();
    });
  }
  return (
    <>
      <AppText variant="title">Make a home for your plans</AppText>
      <AppText>
        Your household uses GBP and the Europe/London time zone. Inviting
        another adult is optional.
      </AppText>
      <Feedback error={operation.error} />
      <NativeField
        label="Household name"
        value={name}
        onChangeText={(value) => {
          identity.interact();
          setName(value);
        }}
        autoCapitalize="words"
        maxLength={80}
        editable={!operation.pending}
      />
      <NativeActions>
        <NativeAction
          label="Create household"
          pending={operation.pending}
          onPress={() => void create()}
        />
      </NativeActions>
    </>
  );
}
export function InviteAdult({
  me,
}: {
  me: MeResponse;
}): React.JSX.Element | null {
  const [email, setEmail] = useState(""),
    [link, setLink] = useState("");
  const identity = useIdentity(),
    operation = useIdentityOperation(),
    key = useWriteKey();
  const membership = me.membership;
  if (!membership || membership.role !== "ADMIN") return null;
  async function invite() {
    if (!membership) return;
    const parsed = inviteSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      operation.setError("Enter the other adult’s email address.");
      return;
    }
    await operation.run(async (signal, lifetime) => {
      const result = await identity.api.invite(
        membership.householdId,
        parsed.data.email,
        key(`${membership.householdId}:${parsed.data.email}`),
        signal,
      );
      if (lifetime.active()) {
        setLink(`familyfund://invitation?token=${result.token}`);
        operation.setNotice(
          "Invitation ready. Share it privately with the invited adult. It expires in seven days.",
        );
      }
    });
  }
  return (
    <>
      <AppText variant="title">Invite another adult</AppText>
      <AppText>
        {membership.household.memberCount === 2
          ? "Your household already has two adults."
          : "They use their own sign-in and the email you invite. Sharing never means sharing an account."}
      </AppText>
      <Feedback error={operation.error} notice={operation.notice} />
      {membership.household.memberCount < 2 && (
        <>
          <NativeField
            label="Other adult’s email"
            value={email}
            onChangeText={(value) => {
              identity.interact();
              setEmail(value);
              setLink("");
            }}
            keyboardType="email-address"
            autoComplete="email"
            editable={!operation.pending}
          />
          <NativeActions>
            <NativeAction
              label="Create invitation"
              pending={operation.pending}
              onPress={() => void invite()}
            />
            {link && (
              <NativeAction
                label="Share invitation"
                onPress={() => {
                  void Share.share({ message: link }).catch(() =>
                    operation.setError(
                      "Sharing is unavailable. Copy the invitation link instead.",
                    ),
                  );
                }}
              />
            )}
          </NativeActions>
          {link && <AppText selectable>{link}</AppText>}
        </>
      )}
    </>
  );
}
export function AcceptInvitation(): React.JSX.Element | null {
  const identity = useIdentity(),
    operation = useIdentityOperation();
  const token = identity.invitation;
  if (!token) return null;
  async function accept() {
    if (!token) return;
    await operation.run(async (signal, lifetime) => {
      await identity.api.acceptInvitation(token, signal);
      if (lifetime.active()) {
        identity.clearInvitation();
        await identity.refresh();
      }
    });
  }
  return (
    <>
      <AppText variant="title">An invitation to share a home</AppText>
      <AppText>
        Accept only if you recognise the organiser. Your verified email must
        match the invitation.
      </AppText>
      <Feedback error={operation.error} />
      <NativeActions>
        <NativeAction
          label="Accept invitation"
          pending={operation.pending}
          onPress={() => void accept()}
        />
        <NativeAction
          label="Dismiss invitation"
          tone="text"
          disabled={operation.pending}
          onPress={identity.clearInvitation}
        />
      </NativeActions>
    </>
  );
}
