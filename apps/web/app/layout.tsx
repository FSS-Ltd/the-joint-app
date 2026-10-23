import type { ReactNode } from "react";
import "./globals.css";
import { OfflineRegistration } from "../components/finance/offline-registration";
export const metadata = {
  title: "The Joint App",
  description:
    "Household finance, built around shared goals and individual privacy.",
};
export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="en-GB">
      <body>
        <OfflineRegistration />
        {children}
      </body>
    </html>
  );
}
