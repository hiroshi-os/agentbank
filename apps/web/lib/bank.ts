import { openBank, seedIfEmpty, tick, type Bank } from "@agentbank/core";

let boot: Promise<Bank> | null = null;
let ticking: Promise<unknown> | null = null;
let lastTick = 0;

async function bootBank(): Promise<Bank> {
  const { bank } = await openBank();
  await seedIfEmpty(bank);
  return bank;
}

export async function getBank(): Promise<Bank> {
  boot ??= bootBank();
  const bank = await boot;
  const now = Date.now();
  if (now - lastTick > 20_000 && !ticking) {
    lastTick = now;
    ticking = tick(bank)
      .catch((error) => {
        console.error("banking tick failed", error);
      })
      .finally(() => {
        ticking = null;
      });
  }
  return bank;
}

export async function forceTick() {
  const bank = await getBank();
  lastTick = Date.now();
  return tick(bank);
}
