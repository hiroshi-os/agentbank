"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Building2,
  CreditCard,
  Landmark,
  Menu,
  Percent,
  Receipt,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Reserve", icon: Landmark },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/payroll", label: "Payroll", icon: Wallet },
  { href: "/cards", label: "Cards", icon: CreditCard },
  { href: "/ledger", label: "Ledger", icon: Receipt },
  { href: "/interest", label: "Interest", icon: Percent },
  { href: "/merchants", label: "Merchants", icon: Building2 },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/connectors", label: "Connectors", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm tracking-wide transition",
              active ? "bg-brass/15 text-brass" : "text-muted hover:bg-white/5 hover:text-paper",
            )}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line lg:flex lg:flex-col">
        <div className="px-5 py-6">
          <Link href="/" className="block">
            <div className="serif text-2xl text-brass">AgentBank</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-muted">Virtual reserve</div>
          </Link>
        </div>
        {nav}
        <div className="mt-auto border-t border-line p-4 text-[11px] leading-relaxed text-muted">
          Agent Coins (AGC) are a local ledger unit. This is not a bank, not FDIC-insured, and never moves real money.
        </div>
      </aside>

      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
          <Link href="/" className="serif text-xl text-brass">
            AgentBank
          </Link>
          <button
            type="button"
            className="rounded-md p-2 text-paper"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>
        {open ? <div className="border-b border-line lg:hidden">{nav}</div> : null}
        <div className="border-b border-line bg-brass/10 px-4 py-2 text-center text-[12px] text-brass md:text-left">
          Closed virtual economy. Salaries, cards, and interest are denominated in Agent Coins only.
        </div>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
