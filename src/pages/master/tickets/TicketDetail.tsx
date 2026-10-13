import { ArrowRight, ChevronRight, CircleDot, MessageSquare, Pencil, PlusCircle, Send, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { addTicketComment, KIND_META, useTicket, useTicketComments, useTicketPeople, type TicketComment, type TicketKind } from "@/api/tickets";
import { MentionText, MentionTextarea, mentionsIn } from "@/components/MentionTextarea";
import { rise } from "@/components/ui/motion";
import { ErrorState } from "@/components/ui/data";
import { Avatar, Button, Card, CardHeader, EmptyState, KV, Skeleton } from "@/components/ui/primitives";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { ago, dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";

import {
  AssignModal,
  KIND_LABEL,
  ModuleName,
  PersonCell,
  PriorityBadge,
  ProjectName,
  StatusBadge,
  StatusMenu,
  statusLabel,
  TicketFormModal,
  useTicketPerms,
} from "./shared";

/** Comments / Updates thread madhli ek nond. */
function Entry({ c, index, me }: { c: TicketComment; index: number; me: string }) {
  if (c.type === "comment") {
    return (
      <li className="animate-rise flex gap-3" style={rise(index)}>
        <Avatar name={c.by?.name ?? "?"} seed={c.by?.uid} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-xs">
            <span className="font-semibold">{c.by?.name}</span>{" "}
            <span className="text-muted" title={dateTime(c.at)}>
              · {ago(c.at)}
            </span>
          </p>
          <div className="mt-1 rounded-xl rounded-tl-sm border border-border bg-surface-2/50 px-3 py-2 text-sm break-words whitespace-pre-wrap">
            <MentionText text={c.text ?? ""} people={c.mentions} me={me} />
          </div>
        </div>
      </li>
    );
  }
  const Icon = c.type === "assign" ? UserPlus : c.type === "edit" ? Pencil : c.type === "created" ? PlusCircle : CircleDot;
  const what =
    c.type === "created" ? (
      t("tickets.log.created")
    ) : c.type === "edit" ? (
      t("tickets.log.edited")
    ) : c.type === "assign" ? (
      c.to ? (
        t("tickets.log.assigned", { name: c.to })
      ) : (
        t("tickets.log.unassigned")
      )
    ) : (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {t("tickets.log.status")}
        {c.from && <StatusBadge status={c.from as never} />}
        <ArrowRight className="size-3" />
        {c.to && <StatusBadge status={c.to as never} />}
      </span>
    );
  return (
    <li className="animate-rise flex items-center gap-3 text-xs text-muted" style={rise(index)}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-text">{c.by?.name}</span> {what}
      </span>
      <span className="shrink-0" title={dateTime(c.at)}>
        {ago(c.at)}
      </span>
    </li>
  );
}

function TicketDetail({ kind }: { kind: TicketKind }) {
  const { ticketId } = useParams();
  const perms = useTicketPerms(kind);
  const { data: tk, error, missing } = useTicket(ticketId);
  const comments = useTicketComments(ticketId);
  const me = useAdmin();
  // `@mention` — fakt ha ticket pahu shaknare.
  const people = useTicketPeople(ticketId).map((p) => ({ uid: p.uid, name: p.name }));
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const base = KIND_META[kind].path;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!tk || !text.trim()) return;
    setSending(true);
    try {
      const body = text.trim();
      const r = await addTicketComment(tk.id, body, mentionsIn(body, people));
      setText("");
      if (r.status) toast.success(t("tickets.toast.status", { id: tk.id, status: statusLabel(r.status) }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const crumbs = (
    <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted">
      <Link to={base} className="hover:text-text">
        {t(KIND_LABEL[kind])}
      </Link>
      <ChevronRight className="size-3.5" />
      <span className="font-mono text-text">{ticketId}</span>
    </nav>
  );

  if (error) return <>{crumbs}<ErrorState error={new Error(error)} /></>;
  if (missing || (tk && tk.kind !== kind)) {
    return (
      <>
        {crumbs}
        <Card>
          <EmptyState
            title={t("tickets.notFound", { id: ticketId ?? "" })}
            action={
              <Link to={base}>
                <Button size="sm">{t(KIND_LABEL[kind])}</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }
  if (!tk) {
    return (
      <>
        {crumbs}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </>
    );
  }

  return (
    <>
      {crumbs}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-accent">{tk.id}</span>
            <StatusBadge status={tk.status} />
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight break-words">{tk.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {perms.edit && (
            <Button size="md" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              {t("tickets.edit")}
            </Button>
          )}
          {perms.assign && (
            <Button size="md" icon={<UserPlus className="size-3.5" />} onClick={() => setAssigning(true)}>
              {tk.assignedTo ? t("tickets.reassign") : t("tickets.assign")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="animate-rise">
            <CardHeader title={t("tickets.field.description")} />
            <p className="px-5 pb-5 text-sm leading-relaxed whitespace-pre-wrap">{tk.description}</p>
          </Card>

          {/* Status — comment chya adhi. */}
          <Card className="animate-rise" style={rise(1)}>
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">{t("tickets.col.status")}</p>
                <div className="mt-1.5">
                  <StatusBadge status={tk.status} />
                </div>
              </div>
              {perms.status && <StatusMenu ticket={tk} size="md" />}
            </div>
            {tk.status === "open" && tk.assignedTo && (
              <p className="border-t border-border px-5 py-2.5 text-[11px] text-muted">{t("tickets.autoStartHint", { name: tk.assignedTo.name })}</p>
            )}
          </Card>

          <Card className="animate-rise" style={rise(2)}>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <MessageSquare className="size-4" /> {t("tickets.comments")}
                </span>
              }
            />
            <div className="px-5 pb-5">
              <form onSubmit={send} className="mb-5 border-b border-border pb-5">
                <MentionTextarea
                  value={text}
                  people={people}
                  maxLength={2000}
                  onChange={setText}
                  placeholder={t("tickets.commentPlaceholder")}
                  className="min-h-20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e as unknown as FormEvent);
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">⌘/Ctrl + Enter</span>
                  <Button variant="primary" size="sm" loading={sending} disabled={!text.trim()} icon={<Send className="size-3.5" />}>
                    {t("tickets.addComment")}
                  </Button>
                </div>
              </form>
              {/* Navin var — comment kela ki lagech disto. */}
              {!comments ? (
                <Skeleton className="h-24" />
              ) : (
                <ol className="space-y-4">
                  {[...comments].reverse().map((c, i) => (
                    <Entry key={c.id} c={c} index={i} me={me.uid} />
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>

        <Card className="animate-rise order-first p-5 lg:sticky lg:top-20 lg:order-none" style={rise(0)}>
          <div className="divide-y divide-border">
            <KV label={t("tickets.col.id")}>
              <span className="font-mono">{tk.id}</span>
            </KV>
            <KV label={t("tickets.col.status")}>
              <StatusBadge status={tk.status} />
            </KV>
            <KV label={t("tickets.col.project")}>
              <ProjectName id={tk.projectId} />
            </KV>
            <KV label={t("tickets.col.module")}>
              <ModuleName module={tk.module} />
            </KV>
            <KV label={t("tickets.col.priority")}>
              <PriorityBadge priority={tk.priority} />
            </KV>
            <KV label={t("tickets.col.raisedBy")}>
              <PersonCell person={tk.raisedBy} />
            </KV>
            <KV label={t("tickets.col.assignedTo")}>
              <PersonCell person={tk.assignedTo} />
            </KV>
            <KV label={t("tickets.col.created")}>{dateTime(tk.createdAt)}</KV>
            <KV label={t("tickets.col.updated")}>{dateTime(tk.updatedAt)}</KV>
          </div>
          {tk.status === "closed" && <p className="mt-3 text-[11px] text-muted">{t("tickets.closedFinal")}</p>}
        </Card>
      </div>

      <TicketFormModal kind={kind} ticket={tk} open={editing} onClose={() => setEditing(false)} />
      <AssignModal ticket={assigning ? tk : null} onClose={() => setAssigning(false)} />
    </>
  );
}

export const ClientTicketDetail = () => <TicketDetail key="client" kind="client" />;
export const DevTicketDetail = () => <TicketDetail key="dev" kind="dev" />;
