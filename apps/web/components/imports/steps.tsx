import type { ReactNode } from "react";

export function ImportSteps({
  stage,
}: {
  stage: "inspect" | "map" | "review";
}): ReactNode {
  return (
    <ol className="import-steps" aria-label="CSV import steps">
      <li aria-current={stage === "inspect" ? "step" : undefined}>Inspect</li>
      <li aria-current={stage === "map" ? "step" : undefined}>Map</li>
      <li aria-current={stage === "review" ? "step" : undefined}>Review</li>
    </ol>
  );
}
