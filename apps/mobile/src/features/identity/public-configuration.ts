import { readIdentityConfiguration } from "./configuration";
export const publicConfiguration = readIdentityConfiguration(
  {
    publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    authReturnUrl: process.env.EXPO_PUBLIC_AUTH_RETURN_URL,
    allowLocalHttp: process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP,
  },
  __DEV__,
);
