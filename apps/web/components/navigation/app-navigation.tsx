"use client";

import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { NavigationIcon, type NavigationIconName } from "./navigation-icon";
import "./navigation.css";

export type AppDestination =
  | "dashboard"
  | "activity"
  | "accounts"
  | "budgets"
  | "review"
  | "imports"
  | "household"
  | "security"
  | "privacy"
  | "archive";
interface Destination {
  key: AppDestination;
  label: string;
  href: string;
  icon: NavigationIconName;
  report?: boolean;
}
const primary: readonly Destination[] = [
  {
    key: "dashboard",
    label: "Home",
    href: "/dashboard",
    icon: "home",
    report: true,
  },
  { key: "activity", label: "Activity", href: "/activity", icon: "activity" },
  { key: "accounts", label: "Accounts", href: "/accounts", icon: "accounts" },
  {
    key: "budgets",
    label: "Budgets",
    href: "/budgets",
    icon: "budgets",
    report: true,
  },
];
const secondary: readonly Destination[] = [
  {
    key: "review",
    label: "Review",
    href: "/review",
    icon: "review",
    report: true,
  },
  { key: "imports", label: "Import CSV", href: "/imports", icon: "imports" },
  {
    key: "household",
    label: "Household",
    href: "/household",
    icon: "household",
  },
  { key: "security", label: "Security", href: "/security", icon: "security" },
  {
    key: "privacy",
    label: "Privacy",
    href: "/settings/privacy",
    icon: "privacy",
  },
  { key: "archive", label: "Archive", href: "/archive", icon: "archive" },
];

function dismissOnFocusExit(event: FocusEvent<HTMLDetailsElement>): void {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.open = false;
  }
}

function dismissOnEscape(event: KeyboardEvent<HTMLDetailsElement>): void {
  if (event.key !== "Escape" || !event.currentTarget.open) return;
  event.preventDefault();
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

export function AppNavigation({
  active,
  reportQuery,
}: {
  active: AppDestination;
  reportQuery?: string;
}): ReactNode {
  function links(destinations: readonly Destination[]): ReactNode {
    return destinations.map((item) => (
      <a
        key={item.key}
        href={`${item.href}${item.report && reportQuery ? `?${reportQuery}` : ""}`}
        aria-current={active === item.key ? "page" : undefined}
      >
        <NavigationIcon name={item.icon} />
        <span>{item.label}</span>
      </a>
    ));
  }
  const currentSecondary = secondary.find((item) => item.key === active);
  return (
    <nav className="app-navigation" aria-label="App">
      <div className="nav-primary">{links(primary)}</div>
      <div className="nav-desktop-secondary">
        <p className="nav-section-label">Your household</p>
        {links(secondary)}
      </div>
      <details
        className="nav-more"
        onBlur={dismissOnFocusExit}
        onKeyDown={dismissOnEscape}
      >
        <summary
          data-active={Boolean(currentSecondary)}
          aria-label={
            currentSecondary
              ? `More, current section: ${currentSecondary.label}`
              : undefined
          }
        >
          <NavigationIcon name="more" />
          More
        </summary>
        <div className="nav-more-panel">{links(secondary)}</div>
      </details>
    </nav>
  );
}
