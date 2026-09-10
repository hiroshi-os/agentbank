import { BankError } from "@agentbank/core";
import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown) {
  if (error instanceof BankError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Internal error", code: "internal" },
    { status: 500 },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function bearer(request: Request): string | null {
  return request.headers.get("authorization") ?? request.headers.get("x-agent-key");
}
