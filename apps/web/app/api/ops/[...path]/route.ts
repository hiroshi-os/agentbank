import {
  createAgent,
  createPayrollSchedule,
  createPurchaseIntent,
  formatAgc,
  fundOrgTreasury,
  getSettings,
  issueCard,
  makePurchase,
  markAllRead,
  rotateApiKey,
  runPayrollSchedule,
  setAgentStatus,
  setCardStatus,
  setPurchaseEnabled,
  updateRates,
} from "@agentbank/core";
import { getBank, forceTick } from "@/lib/bank";
import { fail, json, readJson } from "@/lib/http";
import type { Cadence } from "@agentbank/core";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path = [] } = await context.params;
    const key = path.join("/");
    const bank = await getBank();

    if (key === "tick") {
      return json(await forceTick());
    }

    if (key === "agents") {
      const body = await readJson<{
        orgId: string;
        name: string;
        handle: string;
        role: string;
        modelFamily: string;
        bio?: string;
        openingCheckingAgc?: number;
        dailySpendLimitAgc?: number;
        purchaseEnabled?: boolean;
      }>(request);
      const created = await createAgent(bank, {
        orgId: body.orgId,
        name: body.name,
        handle: body.handle.replace(/^@/, ""),
        role: body.role,
        modelFamily: body.modelFamily,
        bio: body.bio ?? "",
        purchaseEnabled: body.purchaseEnabled,
        dailySpendLimitCents: body.dailySpendLimitAgc != null ? Math.round(body.dailySpendLimitAgc * 100) : undefined,
        openingCheckingCents: body.openingCheckingAgc != null ? Math.round(body.openingCheckingAgc * 100) : undefined,
      });
      return json({ ok: true, ...created });
    }

    if (path[0] === "agents" && path[2] === "status") {
      const body = await readJson<{ status: "active" | "paused" | "offboarded" }>(request);
      return json(await setAgentStatus(bank, path[1], body.status));
    }

    if (path[0] === "agents" && path[2] === "payroll") {
      const body = await readJson<{
        kind: "salary" | "stipend";
        amountAgc: number;
        cadence: Cadence;
        savingsAllocationBps?: number;
      }>(request);
      const schedule = await createPayrollSchedule(bank, {
        agentId: path[1],
        kind: body.kind,
        amountCents: Math.round(body.amountAgc * 100),
        cadence: body.cadence,
        savingsAllocationBps: body.savingsAllocationBps,
      });
      return json(schedule);
    }

    if (path[0] === "agents" && path[2] === "card") {
      const body = await readJson<{ label?: string; dailyLimitAgc?: number; perTxnLimitAgc?: number }>(request);
      const card = await issueCard(bank, {
        agentId: path[1],
        label: body.label,
        dailyLimitCents: body.dailyLimitAgc != null ? Math.round(body.dailyLimitAgc * 100) : undefined,
        perTxnLimitCents: body.perTxnLimitAgc != null ? Math.round(body.perTxnLimitAgc * 100) : undefined,
      });
      return json(card);
    }

    if (path[0] === "agents" && path[2] === "purchase-enabled") {
      const body = await readJson<{ enabled: boolean; dailySpendLimitAgc?: number }>(request);
      await setPurchaseEnabled(
        bank,
        path[1],
        body.enabled,
        body.dailySpendLimitAgc != null ? Math.round(body.dailySpendLimitAgc * 100) : undefined,
      );
      return json({ ok: true });
    }

    if (path[0] === "agents" && path[2] === "rotate-key") {
      const apiKey = await rotateApiKey(bank, path[1]);
      return json({ apiKey });
    }

    if (path[0] === "agents" && path[2] === "intent") {
      const body = await readJson<{
        merchantId?: string;
        label: string;
        amountAgc: number;
        cadence: Cadence | "once";
      }>(request);
      const intent = await createPurchaseIntent(bank, {
        agentId: path[1],
        merchantId: body.merchantId,
        label: body.label,
        amountCents: Math.round(body.amountAgc * 100),
        cadence: body.cadence,
      });
      return json(intent);
    }

    if (path[0] === "cards" && path[2] === "status") {
      const body = await readJson<{ status: "active" | "frozen" | "cancelled" }>(request);
      return json(await setCardStatus(bank, path[1], body.status));
    }

    if (path[0] === "payroll" && path[2] === "run") {
      return json(await runPayrollSchedule(bank, path[1]));
    }

    if (key === "settings") {
      const body = await readJson<{
        checkingApyBps?: number;
        savingsApyBps?: number;
        interchangeBps?: number;
        salaryPredictDays?: number;
      }>(request);
      return json(await updateRates(bank, body));
    }

    if (key === "purchases") {
      const body = await readJson<{
        agentId: string;
        cardId: string;
        merchantId: string;
        amountAgc: number;
        memo?: string;
      }>(request);
      const result = await makePurchase(bank, {
        agentId: body.agentId,
        cardId: body.cardId,
        merchantId: body.merchantId,
        amountCents: Math.round(body.amountAgc * 100),
        memo: body.memo,
      });
      return json({ ok: true, purchaseId: result.purchaseId, fee: formatAgc(result.feeCents) });
    }

    if (key === "fund") {
      const body = await readJson<{ orgId: string; amountAgc: number; memo?: string }>(request);
      const tx = await fundOrgTreasury(
        bank,
        body.orgId,
        Math.round(body.amountAgc * 100),
        body.memo ?? "Operator treasury top-up",
      );
      return json({ ok: true, transactionId: tx.id });
    }

    if (key === "notifications/read-all") {
      await markAllRead(bank);
      return json({ ok: true });
    }

    if (key === "settings/get") {
      return json(await getSettings(bank));
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return fail(error);
  }
}
