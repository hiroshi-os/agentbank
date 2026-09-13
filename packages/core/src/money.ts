export const CURRENCY_CODE = "AGC";
export const CURRENCY_NAME = "Agent Coins";

export function agc(cents: number): { cents: number; agc: number; formatted: string } {
  return {
    cents,
    agc: cents / 100,
    formatted: formatAgc(cents),
  };
}

export function formatAgc(cents: number, withCode = true): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = `${whole}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return withCode ? `${sign}${grouped}.${frac} AGC` : `${sign}${grouped}.${frac}`;
}

export function parseAgcToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input.replace(/,/g, "").replace(/agc/i, "").trim();
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) throw new Error(`Cannot parse amount: ${input}`);
  return Math.round(value * 100);
}

export function bps(amountCents: number, basisPoints: number): number {
  return Math.round((amountCents * basisPoints) / 10_000);
}

/** Daily simple interest in microcents: amount_cents * apy_bps / 365 / 10000 * 1_000_000 */
export function dailyInterestMicros(balanceCents: number, apyBps: number): number {
  if (balanceCents <= 0 || apyBps <= 0) return 0;
  return Math.floor((balanceCents * apyBps * 1_000_000) / (10_000 * 365));
}
