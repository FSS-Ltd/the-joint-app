import type { ReactNode } from "react";
import "./globals.css";
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
      <body>{children}</body>
    </html>
  );
}
