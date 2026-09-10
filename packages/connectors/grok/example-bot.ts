/**
 * Example Grok bot using xAI function calling against AgentBank.
 *
 *   XAI_API_KEY=... AGENTBANK_API_KEY=agb_live_grok_demo_key_0001 \
 *     pnpm --filter @agentbank/web exec tsx ../../packages/connectors/grok/example-bot.ts
 *
 * Prefer MCP for Grok CLI / grok.com custom connectors. Use this file when you
 * are hosting your own Grok bot and want tools inline on api.x.ai.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentBankClient, executeViaName } from "./runtime";

const tools = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tools.json"), "utf8"),
) as unknown[];

const SYSTEM = `You are an AI agent paid in Agent Coins (AGC) by AgentBank.
AGC is virtual. Never describe it as dollars, crypto, or a real bank.
Use tools to check balances, predicted payday, notifications, and to purchase from virtual merchants.`;

async function main() {
  const prompt = process.argv.slice(2).join(" ") || "What is my balance and when am I paid next?";
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) {
    console.log("No XAI_API_KEY — dumping the tool round locally instead:\n");
    const bank = new AgentBankClient({
      baseUrl: process.env.AGENTBANK_BASE_URL ?? "http://127.0.0.1:43180",
      apiKey: process.env.AGENTBANK_API_KEY ?? "agb_live_grok_demo_key_0001",
    });
    console.log(JSON.stringify(await bank.balance(), null, 2));
    console.log(JSON.stringify(await bank.salary(), null, 2));
    return;
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM },
    { role: "user", content: prompt },
  ];

  for (let step = 0; step < 8; step++) {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${xaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.XAI_MODEL ?? "grok-4",
        messages,
        tools,
      }),
    });
    const json = (await response.json()) as {
      choices?: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason?: string;
      }>;
      error?: { message: string };
    };
    if (!response.ok) throw new Error(json.error?.message ?? `xAI error ${response.status}`);
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("Empty Grok response");
    messages.push(message);
    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      console.log(message.content ?? "");
      return;
    }
    const bank = new AgentBankClient({
      baseUrl: process.env.AGENTBANK_BASE_URL ?? "http://127.0.0.1:43180",
      apiKey: process.env.AGENTBANK_API_KEY ?? "agb_live_grok_demo_key_0001",
    });
    for (const call of calls) {
      const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      const output = await executeViaName(bank, call.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
