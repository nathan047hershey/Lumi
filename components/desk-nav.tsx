"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CalendarClock,
  ClipboardList,
  Code2,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  Mail,
  PenLine,
  Puzzle,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { NavItem } from "@/lib/nav";

const ICONS = {
  Bot,
  LayoutDashboard,
  Link2,
  FileText,
  CalendarClock,
  Users,
  ClipboardList,
  Code2,
  BarChart3,
  Sparkles,
  LayoutTemplate,
  PenLine,
  Puzzle,
  Mail,
  Settings,
  TrendingUp,
} as const;

export function DeskNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICONS[item.icon as keyof typeof ICONS] || LayoutDashboard;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={
              active
                ? "flex items-center gap-2.5 rounded-xl bg-copper/15 px-3 py-2 text-[13px] font-medium text-copper shadow-[inset_0_0_0_1px_hsl(199_95%_55%/0.25)]"
                : "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-white/55 hover:bg-white/[0.05] hover:text-white/90"
            }
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
