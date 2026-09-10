export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };

export function iso(date: Date): string {
  return date.toISOString();
}

export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysBetween(from: Date, to: Date): number {
  const a = startOfUtcDay(from).getTime();
  const b = startOfUtcDay(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type Cadence = "hourly" | "daily" | "weekly" | "biweekly" | "monthly";

export function advanceCadence(from: Date, cadence: Cadence): Date {
  switch (cadence) {
    case "hourly":
      return new Date(from.getTime() + 60 * 60 * 1000);
    case "daily":
      return addDays(from, 1);
    case "weekly":
      return addDays(from, 7);
    case "biweekly":
      return addDays(from, 14);
    case "monthly":
      return addMonths(from, 1);
  }
}

export function periodStart(runAt: Date, cadence: Cadence): Date {
  switch (cadence) {
    case "hourly":
      return new Date(runAt.getTime() - 60 * 60 * 1000);
    case "daily":
      return addDays(runAt, -1);
    case "weekly":
      return addDays(runAt, -7);
    case "biweekly":
      return addDays(runAt, -14);
    case "monthly":
      return addMonths(runAt, -1);
  }
}

export function humanWhen(isoString: string, now = new Date()): string {
  const then = new Date(isoString).getTime();
  const delta = then - now.getTime();
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const suffix = delta >= 0 ? "from now" : "ago";
  if (minutes < 2) return delta >= 0 ? "moments from now" : "just now";
  if (minutes < 60) return `${minutes} minutes ${suffix}`;
  if (hours < 48) return `${hours} hours ${suffix}`;
  return `${days} days ${suffix}`;
}
