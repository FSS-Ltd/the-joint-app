import { readFile } from "node:fs/promises";
import type { BrowserContext } from "@playwright/test";

export async function syntheticClerkBrowser(
  context: BrowserContext,
  origin: string,
  scenario: string,
): Promise<string[]> {
  const actions: string[] = [];
  const source = await readFile(
    new URL("./clerk-browser-sdk.mjs", import.meta.url),
    "utf8",
  );
  await context.addCookies([
    {
      name: "__clerk_db_jwt",
      value: "synthetic-development-browser-only",
      url: origin,
    },
  ]);
  await context.addInitScript({
    content: `(() => {sessionStorage.setItem("clerkSyntheticScenario", ${JSON.stringify(scenario)});${source}\n})();`,
  });
  await context.route(/https:\/\/.*clerk.*\//, (route) =>
    route.request().url().includes("clerk.browser.js")
      ? route.fulfill({
          contentType: "application/javascript",
          body: "/* SDK facade installed before application scripts. */",
        })
      : route.abort(),
  );
  await context.route("**/__synthetic_clerk/*", (route) => {
    actions.push(
      new URL(route.request().url()).pathname.split("/").at(-1) ?? "",
    );
    return route.fulfill({ contentType: "application/json", body: "{}" });
  });
  return actions;
}
