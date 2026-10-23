import type { ReactNode } from "react";

const paths = {
  home: "m3 10 9-7 9 7v10H15v-6H9v6H3Z",
  activity: "M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6",
  accounts: "M3 6h18v14H3ZM3 6V4h15v2M16 11h5v5h-5Z",
  budgets: "M3 20h18M5 15V7m7 8V3m7 12V9",
  review: "m3 6 2 2 4-4m-6 9 2 2 4-4M12 6h9M12 13h9M3 20h18",
  imports: "M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7",
  household:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 0a4 4 0 0 1 0 8",
  security: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
  privacy: "M5 11h14v10H5Zm3 0V7a4 4 0 0 1 8 0v4m-4 4v2",
  archive: "M3 3h18v5H3Zm2 5v13h14V8m-10 4h6",
  more: "M4 12h.01M12 12h.01M20 12h.01",
} as const;

export type NavigationIconName = keyof typeof paths;

export function NavigationIcon({
  name,
}: {
  name: NavigationIconName;
}): ReactNode {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 4 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
