import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker ? (
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-brass">{kicker}</div>
        ) : null}
        <h1 className="serif text-3xl md:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="panel rounded-2xl p-4 md:p-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="serif mt-2 text-2xl text-brass md:text-3xl">{value}</div>
      {hint ? <div className="mt-2 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  children,
  className,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("panel rounded-2xl p-4 md:p-5", className)}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm uppercase tracking-[0.16em] text-muted">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "brass",
}: {
  children: React.ReactNode;
  tone?: "brass" | "ok" | "danger" | "muted" | "info";
}) {
  const tones = {
    brass: "bg-brass/15 text-brass",
    ok: "bg-ok/15 text-ok",
    danger: "bg-danger/15 text-danger",
    muted: "bg-white/5 text-muted",
    info: "bg-info/15 text-info",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider", tones[tone])}>
      {children}
    </span>
  );
}

export function Avatar({ name, hue }: { name: string; hue: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-ink"
      style={{ background: `hsl(${hue} 45% 62%)` }}
    >
      {initials}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <div className="serif text-lg">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}
