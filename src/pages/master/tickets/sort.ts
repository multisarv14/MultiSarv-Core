import { PRIORITY_RANK, TICKET_STATUSES, type Ticket } from "@/api/tickets";

import { moduleLabel } from "./shared";

/** Ticket list che sort — default juni tickets adhi (date asc). */
export type SortKey = "number" | "date" | "priority" | "status" | "module";

export const SORT_KEYS: SortKey[] = ["number", "date", "priority", "status", "module"];
export const SORT_LABEL = {
  number: "tickets.sort.number",
  date: "tickets.sort.date",
  priority: "tickets.col.priority",
  status: "tickets.col.status",
  module: "tickets.col.module",
} as const;

const time = (d: Date | null) => d?.getTime() ?? 0;

/** Chadhta kram (asc) — desc sathi ulta. Barobari asel tar ticket number. */
function compare(a: Ticket, b: Ticket, key: SortKey): number {
  const diff =
    key === "date"
      ? time(a.createdAt) - time(b.createdAt)
      : key === "priority"
        ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        : key === "status"
          ? TICKET_STATUSES.indexOf(a.status) - TICKET_STATUSES.indexOf(b.status)
          : key === "module"
            ? // Module nasleli (juni) tickets shevti.
              (a.module ? 0 : 1) - (b.module ? 0 : 1) || moduleLabel(a.module).localeCompare(moduleLabel(b.module))
            : 0;
  return diff || a.number - b.number;
}

export const sortTickets = (list: Ticket[], key: SortKey, dir: "asc" | "desc") => {
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => sign * compare(a, b, key));
};
