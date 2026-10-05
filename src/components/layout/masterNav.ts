import {
  BellRing,
  Building2,
  Tag,
  CreditCard,
  FileText,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  Receipt,
  Settings,
  Ticket,
  Users,
  Wrench,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { ModuleKey } from "@/context/session";
import type { MsgKey } from "@/i18n";

export interface MasterNavItem {
  to: string;
  label: MsgKey;
  icon: LucideIcon;
  /** Fakt super admin la. */
  superOnly?: boolean;
  /** Ya module cha "view" asel tar disto (Module Access). */
  module?: ModuleKey;
  children?: MasterNavItem[];
}

/** Master panel (projects chya baher) — Dashboard, Projects, finance, Settings. */
export const MASTER_NAV: MasterNavItem[] = [
  { to: "/", label: "master.nav.dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "master.nav.projects", icon: FolderKanban },
  { to: "/billing", label: "master.nav.billing", icon: CreditCard, superOnly: true },
  { to: "/invoicing", label: "master.nav.invoicing", icon: FileText, superOnly: true },
  { to: "/receipts", label: "master.nav.receipts", icon: Receipt, superOnly: true },
  { to: "/accounts", label: "master.nav.accounts", icon: Wallet, superOnly: true },
  { to: "/client-tickets", label: "master.nav.clientTickets", icon: Ticket, module: "clientTickets" },
  { to: "/dev-tickets", label: "master.nav.devTickets", icon: Wrench, module: "devTickets" },
  // Sagle Core Users (project users core madhe nastat).
  { to: "/chat", label: "master.nav.chat", icon: MessagesSquare },
  { to: "/notifications", label: "master.nav.notifications", icon: BellRing, superOnly: true },
  {
    to: "/settings",
    label: "master.nav.settings",
    icon: Settings,
    superOnly: true,
    children: [
      { to: "/settings/company", label: "master.nav.company", icon: Building2 },
      { to: "/settings/users", label: "master.nav.users", icon: Users },
      { to: "/settings/roles", label: "master.nav.roles", icon: Tag },
      { to: "/settings/access", label: "master.nav.access", icon: KeyRound },
    ],
  },
];
