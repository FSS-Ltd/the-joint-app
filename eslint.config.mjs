import js from "@eslint/js";
import tseslint from "typescript-eslint";
const serverOnlyFinanceImports = [
  "@joint/database",
  "@joint/database/*",
  "**/packages/database/**",
  "@joint/domain/csv",
  "**/packages/domain/src/csv*",
  "**/packages/domain/dist/csv*",
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/generated/**",
      "**/.next/**",
      "apps/mobile/.expo/**",
      "apps/mobile/ios/**",
      "apps/mobile/android/**",
      "**/node_modules/**",
      "the-joint-app-plan/**",
      "**/.claude/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: serverOnlyFinanceImports,
        },
      ],
    },
  },
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...serverOnlyFinanceImports,
            "next",
            "next/*",
            "server-only",
            "react-dom",
            "react-dom/*",
            "react-native-web",
            "node:*",
          ],
        },
      ],
    },
  },
);
