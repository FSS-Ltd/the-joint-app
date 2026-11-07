import { useLayoutEffect } from "react";
import { useNativeFinance } from "../finance/context";
import type { NativeFinanceContextValue } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import { useFinanceMutation } from "../finance/use-mutation";
import { useWriteDraft } from "../accounts/use-write-draft";
import type { WriteDraft } from "../accounts/write-state";
import type { InputResult } from "../accounts/write-input";
import type { FinanceMutationResult } from "../finance/state";
import type { FencedReadState } from "./use-fenced-read";

/** Declares one kind of write; must be a stable module-level constant. */
export interface EntityWriteSpec<E, D, R> {
  name: string;
  empty(): D;
  draft(entity: E): D;
  allowed(entity: E): boolean;
  intent(
    finance: NativeFinanceContextValue,
    entity: E,
    draft: D,
  ): InputResult<(signal: AbortSignal) => Promise<R>>;
}
export interface EntityWriteSession<E, D, R> {
  read: FencedReadState<E>;
  draft: WriteDraft<D, E>;
  mutation: FinanceMutationResult<R>;
  allowed: boolean;
  editable: boolean;
  reload(): void;
  /** An explicit draft (such as "clear split") replaces the edited one for this call only. */
  submit(override?: D): Promise<void>;
}
/**
 * The draft is bound to the entity version it was loaded from. A newer server version
 * is refused by If-Match and recovered through an explicit reload, never replaced silently.
 */
export function useEntityWrite<E, D, R>(
  key: string,
  source: { state: FencedReadState<E>; reload(): void },
  spec: EntityWriteSpec<E, D, R>,
): EntityWriteSession<E, D, R> {
  const finance = useNativeFinance();
  const { state: read, reload: reread } = source;
  const draft = useWriteDraft<D, E>(key, spec.empty);
  const mutation = useFinanceMutation<R>(key);
  const entity = read.kind === "ready" ? read.value : null;
  const allowed = entity !== null && spec.allowed(entity);
  useLayoutEffect(() => {
    if (!entity) return;
    if (!allowed) {
      draft.invalidate();
      mutation.reset();
    } else draft.initialize(entity, spec.draft(entity));
  }, [
    entity,
    allowed,
    spec,
    draft.initialize,
    draft.invalidate,
    mutation.reset,
  ]);
  const editable =
    draft.visible &&
    !draft.invalidated &&
    allowed &&
    draft.base !== null &&
    mutation.kind === "idle";
  function reload() {
    mutation.reset();
    draft.clear();
    reread();
  }
  async function submit(override?: D): Promise<void> {
    if (!editable || !draft.base) return;
    try {
      const built = spec.intent(finance, draft.base, override ?? draft.value);
      if (!built.ok) {
        draft.error(built.message);
        return;
      }
      await mutation.submit(built.value);
    } catch (error) {
      draft.error(financeErrorMessage(error));
    }
  }
  return { read, draft, mutation, allowed, editable, reload, submit };
}
