import { expect, it } from "vitest";
import {
  elements,
  jsxBoundary,
  sourceExports,
} from "./fixtures/native-source-harness.js";

const bannerModule = sourceExports(
  "apps/web/components/cutover/cutover-banner.tsx",
  {
    "react/jsx-runtime": jsxBoundary,
    react: {},
    "./cutover-banner.css": {},
    "./presentation": {
      CUTOVER_LINKS: { appStore: "https://apps.apple.com/app/the-family-fund" },
    },
  },
);
// The source harness exposes runtime module exports as unknown.
const banner = bannerModule.CutoverNoticeBanner as (props: {
  routeName: string;
}) => unknown;
const common = {
  "react/jsx-runtime": jsxBoundary,
  "../brand": { Brand: "brand" },
  "../navigation/app-navigation": { AppNavigation: "navigation" },
  "../cutover/cutover-banner": { CutoverNoticeBanner: banner },
  "../identity/identity-controls.css": {},
  "../identity/identity-layout.css": {},
  "./accounts.css": {},
  "../identity/product-shell.css": {},
  "./identity-controls.css": {},
  "./identity-layout.css": {},
  "./product-shell.css": {},
  "./identity-workspace.css": {},
};

it.each(["accounts", "identity"] as const)(
  "keeps skip link first and both notice links keyboard reachable in %s frame",
  (kind) => {
    const module = sourceExports(
      `apps/web/components/${kind}/frame.tsx`,
      common,
    );
    // The source harness executes the authored component through a typed JSX boundary.
    const frame = module[
      kind === "accounts" ? "AccountsFrame" : "IdentityFrame"
    ] as (props: Record<string, unknown>) => unknown;
    const nodes = elements(
      frame({
        eyebrow: "Example",
        title: "Example",
        description: "Example",
        cutoverNotice: "Example",
      }),
    );
    const skipIndex = nodes.findIndex((node) => node.type === "a");
    const noticeIndex = nodes.findIndex((node) => node.type === banner);
    const skip = nodes[skipIndex];
    expect(skip?.props.href).toBe("#main");
    expect(skip?.props.children).toBe("Skip to content");
    expect(skipIndex).toBeGreaterThanOrEqual(0);
    expect(noticeIndex).toBeGreaterThan(skipIndex);
    expect(
      nodes.filter(
        (node) =>
          node.type === "a" && node.props.children === "Skip to content",
      ),
    ).toHaveLength(1);
    const links = elements(banner({ routeName: "Example" })).filter(
      (node) => node.type === "a",
    );
    expect(links.map((link) => link.props.children)).toEqual([
      "Get the iOS App",
      "View Cutover Details",
    ]);
    expect(links.map((link) => link.props.href)).toEqual([
      "https://apps.apple.com/app/the-family-fund",
      "/cutover",
    ]);
    expect(links.every((link) => link.props.tabIndex === undefined)).toBe(true);
  },
);
