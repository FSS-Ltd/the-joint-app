/** Exact GBP display, including computed values wider than wire-money inputs. */
export function formatGbpMinor(value: bigint): string {
  const magnitude = value < 0n ? -value : value;
  const pounds = (magnitude / 100n).toString();
  const groups: string[] = [];
  for (let end = pounds.length; end > 0; end -= 3)
    groups.push(pounds.slice(Math.max(0, end - 3), end));
  return `${value < 0n ? "-" : ""}£${groups.reverse().join(",")}.${(magnitude % 100n).toString().padStart(2, "0")}`;
}
