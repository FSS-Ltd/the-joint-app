/** Returns the current month in YYYY-MM format using Europe/London timezone. */
export function currentMobileMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

/** Returns the previous month in YYYY-MM format. */
export function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  if (m === 1) return `${year - 1}-12`;
  return `${year}-${String(m - 1).padStart(2, "0")}`;
}

/** Returns the next month in YYYY-MM format. */
export function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  if (m === 12) return `${year + 1}-01`;
  return `${year}-${String(m + 1).padStart(2, "0")}`;
}

/** Format YYYY-MM as "November 2026". */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
  }).format(new Date(year, m - 1, 1));
}
