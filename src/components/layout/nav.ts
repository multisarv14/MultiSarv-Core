import {
  BadgeCheck,
  Banknote,
  BellRing,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  ReceiptText,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { MsgKey } from "@/i18n";

export type QueueKey = "kyc" | "disputes" | "payouts";

/** Super admin admins la he menus project-nihay deto (core `projects.ts` sobat same). */
export type MenuKey =
  | "dashboard"
  | "users"
  | "kyc"
  | "tasks"
  | "disputes"
  | "payouts"
  | "ledger"
  | "notifications"
  | "catalog";

export interface NavItem {
  to: string;
  menu: MenuKey;
  /** i18n key — render veli `t()` (bhasha badalli ki label badalto). */
  label: MsgKey;
  icon: LucideIcon;
  queue?: QueueKey;
  group: MsgKey;
}

/** Sagle projects sathi same pages (structure ekach). */
export const NAV: NavItem[] = [
  { to: "", menu: "dashboard", label: "nav.dashboard", icon: LayoutDashboard, group: "nav.group.overview" },
  { to: "users", menu: "users", label: "nav.users", icon: Users, group: "nav.group.operations" },
  { to: "kyc", menu: "kyc", label: "nav.kyc", icon: BadgeCheck, queue: "kyc", group: "nav.group.operations" },
  { to: "tasks", menu: "tasks", label: "nav.tasks", icon: ListChecks, group: "nav.group.operations" },
  { to: "disputes", menu: "disputes", label: "nav.disputes", icon: Scale, queue: "disputes", group: "nav.group.operations" },
  { to: "payouts", menu: "payouts", label: "nav.payouts", icon: Banknote, queue: "payouts", group: "nav.group.finance" },
  { to: "ledger", menu: "ledger", label: "nav.ledger", icon: ReceiptText, group: "nav.group.finance" },
  { to: "notifications", menu: "notifications", label: "nav.notifications", icon: BellRing, group: "nav.group.engage" },
  { to: "catalog", menu: "catalog", label: "nav.catalog", icon: LayoutGrid, group: "nav.group.catalog" },
];

export const MENU_KEYS = NAV.map((n) => n.menu);

/** URL (`/p/noai/payouts/...`) → menu. */
export const menuForPath = (pathname: string): MenuKey => {
  const seg = pathname.split("/")[3] ?? "";
  return NAV.find((n) => n.to === seg)?.menu ?? "dashboard";
};
