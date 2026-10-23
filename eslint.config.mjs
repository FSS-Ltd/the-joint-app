import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/generated/**",
      "**/.next/**",
      "**/node_modules/**",
      "the-joint-app-plan/**",
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
          patterns: [
            "@joint/database",
            "@joint/database/*",
            "**/packages/database/**",
            "@joint/domain/csv",
            "**/packages/domain/src/csv*",
            "**/packages/domain/dist/csv*",
          ],
        },
      ],
    },
  },
);
