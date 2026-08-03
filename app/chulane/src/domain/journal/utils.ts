/** Local-timezone day key, e.g. "2026-08-03". */
export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return toDayKey(new Date());
}

export function dayKeyToDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDayKey(dayKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dayKey) && !Number.isNaN(dayKeyToDate(dayKey).getTime());
}

/** "Today, August 3" / "Sunday, August 2" */
export function formatDayLabel(dayKey: string): string {
  const date = dayKeyToDate(dayKey);
  const today = todayKey();
  const yesterday = toDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const dayMonth = date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  if (dayKey === today) return `Today, ${dayMonth}`;
  if (dayKey === yesterday) return `Yesterday, ${dayMonth}`;
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday}, ${dayMonth}`;
}

/** "August 2026" */
export function formatMonthLabel(dayKey: string): string {
  return dayKeyToDate(dayKey).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Journal page title, e.g. "August 3, 2026". */
export function formatDayTitle(dayKey: string): string {
  return dayKeyToDate(dayKey).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
