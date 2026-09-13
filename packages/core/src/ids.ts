import { randomBytes, randomUUID } from "node:crypto";

export function id(prefix?: string): string {
  const uuid = randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function token(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

export function randomDigits(length: number): string {
  let out = "";
  while (out.length < length) {
    const n = randomBytes(4).readUInt32BE(0) % 10 ** Math.min(9, length - out.length + 1);
    out += String(n).padStart(Math.min(9, length - out.length), "0").slice(0, length - out.length);
  }
  return out.slice(0, length);
}
