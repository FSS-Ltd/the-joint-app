import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

// Source-structure guards for two failures that only appear on a real device. Native acceptance
// found both: neither unit tests nor type checks see them.
const root = "apps/mobile/src";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}
const tagName = (node: ts.Node): string | null =>
  ts.isJsxElement(node)
    ? node.openingElement.tagName.getText()
    : ts.isJsxSelfClosingElement(node)
      ? node.tagName.getText()
      : null;

it("never renders a SwiftUI action outside a native host", () => {
  // BottomSheet is itself a SwiftUI container, presented from a Host.
  const hosts = new Set(["NativeActions", "Host", "BottomSheet"]);
  const stray: string[] = [];
  for (const file of sources(root)) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node): void => {
      if (tagName(node) === "NativeAction") {
        let parent: ts.Node | undefined = node.parent;
        let hosted = false;
        while (parent) {
          const name = tagName(parent);
          if (name !== null && hosts.has(name)) hosted = true;
          parent = parent.parent;
        }
        if (!hosted)
          stray.push(
            `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
          );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  // An @expo/ui Button mounted in a plain View kills the app natively.
  expect(stray).toEqual([]);
});

it("keeps hidden workspace routes navigable", () => {
  const layout = readFileSync(
    "apps/mobile/src/features/navigation/workspace-layout.tsx",
    "utf8",
  );
  // expo-router 58 turns `href: null` into a hidden tab that router.push cannot reach.
  expect(layout).not.toMatch(/href:\s*null/);
  const hidden = /const hiddenTab = \{([\s\S]*?)\};/.exec(layout)?.[1] ?? "";
  expect(hidden).toMatch(/tabBarButton:\s*\(\)\s*=>\s*null/);
  expect(hidden).toMatch(/display:\s*"none"/);
  for (const name of ["activity", "imports", "budgets", "review"])
    expect(layout).toContain(
      `<Tabs.Screen name="${name}" options={hiddenTab} />`,
    );
});
