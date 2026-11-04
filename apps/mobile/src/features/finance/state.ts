export type FinanceResourceSnapshot<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };
export type FinanceResourceResult<T> = FinanceResourceSnapshot<T> & {
  retry(): void;
};

export type FinanceMutationSnapshot<T> =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; value: T }
  | { kind: "error" | "uncertain"; message: string };
export type FinanceMutationResult<T> = FinanceMutationSnapshot<T> & {
  submit(execute: (signal: AbortSignal) => Promise<T>): Promise<void>;
  retry(): Promise<void>;
  reset(): void;
};
