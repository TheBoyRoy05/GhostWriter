export const labelOf = (value: string) => value[0].toUpperCase() + value.slice(1).replaceAll("_", " ");

export const amountOf = (text: string) => (text.trim() ? Number(text) : null);

export const slugOf = (value: string) => value.toLowerCase().replaceAll(" ", "-");

export function localDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function shortDate(value: string) {
  // A bare YYYY-MM-DD parses as UTC midnight, which is the previous day west of UTC.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
