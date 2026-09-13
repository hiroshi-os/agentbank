"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm text-paper outline-none focus:border-brass/50";

export function Button({
  children,
  tone = "brass",
  type = "button",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  tone?: "brass" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-2 text-sm transition disabled:opacity-50",
        tone === "brass" && "bg-brass text-ink hover:bg-brass-2",
        tone === "ghost" && "border border-line text-paper hover:bg-white/5",
        tone === "danger" && "bg-danger/20 text-danger hover:bg-danger/30",
      )}
    >
      {children}
    </button>
  );
}

export function TickButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const res = await fetch("/api/ops/tick", { method: "POST" });
          const data = await res.json();
          setBusy(false);
          setMsg(
            res.ok
              ? `Cycle posted ${data.payrollPosted} payrolls, ${data.salaryPredictions} payday predictions`
              : data.error,
          );
          router.refresh();
        }}
      >
        {busy ? "Running…" : "Run banking cycle"}
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function HireAgentForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError(null);
        try {
          const data = await post("/api/ops/agents", {
            orgId,
            name: form.get("name"),
            handle: form.get("handle"),
            role: form.get("role"),
            modelFamily: form.get("modelFamily"),
            bio: form.get("bio"),
            openingCheckingAgc: Number(form.get("opening") || 0),
            dailySpendLimitAgc: Number(form.get("limit") || 100),
            purchaseEnabled: true,
          });
          setApiKey(data.apiKey);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input required name="name" className={inputClass} placeholder="Opus" />
        </Field>
        <Field label="Handle">
          <input required name="handle" className={inputClass} placeholder="opus" />
        </Field>
        <Field label="Role">
          <input required name="role" className={inputClass} placeholder="Research engineer" />
        </Field>
        <Field label="Model family">
          <select name="modelFamily" className={inputClass} defaultValue="claude">
            <option value="claude">Claude</option>
            <option value="grok">Grok</option>
            <option value="composer">Composer</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Opening checking (AGC)">
          <input name="opening" type="number" step="0.01" className={inputClass} defaultValue="100" />
        </Field>
        <Field label="Daily spend limit (AGC)">
          <input name="limit" type="number" step="0.01" className={inputClass} defaultValue="250" />
        </Field>
      </div>
      <Field label="Bio">
        <textarea name="bio" rows={2} className={inputClass} placeholder="What this agent is paid to do" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {apiKey ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 font-mono text-xs text-ok">API key (shown once): {apiKey}</p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Opening account…" : "Open agent account"}
      </Button>
    </form>
  );
}

export function PayrollForm({ agentId }: { agentId: string }) {
  const router = useRouter();
  return (
    <ActionForm
      onSubmit={async (form) => {
        await post(`/api/ops/agents/${agentId}/payroll`, {
          kind: form.get("kind"),
          amountAgc: Number(form.get("amount")),
          cadence: form.get("cadence"),
          savingsAllocationBps: Math.round(Number(form.get("savings") || 0) * 100),
        });
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Kind">
          <select name="kind" className={inputClass} defaultValue="salary">
            <option value="salary">Salary</option>
            <option value="stipend">Stipend</option>
          </select>
        </Field>
        <Field label="Amount (AGC)">
          <input required name="amount" type="number" step="0.01" className={inputClass} />
        </Field>
        <Field label="Cadence">
          <select name="cadence" className={inputClass} defaultValue="monthly">
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        <Field label="To savings %">
          <input name="savings" type="number" min="0" max="100" className={inputClass} defaultValue="10" />
        </Field>
      </div>
      <Button type="submit">Set pay</Button>
    </ActionForm>
  );
}

export function IssueCardForm({ agentId }: { agentId: string }) {
  const router = useRouter();
  return (
    <ActionForm
      onSubmit={async (form) => {
        await post(`/api/ops/agents/${agentId}/card`, {
          label: form.get("label"),
          dailyLimitAgc: Number(form.get("daily")),
          perTxnLimitAgc: Number(form.get("txn")),
        });
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Label">
          <input name="label" className={inputClass} placeholder="Travel card" />
        </Field>
        <Field label="Daily limit (AGC)">
          <input name="daily" type="number" step="0.01" className={inputClass} defaultValue="250" />
        </Field>
        <Field label="Per purchase (AGC)">
          <input name="txn" type="number" step="0.01" className={inputClass} defaultValue="100" />
        </Field>
      </div>
      <Button type="submit">Issue virtual card</Button>
    </ActionForm>
  );
}

export function PurchaseForm({
  agentId,
  cardId,
  merchants,
}: {
  agentId: string;
  cardId: string;
  merchants: { id: string; name: string; emoji: string }[];
}) {
  const router = useRouter();
  return (
    <ActionForm
      onSubmit={async (form) => {
        await post("/api/ops/purchases", {
          agentId,
          cardId,
          merchantId: form.get("merchantId"),
          amountAgc: Number(form.get("amount")),
          memo: form.get("memo"),
        });
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Merchant">
          <select name="merchantId" className={inputClass}>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.emoji} {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (AGC)">
          <input required name="amount" type="number" step="0.01" className={inputClass} />
        </Field>
        <Field label="Memo">
          <input name="memo" className={inputClass} placeholder="GPU hours" />
        </Field>
      </div>
      <Button type="submit">Charge card</Button>
    </ActionForm>
  );
}

export function StatusButtons({
  path,
  body,
  label,
}: {
  path: string;
  body: unknown;
  label: string;
}) {
  const router = useRouter();
  return (
    <Button
      tone="ghost"
      onClick={async () => {
        await post(path, body);
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}

export function RatesForm({
  checkingApyBps,
  savingsApyBps,
  interchangeBps,
  salaryPredictDays,
}: {
  checkingApyBps: number;
  savingsApyBps: number;
  interchangeBps: number;
  salaryPredictDays: number;
}) {
  const router = useRouter();
  return (
    <ActionForm
      onSubmit={async (form) => {
        await post("/api/ops/settings", {
          checkingApyBps: Math.round(Number(form.get("checking")) * 100),
          savingsApyBps: Math.round(Number(form.get("savings")) * 100),
          interchangeBps: Math.round(Number(form.get("interchange")) * 100),
          salaryPredictDays: Number(form.get("predict")),
        });
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Checking APY %">
          <input name="checking" type="number" step="0.01" className={inputClass} defaultValue={checkingApyBps / 100} />
        </Field>
        <Field label="Savings APY %">
          <input name="savings" type="number" step="0.01" className={inputClass} defaultValue={savingsApyBps / 100} />
        </Field>
        <Field label="Interchange %">
          <input
            name="interchange"
            type="number"
            step="0.01"
            className={inputClass}
            defaultValue={interchangeBps / 100}
          />
        </Field>
        <Field label="Predict payday (days)">
          <input name="predict" type="number" className={inputClass} defaultValue={salaryPredictDays} />
        </Field>
      </div>
      <Button type="submit">Save rates</Button>
    </ActionForm>
  );
}

export function FundForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  return (
    <ActionForm
      onSubmit={async (form) => {
        await post("/api/ops/fund", {
          orgId,
          amountAgc: Number(form.get("amount")),
          memo: form.get("memo"),
        });
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
        <Field label="Amount (AGC)">
          <input required name="amount" type="number" step="0.01" className={inputClass} />
        </Field>
        <Field label="Memo">
          <input name="memo" className={inputClass} placeholder="Treasury top-up from capital" />
        </Field>
        <div className="flex items-end">
          <Button type="submit">Issue to org</Button>
        </div>
      </div>
    </ActionForm>
  );
}

function ActionForm({
  children,
  onSubmit,
}: {
  children: React.ReactNode;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(new FormData(event.currentTarget));
          event.currentTarget.reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <span className="hidden" aria-hidden data-busy={busy} />
    </form>
  );
}

export function RotateKeyButton({ agentId }: { agentId: string }) {
  const [key, setKey] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <Button
        tone="ghost"
        onClick={async () => {
          const data = await post(`/api/ops/agents/${agentId}/rotate-key`, {});
          setKey(data.apiKey);
        }}
      >
        Rotate API key
      </Button>
      {key ? <p className="font-mono text-xs text-ok">New key: {key}</p> : null}
    </div>
  );
}
