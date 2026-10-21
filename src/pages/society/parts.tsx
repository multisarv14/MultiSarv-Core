import type { ReactNode } from "react";

import { COMMITTEE_ROLES, STAFF_ROLES, type PaymentStatus, type TicketStatus, type VisitorStatus } from "@/api/society";
import { Badge, Input, type Tone } from "@/components/ui/primitives";
import { t, type MsgKey } from "@/i18n";

import { enumLabel } from "./state";

const BILL: Record<PaymentStatus, { tone: Tone; label: MsgKey }> = {
  PAID: { tone: "green", label: "soc.bill.PAID" },
  PARTIAL: { tone: "amber", label: "soc.bill.PARTIAL" },
  UNPAID: { tone: "red", label: "soc.bill.UNPAID" },
};
export const billLabel = (s: PaymentStatus) => t(BILL[s].label);
export const BillBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={BILL[status].tone}>{billLabel(status)}</Badge>;

const TICKET: Record<TicketStatus, { tone: Tone; label: MsgKey }> = {
  OPEN: { tone: "red", label: "soc.ticket.OPEN" },
  IN_PROGRESS: { tone: "amber", label: "soc.ticket.IN_PROGRESS" },
  RESOLVED: { tone: "green", label: "soc.ticket.RESOLVED" },
};
export const ticketLabel = (s: TicketStatus) => t(TICKET[s].label);
export const TicketBadge = ({ status }: { status: TicketStatus }) => <Badge tone={TICKET[status].tone}>{ticketLabel(status)}</Badge>;

const VISITOR: Record<VisitorStatus, { tone: Tone; label: MsgKey }> = {
  INSIDE: { tone: "blue", label: "soc.visitor.INSIDE" },
  EXITED: { tone: "neutral", label: "soc.visitor.EXITED" },
  PRE_APPROVED: { tone: "violet", label: "soc.visitor.PRE_APPROVED" },
  REJECTED: { tone: "red", label: "soc.visitor.REJECTED" },
};
export const visitorLabel = (s: VisitorStatus) => t(VISITOR[s].label);
export const VisitorBadge = ({ status }: { status: VisitorStatus }) => <Badge tone={VISITOR[status].tone}>{visitorLabel(status)}</Badge>;

export type RoleGroup = "committee" | "members" | "staff";
export const roleGroup = (role: string): RoleGroup =>
  COMMITTEE_ROLES.includes(role) ? "committee" : STAFF_ROLES.includes(role) ? "staff" : "members";

const ROLE_TONE: Record<RoleGroup, Tone> = { committee: "violet", members: "neutral", staff: "cyan" };
/** `label` — society cha swatahcha role naav (asel tar), rang base role pramane. */
export const SocietyRoleBadge = ({ role, label }: { role: string; label?: string }) => (
  <Badge tone={ROLE_TONE[roleGroup(role)]}>{label || enumLabel(role)}</Badge>
);

/** List var search + filters chi oli. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Input
      className="min-w-0 flex-1 sm:w-64 sm:flex-none"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Lahan "label: value" summary chips (totals). */
export function Totals({ items }: { items: { label: string; value: ReactNode; tone?: string }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p className="text-[11px] text-muted">{i.label}</p>
          <p className={`mt-0.5 text-base font-semibold tabular ${i.tone ?? ""}`}>{i.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Text madhe shodh — sagle dilele fields. */
export const matches = (q: string, ...fields: (string | number | undefined)[]) => {
  const s = q.trim().toLowerCase();
  return !s || fields.some((f) => String(f ?? "").toLowerCase().includes(s));
};
