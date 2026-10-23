import {
  BadgeCheck,
  Banknote,
  Building2,
  CircleArrowUp,
  BadgeIndianRupee,
  IdCard,
  BellRing,
  DoorOpen,
  FileText,
  Megaphone,
  MessageSquareWarning,
  PhoneCall,
  Wallet,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  ReceiptText,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

import { templateOf, type ProjectDef } from "@/config/projects";
import type { MsgKey } from "@/i18n";

export type QueueKey = "kyc" | "disputes" | "payouts";

/** Super admin admins la he menus project-nihay deto (core `projects.ts` sobat same). */
export type MarketplaceMenuKey =
  | "dashboard"
  | "users"
  | "kyc"
  | "tasks"
  | "disputes"
  | "payouts"
  | "ledger"
  | "notifications"
  | "catalog";

/** SocietySarv menus — core `SOCIETY_MENUS` sobat same. */
export type SocietyMenuKey =
  | "dashboard"
  | "residents"
  | "bills"
  | "finance"
  | "visitors"
  | "notices"
  | "complaints"
  | "contacts"
  | "roles"
  | "subscriptions";

/** EverMind menus — core `EVERMIND_MENUS` ani EverMind `PanelMenu` sobat same. */
export type EverMindMenuKey = "dashboard" | "companies" | "users" | "upgrades";

export type MenuKey = MarketplaceMenuKey | SocietyMenuKey | EverMindMenuKey;

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

/** SocietySarv sarkhe projects (`/s/:projectId/...`). */
export const SOCIETY_NAV: NavItem[] = [
  { to: "", menu: "dashboard", label: "nav.dashboard", icon: LayoutDashboard, group: "nav.group.overview" },
  { to: "residents", menu: "residents", label: "soc.nav.residents", icon: Users, group: "soc.nav.group.members" },
  { to: "complaints", menu: "complaints", label: "soc.nav.complaints", icon: MessageSquareWarning, group: "soc.nav.group.members" },
  { to: "visitors", menu: "visitors", label: "soc.nav.visitors", icon: DoorOpen, group: "soc.nav.group.members" },
  { to: "bills", menu: "bills", label: "soc.nav.bills", icon: FileText, group: "nav.group.finance" },
  { to: "finance", menu: "finance", label: "soc.nav.finance", icon: Wallet, group: "nav.group.finance" },
  { to: "notices", menu: "notices", label: "soc.nav.notices", icon: Megaphone, group: "nav.group.engage" },
  { to: "contacts", menu: "contacts", label: "soc.nav.contacts", icon: PhoneCall, group: "nav.group.engage" },
  { to: "roles", menu: "roles", label: "soc.nav.roles", icon: IdCard, group: "soc.nav.group.admin" },
  { to: "subscription", menu: "subscriptions", label: "soc.nav.subscription", icon: BadgeIndianRupee, group: "soc.nav.group.admin" },
];

/** EverMind sarkhe projects (`/e/:projectId/...`). */
export const EVERMIND_NAV: NavItem[] = [
  { to: "", menu: "dashboard", label: "nav.dashboard", icon: LayoutDashboard, group: "nav.group.overview" },
  { to: "companies", menu: "companies", label: "em.nav.companies", icon: Building2, group: "nav.group.operations" },
  { to: "users", menu: "users", label: "nav.users", icon: Users, group: "nav.group.operations" },
  { to: "upgrades", menu: "upgrades", label: "em.nav.upgrades", icon: CircleArrowUp, group: "nav.group.finance" },
];

/** Project cha template pramane menus (access matrix, tickets, counts). */
export const navFor = (p: Pick<ProjectDef, "template"> | null | undefined): NavItem[] => {
  const tpl = templateOf(p);
  return tpl === "society" ? SOCIETY_NAV : tpl === "evermind" ? EVERMIND_NAV : NAV;
};

/** URL (`/e/evermind/companies`) → menu. */
export const evermindMenuForPath = (pathname: string): MenuKey => {
  const seg = pathname.split("/")[3] ?? "";
  return EVERMIND_NAV.find((n) => n.to === seg)?.menu ?? "dashboard";
};

/** URL (`/s/societysarv/bills`) → menu. */
export const societyMenuForPath = (pathname: string): MenuKey => {
  const seg = pathname.split("/")[3] ?? "";
  return SOCIETY_NAV.find((n) => n.to === seg)?.menu ?? "dashboard";
};

/** URL (`/p/noai/payouts/...`) → menu. */
export const menuForPath = (pathname: string): MenuKey => {
  const seg = pathname.split("/")[3] ?? "";
  return NAV.find((n) => n.to === seg)?.menu ?? "dashboard";
};
