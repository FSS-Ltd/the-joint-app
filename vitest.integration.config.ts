import { defineConfig } from "vitest/config";

const capacityFiles = [
  // Global worker deadlines must be observed without concurrent fixture writes.
  "tests/worker-events.integration.ts",
  "tests/worker-lifecycle.integration.ts",
  "tests/imports-isolation.integration.ts",
  "tests/import-worker.integration.ts",
  "tests/spending-reports.integration.ts",
  "tests/export-cascade-performance.integration.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "capacity",
          include: capacityFiles,
          testTimeout: 15000,
          // Measure existing deadlines without unrelated bulk writes or restores.
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/**/*.integration.ts"],
          exclude: capacityFiles,
          testTimeout: 15000,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
