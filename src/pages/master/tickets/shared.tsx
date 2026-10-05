import { ArrowRight, Check, ChevronDown, Loader2, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  assignTicket,
  NEXT_STATUS,
  raiseTicket,
  setTicketStatus,
  updateTicket,
  useAssignees,
  KIND_META,
  type Ticket,
  type TicketKind,
  type TicketStatus,
  TICKET_PRIORITIES,
  type TicketPriority,
} from "@/api/tickets";
import { NAV } from "@/components/layout/nav";
import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Input, Label, Select, Spinner, Textarea, type Tone } from "@/components/ui/primitives";
import { findTicketProject, MULTISARV_PROJECT, useProjects } from "@/context/projects";
import { canModule, isSuper, useAdmin, useVisibleProjects, type ModulePerm } from "@/context/session";
import { t, type MsgKey } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

// ── Labels / permissions ─────────────────────────────────────────────

export const KIND_LABEL: Record<TicketKind, MsgKey> = {
  client: "master.nav.clientTickets",
  dev: "master.nav.devTickets",
};

const STATUS_META: Record<TicketStatus, { label: MsgKey; tone: Tone }> = {
  open: { label: "tickets.status.open", tone: "blue" },
  inProcess: { label: "tickets.status.inProcess", tone: "amber" },
  uat: { label: "tickets.status.uat", tone: "cyan" },
  closed: { label: "tickets.status.closed", tone: "green" },
  hold: { label: "tickets.status.hold", tone: "violet" },
};

export const statusLabel = (s: TicketStatus) => t(STATUS_META[s].label);

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge tone={STATUS_META[status].tone} dot>
      {statusLabel(status)}
    </Badge>
  );
}

/** Current admin la ya ticket module madhe kay karta yeta. */
export function useTicketPerms(kind: TicketKind) {
  const me = useAdmin();
  const can = (p: ModulePerm) => canModule(me, KIND_META[kind].module, p);
  return { view: can("view"), raise: can("raise"), edit: can("edit"), assign: can("assign"), status: can("status") };
}

const PRIORITY_META: Record<TicketPriority, { label: MsgKey; tone: Tone }> = {
  medium: { label: "tickets.priority.medium", tone: "blue" },
  low: { label: "tickets.priority.low", tone: "neutral" },
  high: { label: "tickets.priority.high", tone: "amber" },
  critical: { label: "tickets.priority.critical", tone: "red" },
  showstopper: { label: "tickets.priority.showstopper", tone: "violet" },
};

export const priorityLabel = (p: TicketPriority) => t(PRIORITY_META[p].label);

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge tone={PRIORITY_META[priority].tone}>{priorityLabel(priority)}</Badge>;
}

/**
 * Ticket sathi app modules — project che menus (`NAV`, core MARKETPLACE_MENUS sobat same).
 * Multisarv (core) la app modules nahit → rikama.
 */
export const ticketModules = (projectId: string) => (!projectId || projectId === MULTISARV_PROJECT.id ? [] : NAV);

export const moduleLabel = (m: string | null) => {
  const n = m ? NAV.find((x) => x.menu === m) : undefined;
  return n ? t(n.label) : (m ?? "");
};

export function ModuleName({ module }: { module: string | null }) {
  return module ? <span className="whitespace-nowrap">{moduleLabel(module)}</span> : <span className="text-muted">—</span>;
}

export function ProjectName({ id }: { id: string }) {
  useProjects(); // navin project aala ki naav taja
  const p = findTicketProject(id);
  if (!p) return <span className="text-muted">{id || "—"}</span>;
  const body = (
    <>
      <ProjectMark project={p} size="sm" />
      {p.name}
    </>
  );
  // Khare project → Project Overview (Multisarv la overview nahi).
  if (p.id === MULTISARV_PROJECT.id) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{body}</span>;
  return (
    <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-accent">
      {body}
    </Link>
  );
}

export function PersonCell({ person, empty }: { person: { uid: string; name: string } | null; empty?: string }) {
  if (!person) return <span className="text-xs text-muted italic">{empty ?? t("tickets.unassigned")}</span>;
  return (
    <span className="inline-flex max-w-44 items-center gap-2">
      <Avatar name={person.name} seed={person.uid} size="sm" />
      <span className="truncate">{person.name}</span>
    </span>
  );
}

// ── Raise / Edit ─────────────────────────────────────────────────────

export function TicketFormModal({
  kind,
  ticket,
  open,
  onClose,
  onRaised,
}: {
  kind: TicketKind;
  /** Asel tar Edit, nasel tar Raise. */
  ticket?: Ticket | null;
  open: boolean;
  onClose: () => void;
  onRaised?: (id: string) => void;
}) {
  const me = useAdmin();
  const perms = useTicketPerms(kind);
  const editing = !!ticket;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [module, setModule] = useState("");
  const [busy, setBusy] = useState(false);
  const assignees = useAssignees(kind, open && !editing && perms.assign, projectId);

  // Multisarv (master panel) nehmi + projects (super admin la sagle, itaranna access aslele).
  const all = useProjects();
  const visible = useVisibleProjects(me);
  const projects = [MULTISARV_PROJECT, ...(isSuper(me) ? all : visible)];
  const options =
    ticket && !projects.some((p) => p.id === ticket.projectId)
      ? [...projects, ...all.filter((p) => p.id === ticket.projectId)]
      : projects;

  useEffect(() => {
    if (!open) return;
    setTitle(ticket?.title ?? "");
    setDescription(ticket?.description ?? "");
    setProjectId(ticket?.projectId ?? "");
    setPriority(ticket?.priority ?? "medium");
    setModule(ticket?.module ?? "");
    setAssignee("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket?.id]);

  const valid = title.trim().length >= 3 && description.trim().length >= 3 && !!projectId;

  const submit = async () => {
    setBusy(true);
    try {
      const input = { title: title.trim(), description: description.trim(), projectId, priority, module: module || null };
      if (ticket) {
        await updateTicket(ticket.id, input);
        toast.success(t("tickets.toast.updated", { id: ticket.id }));
      } else {
        const { id } = await raiseTicket(kind, { ...input, assignee: assignee || null });
        toast.success(t("tickets.toast.raised", { id }));
        onRaised?.(id);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="lg"
      title={editing ? t("tickets.editTitle", { id: ticket!.id }) : t("tickets.raiseTitle", { kind: t(KIND_LABEL[kind]) })}
      description={editing ? undefined : t("tickets.raiseHint")}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={submit} icon={<Check className="size-4" />}>
            {editing ? t("act.save") : t("tickets.raise")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label hint={`${title.trim().length}/150`}>{t("tickets.field.title")}</Label>
          <Input autoFocus value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder={t("tickets.field.titlePlaceholder")} />
        </div>
        <div>
          <Label>{t("tickets.field.description")}</Label>
          <Textarea className="min-h-32" value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} placeholder={t("tickets.field.descriptionPlaceholder")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("tickets.col.project")}</Label>
            <Select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                // Assignee list project-nusar badalte.
                setAssignee("");
                // Navin project madhe ha module nasel tar kadha.
                if (!ticketModules(e.target.value).some((m) => m.menu === module)) setModule("");
              }}
            >
              <option value="">{t("tickets.field.pickProject")}</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("tickets.col.priority")}</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label hint={t("word.optional")}>{t("tickets.col.module")}</Label>
            <Select value={module} onChange={(e) => setModule(e.target.value)} disabled={ticketModules(projectId).length === 0}>
              <option value="">{projectId && ticketModules(projectId).length === 0 ? t("tickets.module.none") : t("tickets.module.pick")}</option>
              {ticketModules(projectId).map((m) => (
                <option key={m.menu} value={m.menu}>
                  {t(m.label)}
                </option>
              ))}
            </Select>
          </div>
          {!editing && perms.assign && (
            <div>
              <Label hint={t("word.optional")}>{t("tickets.col.assignedTo")}</Label>
              <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!assignees}>
                <option value="">{t("tickets.unassigned")}</option>
                {assignees?.map((a) => (
                  <option key={a.uid} value={a.uid}>
                    {a.name} · {a.email}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        {!editing && (
          <p className="rounded-lg bg-surface-2/70 px-3 py-2 text-[11px] text-muted">
            {t("tickets.raisedAsOpen", { status: statusLabel("open") })}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ── Assign / Reassign ────────────────────────────────────────────────

export function AssignModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const assignees = useAssignees(ticket?.kind ?? "client", !!ticket, ticket?.projectId);
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (uid: string | null) => {
    if (!ticket) return;
    setBusy(uid ?? "none");
    try {
      await assignTicket(ticket.id, uid);
      toast.success(uid ? t("tickets.toast.assigned", { id: ticket.id }) : t("tickets.toast.unassigned", { id: ticket.id }));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const current = ticket?.assignedTo?.uid ?? null;

  return (
    <Modal
      open={!!ticket}
      onClose={busy ? () => {} : onClose}
      size="sm"
      title={ticket?.assignedTo ? t("tickets.reassignTitle", { id: ticket?.id ?? "" }) : t("tickets.assignTitle", { id: ticket?.id ?? "" })}
      description={t("tickets.assignHint")}
    >
      {!assignees ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <ul className="-mx-2 max-h-80 space-y-0.5 overflow-y-auto">
          {assignees.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t("tickets.noAssignees")}</li>}
          {assignees.map((a) => (
            <li key={a.uid}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => a.uid !== current && pick(a.uid)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
                  a.uid === current ? "bg-accent/10" : "hover:bg-surface-2",
                )}
              >
                <Avatar name={a.name} seed={a.uid} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-[11px] text-muted">{a.email}</span>
                </span>
                {busy === a.uid ? (
                  <Loader2 className="size-4 animate-spin text-muted" />
                ) : a.uid === current ? (
                  <Check className="size-4 text-accent" />
                ) : (
                  <UserPlus className="size-4 text-muted" />
                )}
              </button>
            </li>
          ))}
          {current && (
            <li className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => pick(null)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
              >
                {busy === "none" ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
                {t("tickets.unassign")}
              </button>
            </li>
          )}
        </ul>
      )}
    </Modal>
  );
}

// ── Change status ────────────────────────────────────────────────────

/** Workflow pramane pudhche status — Open → In Process → Closed, In Process ⇄ Hold. */
export function StatusMenu({ ticket, size = "sm", align = "right" }: { ticket: Ticket; size?: "sm" | "md"; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const next = NEXT_STATUS[ticket.status];

  useEffect(() => {
    if (!open) return;
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: align === "right" ? r.right - 208 : r.left });
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, align]);

  const change = async (s: TicketStatus) => {
    setOpen(false);
    setBusy(true);
    try {
      await setTicketStatus(ticket.id, s);
      toast.success(t("tickets.toast.status", { id: ticket.id, status: statusLabel(s) }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        ref={btn}
        size={size}
        disabled={next.length === 0}
        loading={busy}
        title={next.length === 0 ? t("tickets.closedFinal") : t("tickets.changeStatus")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {t("tickets.status.short")}
        <ChevronDown className="size-3.5" />
      </Button>
      {open &&
        pos &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
            <div
              className="animate-pop absolute w-52 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-pop"
              style={{ top: pos.top, left: Math.min(Math.max(8, pos.left), window.innerWidth - 216) }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                {t("tickets.moveTo")}
              </p>
              {next.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => change(s)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface-2"
                >
                  <StatusBadge status={ticket.status} />
                  <ArrowRight className="size-3.5 text-muted" />
                  <StatusBadge status={s} />
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
