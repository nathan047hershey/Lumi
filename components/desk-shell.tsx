"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { DeskNav } from "@/components/desk-nav";
import { LampMark } from "@/components/ui";
import type { NavItem } from "@/lib/nav";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";

export type { NavItem };

function Sidebar({
  user,
  items,
  onNavigate,
  onClose,
}: {
  user: { username: string; role: AppRole };
  items: NavItem[];
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  return (
    <aside className="flex h-full w-[16.5rem] flex-col border-r border-white/[0.06] bg-[hsl(222_28%_8%)]">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-4">
        <LampMark className="h-9 w-9" />
        <div className="min-w-0">
          <p className="display text-[15px] font-semibold tracking-tight">
            Lu<span className="text-copper">mi</span>
          </p>
          <p className="truncate text-[10px] text-white/35">{ROLE_LABEL[user.role].toLowerCase()} workspace</p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1 text-white/50 hover:bg-white/5 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <DeskNav items={items} onNavigate={onNavigate} />
      <div className="mt-auto space-y-1 border-t border-white/[0.06] p-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-white/45 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-[hsl(222_30%_8%)]"
            style={{ background: "linear-gradient(145deg, hsl(199 95% 58%), hsl(210 90% 48%))" }}
          >
            {user.username[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white/85">{user.username}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/35">{user.role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function DeskShell({
  user,
  items,
  children,
}: {
  user: { username: string; role: AppRole };
  items: NavItem[];
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(222_28%_6%)] text-white">
      <div className="hidden md:flex">
        <Sidebar user={user} items={items} />
      </div>
      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <Sidebar user={user} items={items} onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
          </div>
        </>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[hsl(222_24%_7%/0.9)] px-3 backdrop-blur-xl sm:px-5 md:hidden">
          <button type="button" className="rounded-lg p-2 text-white/80" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="display text-sm font-semibold">
            Lu<span className="text-copper">mi</span>
          </Link>
        </header>
        <main className="min-h-0 flex-1 overflow-auto px-5 py-6 sm:px-8 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  lede,
  action,
}: {
  kicker: string;
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-copper">{kicker}</p>
        <h1 className="page-title-rule display mt-1 text-[1.75rem] font-bold text-ink">{title}</h1>
        {lede ? <p className="mt-2 max-w-xl text-sm text-ink-soft">{lede}</p> : null}
      </div>
      {action}
    </header>
  );
}
