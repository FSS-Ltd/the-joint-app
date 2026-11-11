import {
  householdCreateSchema,
  inviteSchema,
  type MeResponse,
} from "@joint/contracts";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
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
  const router = useRouter();
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
      if (lifetime.active()) {
        try {
          router.replace("/more?setup=invite");
        } finally {
          await identity.refresh();
        }
      }
    });
  }
  return (
    <>
      <AppText variant="title" accessibilityRole="header">
        Name your household
      </AppText>
      <AppText tone="secondary">
        Your household uses GBP and the Europe/London time zone.
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
  onboarding = false,
  onInviteLater,
}: {
  me: MeResponse;
  onboarding?: boolean;
  onInviteLater?: () => void;
}): React.JSX.Element | null {
  const [email, setEmail] = useState(""),
    [link, setLink] = useState(""),
    [expanded, setExpanded] = useState(onboarding);
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
  if (membership.household.memberCount === 2)
    return (
      <AppText tone="secondary">
        Both adults have joined this household.
      </AppText>
    );
  if (!expanded) {
    return (
      <>
        <AppText variant="title" accessibilityRole="header">
          Invite another adult
        </AppText>
        <AppText tone="secondary">
          You can start on your own. Your invitation is optional.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Invite another adult"
            tone="secondary"
            onPress={() => {
              identity.interact();
              setExpanded(true);
            }}
          />
        </NativeActions>
      </>
    );
  }
  return (
    <>
      <AppText variant="title" accessibilityRole="header">
        {onboarding ? "Invite your person" : "Invite another adult"}
      </AppText>
      <AppText tone="secondary">
        {onboarding
          ? "You can start on your own and invite them later."
          : "They sign in with the email address you invite."}
      </AppText>
      <Feedback error={operation.error} notice={operation.notice} />
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
          label="Create invitation link"
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
        <NativeAction
          label="Invite later"
          tone={onboarding ? "secondary" : "text"}
          disabled={operation.pending}
          onPress={() => {
            if (operation.pending) return;
            identity.interact();
            if (onboarding && onInviteLater) onInviteLater();
            else setExpanded(false);
          }}
        />
      </NativeActions>
      {onboarding && (
        <AppText tone="secondary">
          Continue to Accounts without a partner. Share invitation links
          privately.
        </AppText>
      )}
      {link && <AppText selectable>{link}</AppText>}
      <AppText tone="secondary">
        You choose which accounts to share. Unshared accounts stay private.
      </AppText>
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
