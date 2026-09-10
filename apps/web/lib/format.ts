import { formatAgc } from "@agentbank/core";

export { formatAgc };

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function cadenceLabel(cadence: string) {
  return (
    {
      hourly: "hourly",
      daily: "daily",
      weekly: "weekly",
      biweekly: "every 2 weeks",
      monthly: "monthly",
      once: "once",
    } as Record<string, string>
  )[cadence] ?? cadence;
}

export function kindLabel(kind: string) {
  return kind.replace(/_/g, " ");
}
