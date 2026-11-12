export type FinanceResourceSnapshot<T> =
  | { kind: "loading"; refreshing?: true }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };
export type FinanceResourceResult<T> = FinanceResourceSnapshot<T> & {
  retry(): void;
  current(): T | null;
};

export type FinanceMutationSnapshot<T> =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; value: T }
  | {
      kind: "error" | "uncertain";
      message: string;
      recovery: "retry" | "reload" | "security";
    };
export type FinanceMutationResult<T> = FinanceMutationSnapshot<T> & {
  submit(execute: (signal: AbortSignal) => Promise<T>): Promise<void>;
  retry(): Promise<void>;
  reset(): void;
};
