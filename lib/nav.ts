import type { AppRole } from "@/lib/roles";

export type NavItem = { href: string; label: string; index: string; icon: string };

export function navFor(role: AppRole): NavItem[] {
  if (role === "admin") {
    return [
      { href: "/admin/dashboard", label: "Dashboard", index: "01", icon: "LayoutDashboard" },
      { href: "/admin/pipeline", label: "Job Links", index: "02", icon: "Link2" },
      { href: "/admin/applications", label: "Applications", index: "03", icon: "FileText" },
      { href: "/admin/generate", label: "Generate CV", index: "03", icon: "FileText" },
      { href: "/admin/interviews", label: "Interviews", index: "04", icon: "CalendarClock" },
      { href: "/admin/profiles", label: "Profiles", index: "05", icon: "Users" },
      { href: "/admin/assignments", label: "Assignments", index: "06", icon: "ClipboardList" },
      { href: "/admin/users", label: "Users", index: "07", icon: "Users" },
      { href: "/admin/developers", label: "Developers", index: "08", icon: "Code2" },
      { href: "/admin/courses", label: "Bid Courses", index: "09", icon: "BarChart3" },
      { href: "/admin/analyze", label: "Analyze", index: "10", icon: "Sparkles" },
      { href: "/admin/templates", label: "Templates", index: "11", icon: "LayoutTemplate" },
      { href: "/admin/autofill", label: "Autofill", index: "12", icon: "PenLine" },
      { href: "/admin/extension", label: "Extension", index: "12", icon: "Puzzle" },
      { href: "/admin/mailboxes", label: "Inbox", index: "13", icon: "Mail" },
      { href: "/admin/settings", label: "Settings", index: "14", icon: "Settings" },
    ];
  }
  if (role === "manager") {
    return [
      { href: "/manager/dashboard", label: "Dashboard", index: "01", icon: "LayoutDashboard" },
      { href: "/manager/profiles", label: "Profiles", index: "02", icon: "Users" },
      { href: "/manager/users", label: "Users", index: "03", icon: "Users" },
      { href: "/manager/autofill", label: "Autofill", index: "04", icon: "PenLine" },
      { href: "/manager/settings", label: "Settings", index: "05", icon: "Settings" },
    ];
  }
  if (role === "caller") {
    return [
      { href: "/caller/dashboard", label: "Dashboard", index: "01", icon: "LayoutDashboard" },
      { href: "/caller/profile", label: "Profile", index: "02", icon: "Users" },
      { href: "/caller/settings", label: "Settings", index: "03", icon: "Settings" },
    ];
  }
  if (role === "developer") {
    return [
      { href: "/developer/dashboard", label: "Queue", index: "01", icon: "Code2" },
      { href: "/developer/profile", label: "Profile", index: "02", icon: "Users" },
      { href: "/developer/settings", label: "Settings", index: "03", icon: "Settings" },
    ];
  }
  return [
    { href: "/user/dashboard", label: "Dashboard", index: "01", icon: "LayoutDashboard" },
    { href: "/user/pipeline", label: "Job Links", index: "02", icon: "Link2" },
    { href: "/user/profiles", label: "Profiles", index: "03", icon: "Users" },
    { href: "/user/generate", label: "Generate CV", index: "04", icon: "FileText" },
    { href: "/user/applications", label: "Applications", index: "05", icon: "FileText" },
    { href: "/user/inbox", label: "Inbox", index: "06", icon: "Mail" },
    { href: "/user/courses", label: "Bid Courses", index: "07", icon: "BarChart3" },
    { href: "/user/insights", label: "Bid Insights", index: "08", icon: "TrendingUp" },
    { href: "/user/analyze", label: "Analyze", index: "09", icon: "Sparkles" },
    { href: "/user/quality", label: "CV Quality", index: "10", icon: "ClipboardList" },
    { href: "/user/templates", label: "Templates", index: "11", icon: "LayoutTemplate" },
    { href: "/user/autofill", label: "Autofill", index: "12", icon: "PenLine" },
    { href: "/user/extension", label: "Extension", index: "12", icon: "Puzzle" },
    { href: "/user/interviews", label: "Interviews", index: "13", icon: "CalendarClock" },
    { href: "/user/settings", label: "Settings", index: "14", icon: "Settings" },
  ];
}
