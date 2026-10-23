import { z } from "zod";

/** PostgreSQL text and JSON require Unicode scalar values and exclude NUL. */
export function isSupportedFinancialText(value: string): boolean {
  return (
    !value.includes("\u0000") &&
    Array.from(value).every((character) => {
      const unit = character.charCodeAt(0);
      return character.length > 1 || unit < 0xd800 || unit > 0xdfff;
    })
  );
}
export const financialTextSchema = z.string().refine(isSupportedFinancialText);
export const bookedDateSchema = z.iso
  .date()
  .refine((value) => !value.startsWith("0000-"));
