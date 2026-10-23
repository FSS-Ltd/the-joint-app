export type AuthMode = "sign-in" | "sign-up" | "recovery";
export const authContent = {
  "sign-in": {
    eyebrow: "Welcome back",
    title: "Make room for together.",
    description: "Sign in to your household, with a little space for yourself.",
    heading: "Sign in",
    action: "Sign in",
  },
  "sign-up": {
    eyebrow: "A fresh start",
    title: "Better, together.",
    description: "Create your account. Then make a home for your shared plans.",
    heading: "Create your account",
    action: "Create account",
  },
  recovery: {
    eyebrow: "Here to help",
    title: "Find your way back.",
    description: "A few small steps to safely return to your account.",
    heading: "Reset your password",
    action: "Send recovery code",
  },
};
