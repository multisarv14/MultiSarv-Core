import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

import { toDate, type ModuleKey } from "@/context/session";
import { callCore, core, errorMessage } from "@/lib/firebase";

/** Core `tickets` — Client (CLT-…) ani Dev (DEV-…). Writes fakt core functions. */
export type TicketKind = "client" | "dev";
export type TicketStatus = "open" | "inProcess" | "uat" | "closed" | "hold";

/** Client ani Dev donhi sathi hach kram — tabs, dropdowns, listing sagle ithun. */
export const TICKET_STATUSES: TicketStatus[] = ["open", "inProcess", "uat", "closed", "hold"];

/**
 * Open → In Process → UAT → Closed; UAT fail zala tar parat In Process;
 * In Process / UAT ⇄ Hold (server pan hech tapasto).
 */
export const NEXT_STATUS: Record<TicketStatus, TicketStatus[]> = {
  open: ["inProcess"],
  inProcess: ["uat", "hold"],
  uat: ["inProcess", "closed", "hold"],
  closed: [],
  hold: ["inProcess"],
};

/** Dropdown kram (core `tickets.ts` PRIORITIES sobat same). Juna ticket = medium. */
export type TicketPriority = "medium" | "low" | "high" | "critical" | "showstopper";
export const TICKET_PRIORITIES: TicketPriority[] = ["medium", "low", "high", "critical", "showstopper"];
/** Sort sathi gambhirta (low → showstopper). */
export const PRIORITY_RANK: Record<TicketPriority, number> = { low: 0, medium: 1, high: 2, critical: 3, showstopper: 4 };

export const KIND_META: Record<TicketKind, { module: ModuleKey; path: string }> = {
  client: { module: "clientTickets", path: "/client-tickets" },
  dev: { module: "devTickets", path: "/dev-tickets" },
};

export interface Person {
  uid: string;
  name: string;
  email: string;
}

export interface Ticket {
  id: string;
  kind: TicketKind;
  number: number;
  title: string;
  description: string;
  projectId: string;
  priority: TicketPriority;
  /** Project che app module (`nav.ts` MenuKey); juna ticket / Multisarv = null. */
  module: string | null;
  status: TicketStatus;
  raisedBy: Person;
  assignedTo: Person | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface TicketComment {
  id: string;
  type: "created" | "comment" | "status" | "assign" | "edit";
  text?: string;
  from?: string;
  to?: string;
  by: Person;
  at: Date | null;
}

const toTicket = (id: string, d: Record<string, unknown>): Ticket => ({
  id,
  kind: d.kind as TicketKind,
  number: Number(d.number ?? 0),
  title: String(d.title ?? ""),
  description: String(d.description ?? ""),
  projectId: String(d.projectId ?? ""),
  priority: TICKET_PRIORITIES.find((p) => p === d.priority) ?? "medium",
  module: typeof d.module === "string" && d.module ? d.module : null,
  status: (d.status as TicketStatus) ?? "open",
  raisedBy: d.raisedBy as Person,
  assignedTo: (d.assignedTo as Person | null) ?? null,
  createdAt: when(d.createdAt),
  updatedAt: when(d.updatedAt),
});

/** Firestore Timestamp kinva `listDevTickets` che millis. */
const when = (v: unknown) => (typeof v === "number" ? new Date(v) : toDate(v));

type Live<T> = { data: T | null; error: string | null };

// Ticket badalla (raise / edit / assign / status / comment) — server list taji kara.
const changed = new Set<() => void>();
const bump = () => changed.forEach((f) => f());

/**
 * Ya prakarache tickets (navin pahile). Client Tickets ani super admin: live.
 * Dev Tickets (non-super): `listDevTickets` — server fakt allowed tickets deto
 * (project + assigned / raised / assign permission); badal / focus / 20s la taje.
 */
export function useTickets(kind: TicketKind, scoped = false): Live<Ticket[]> {
  const [state, setState] = useState<Live<Ticket[]>>({ data: null, error: null });
  useEffect(() => {
    setState({ data: null, error: null });
    if (kind === "dev" && scoped) {
      let alive = true;
      const load = () =>
        callCore<Record<string, unknown>[]>("listDevTickets", {})
          .then((rows) => alive && setState({ data: rows.map((r) => toTicket(String(r.id), r)), error: null }))
          .catch((err) => alive && setState({ data: null, error: errorMessage(err) }));
      load();
      const timer = setInterval(load, 20_000);
      window.addEventListener("focus", load);
      changed.add(load);
      return () => {
        alive = false;
        clearInterval(timer);
        window.removeEventListener("focus", load);
        changed.delete(load);
      };
    }
    return onSnapshot(
      query(collection(core().db, "tickets"), where("kind", "==", kind), orderBy("createdAt", "desc"), limit(1000)),
      (snap) => setState({ data: snap.docs.map((d) => toTicket(d.id, d.data())), error: null }),
      (err) => setState({ data: null, error: errorMessage(err) }),
    );
  }, [kind, scoped]);
  return state;
}

export function useTicket(id: string | undefined): Live<Ticket> & { missing: boolean } {
  const [state, setState] = useState<Live<Ticket> & { missing: boolean }>({ data: null, error: null, missing: false });
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(core().db, "tickets", id),
      (snap) =>
        setState(
          snap.exists()
            ? { data: toTicket(snap.id, snap.data()), error: null, missing: false }
            : { data: null, error: null, missing: true },
        ),
      (err) => setState({ data: null, error: errorMessage(err), missing: false }),
    );
  }, [id]);
  return state;
}

export function useTicketComments(id: string | undefined): TicketComment[] | null {
  const [rows, setRows] = useState<TicketComment[] | null>(null);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      query(collection(core().db, "tickets", id, "comments"), orderBy("at", "asc"), limit(500)),
      (snap) =>
        setRows(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              type: x.type,
              text: x.text,
              from: x.from,
              to: x.to,
              by: x.by as Person,
              at: toDate(x.at),
            };
          }),
        ),
      () => setRows([]),
    );
  }, [id]);
  return rows;
}

/** Assign karta yenare users (tya module cha View asnare active admins). */
/** Dev: `projectId` dila tar fakt tya project cha access asnare. */
export function useAssignees(kind: TicketKind, enabled: boolean, projectId = "") {
  const [list, setList] = useState<Person[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setList(null);
    callCore<Person[]>("listTicketAssignees", { kind, projectId })
      .then((r) => alive && setList(r))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [kind, enabled, projectId]);
  return list;
}

export interface TicketInput {
  title: string;
  description: string;
  projectId: string;
  priority: TicketPriority;
  module: string | null;
}

const andBump = <T>(p: Promise<T>) => p.then((r) => (bump(), r));

export const raiseTicket = (kind: TicketKind, input: TicketInput & { assignee?: string | null }) =>
  andBump(callCore<{ id: string }>("raiseTicket", { kind, ...input }));
export const updateTicket = (id: string, input: TicketInput) => andBump(callCore("updateTicket", { id, ...input }));
export const assignTicket = (id: string, assignee: string | null) => andBump(callCore("assignTicket", { id, assignee }));
export const setTicketStatus = (id: string, status: TicketStatus) => andBump(callCore("setTicketStatus", { id, status }));
/** `status` = assignee cha comment ticket Open → In Process kela tar. */
export const addTicketComment = (id: string, text: string) =>
  andBump(callCore<{ ok: boolean; status: TicketStatus | null }>("addTicketComment", { id, text }));
