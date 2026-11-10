import { SessionBoundary } from "../components/identity/session/boundary";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { OfflineRegistration } from "../components/finance/offline-registration";
import { connection } from "next/server";
import { authUiConfiguration } from "../lib/server/auth-ui";
import { ClerkRuntimeBridge } from "../components/identity/clerk/provider";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://familyfund.app",
  ),
  title: {
    default: "The Family Fund App",
    template: "%s | The Family Fund App",
  },
  description:
    "Household finance, built around shared goals and individual privacy.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "The Family Fund App",
    description:
      "Household finance, built around shared goals and individual privacy.",
    url: "https://familyfund.app",
    siteName: "The Family Fund App",
    locale: "en_GB",
    type: "website",
    images: [
      {
        url: "/app-icon.svg",
        width: 512,
        height: 512,
        alt: "The Family Fund App logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "The Family Fund App",
    description:
      "Household finance, built around shared goals and individual privacy.",
    images: ["/app-icon.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
          <SessionBoundary>{content}</SessionBoundary>
        )}
      </body>
    </html>
  );
}
