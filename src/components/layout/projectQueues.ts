import { BadgeCheck, Banknote, CircleArrowUp, DoorOpen, FileText, MessageSquareWarning, Scale, type LucideIcon } from "lucide-react";

import { getQueueCounts } from "@/api/admin";
import { getOverview } from "@/api/evermind";
import { getSocietyOverview } from "@/api/society";
import { templateOf, type ProjectDef } from "@/config/projects";
import { t } from "@/i18n";

import type { MenuKey } from "./nav";

export interface QueueItem {
  label: string;
  icon: LucideIcon;
  value: number | undefined;
  /** Project shell madhla page (`projectBase(p)/<to>`). */
  to: string;
  menu: MenuKey;
}

/**
 * Control center / Projects page che pending queues — project template pramane.
 * Query key `[project.id, "queues"]` (NOAI cha project shell pan hich vaparto — cache share).
 */
export function fetchProjectQueues(p: ProjectDef): Promise<Record<string, number>> {
  const tpl = templateOf(p);
  if (tpl === "society") return getSocietyOverview(p).then((o) => ({ ...o }));
  // App address nasel tar EverMind shell setup sangto — ithe error / retry nako.
  if (tpl === "evermind") return p.apiUrl ? getOverview(p).then((o) => ({ upgrades: o.upgradeRequests })) : Promise.resolve({});
  return getQueueCounts(p);
}

export function projectQueueItems(p: ProjectDef, data: Record<string, number> | undefined): QueueItem[] {
  if (templateOf(p) === "evermind") {
    return [{ label: t("em.nav.upgrades"), icon: CircleArrowUp, value: data?.upgrades, to: "upgrades", menu: "upgrades" }];
  }
  if (templateOf(p) === "society") {
    return [
      { label: t("soc.nav.complaints"), icon: MessageSquareWarning, value: data?.openComplaints, to: "complaints", menu: "complaints" },
      { label: t("soc.queue.unpaid"), icon: FileText, value: data?.unpaidBills, to: "bills", menu: "bills" },
      { label: t("soc.queue.inside"), icon: DoorOpen, value: data?.visitorsInside, to: "visitors", menu: "visitors" },
    ];
  }
  return [
    { label: "KYC", icon: BadgeCheck, value: data?.kyc, to: "kyc", menu: "kyc" },
    { label: t("nav.disputes"), icon: Scale, value: data?.disputes, to: "disputes", menu: "disputes" },
    { label: t("nav.payouts"), icon: Banknote, value: data?.payouts, to: "payouts", menu: "payouts" },
  ];
}
