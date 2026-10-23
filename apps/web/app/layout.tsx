import type { ReactNode } from "react";
import "./globals.css";
import { OfflineRegistration } from "../components/finance/offline-registration";
import { connection } from "next/server";
import { authUiConfiguration } from "../lib/server/auth-ui";
import { ClerkRuntimeBridge } from "../components/identity/clerk/provider";
import { ClerkProvider } from "@clerk/nextjs";
export const metadata = {
  title: "The Family Fund App",
  description:
    "Household finance, built around shared goals and individual privacy.",
};
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  await connection();
  const configuration = authUiConfiguration(process.env);
  const content = (
    <>
      <OfflineRegistration />
      {children}
    </>
  );
  return (
    <html lang="en-GB">
      <body>
        {configuration.provider === "clerk" ? (
          <ClerkProvider
            publishableKey={configuration.publishableKey}
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            taskUrls={{
              "setup-mfa": "/security",
              "reset-password": "/auth/task/password",
            }}
          >
            <ClerkRuntimeBridge>{content}</ClerkRuntimeBridge>
          </ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
