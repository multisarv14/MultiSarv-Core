import { ArrowDownWideNarrow, ArrowUpNarrowWide, Eye, Pencil, Plus, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { KIND_META, TICKET_STATUSES, useTickets, type Ticket, type TicketKind, type TicketStatus } from "@/api/tickets";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Button, EmptyState, Input, Segmented, Select } from "@/components/ui/primitives";
import { findTicketProject } from "@/context/projects";
import { isSuper, useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { date, dateTime } from "@/lib/format";

import {
  AssignModal,
  KIND_LABEL,
  ModuleName,
  PersonCell,
  PriorityBadge,
  ProjectName,
  statusLabel,
  StatusBadge,
  StatusMenu,
  TicketFormModal,
  useTicketPerms,
} from "./shared";
import { SORT_KEYS, SORT_LABEL, sortTickets, type SortKey } from "./sort";

type StatusFilter = "all" | TicketStatus;
type WhoFilter = "all" | "mine" | "raisedByMe" | "unassigned";
/** Client Tickets / Dev Tickets — sopi list, search, filter ani actions. */
function TicketList({ kind }: { kind: TicketKind }) {
  const me = useAdmin();
  const navigate = useNavigate();
  const perms = useTicketPerms(kind);
  const { data, error } = useTickets(kind, !isSuper(me));
  const [status, setStatus] = useState<StatusFilter>("all");
  const [project, setProject] = useState("");
  const [who, setWho] = useState<WhoFilter>("all");
  const [q, setQ] = useState("");
  // Default: juni tickets adhi.
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [raising, setRaising] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [assigning, setAssigning] = useState<Ticket | null>(null);
  const base = KIND_META[kind].path;

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, open: 0, inProcess: 0, uat: 0, closed: 0, hold: 0 };
    (data ?? []).forEach((tk) => {
      c.all++;
      c[tk.status]++;
    });
    return c;
  }, [data]);

  const projects = useMemo(() => [...new Set((data ?? []).map((tk) => tk.projectId))], [data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data ?? []).filter(
      (tk) =>
        (status === "all" || tk.status === status) &&
        (!project || tk.projectId === project) &&
        (who === "all" ||
          (who === "mine" && tk.assignedTo?.uid === me.uid) ||
          (who === "raisedByMe" && tk.raisedBy?.uid === me.uid) ||
          (who === "unassigned" && !tk.assignedTo)) &&
        (!term ||
          tk.id.toLowerCase().includes(term) ||
          tk.title.toLowerCase().includes(term) ||
          tk.raisedBy?.name.toLowerCase().includes(term) ||
          tk.assignedTo?.name.toLowerCase().includes(term)),
    );
    return sortTickets(list, sort, dir);
  }, [data, status, project, who, q, me.uid, sort, dir]);

  const columns: Column<Ticket>[] = [
    {
      key: "id",
      header: t("tickets.col.id"),
      cell: (tk) => (
        <Link to={`${base}/${tk.id}`} className="font-mono text-xs font-semibold whitespace-nowrap text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {tk.id}
        </Link>
      ),
    },
    {
      key: "title",
      header: t("tickets.col.title"),
      cell: (tk) => <span className="line-clamp-2 max-w-72 font-medium">{tk.title}</span>,
    },
    { key: "project", header: t("tickets.col.project"), cell: (tk) => <ProjectName id={tk.projectId} />, hideSm: true },
    { key: "module", header: t("tickets.col.module"), cell: (tk) => <ModuleName module={tk.module} />, hideSm: true },
    { key: "priority", header: t("tickets.col.priority"), cell: (tk) => <PriorityBadge priority={tk.priority} /> },
    { key: "raisedBy", header: t("tickets.col.raisedBy"), cell: (tk) => <PersonCell person={tk.raisedBy} />, hideSm: true },
    { key: "assignedTo", header: t("tickets.col.assignedTo"), cell: (tk) => <PersonCell person={tk.assignedTo} /> },
    { key: "status", header: t("tickets.col.status"), cell: (tk) => <StatusBadge status={tk.status} /> },
    {
      key: "created",
      header: t("tickets.col.created"),
      cell: (tk) => (
        <span className="text-xs whitespace-nowrap text-muted" title={dateTime(tk.createdAt)}>
          {date(tk.createdAt)}
        </span>
      ),
      hideSm: true,
    },
    {
      key: "action",
      header: t("tickets.col.action"),
      className: "text-right",
      cell: (tk) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="size-8" title={t("tickets.view")} onClick={() => navigate(`${base}/${tk.id}`)}>
            <Eye className="size-4" />
          </Button>
          {perms.edit && (
            <Button size="icon" variant="ghost" className="size-8" title={t("tickets.edit")} onClick={() => setEditing(tk)}>
              <Pencil className="size-4" />
            </Button>
          )}
          {perms.assign && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              title={tk.assignedTo ? t("tickets.reassign") : t("tickets.assign")}
              onClick={() => setAssigning(tk)}
            >
              <UserPlus className="size-4" />
            </Button>
          )}
          {perms.status && <StatusMenu ticket={tk} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t(KIND_LABEL[kind])}
        description={t(kind === "client" ? "tickets.client.desc" : "tickets.dev.desc")}
        actions={
          perms.raise && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setRaising(true)}>
              {t("tickets.raise")}
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            ...TICKET_STATUSES.map((s) => ({ value: s, label: statusLabel(s), count: counts[s] })),
            { value: "all", label: t("word.all"), count: counts.all },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select className="w-full sm:w-40" value={who} onChange={(e) => setWho(e.target.value as WhoFilter)}>
            <option value="all">{t("tickets.filter.everyone")}</option>
            <option value="mine">{t("tickets.filter.mine")}</option>
            <option value="raisedByMe">{t("tickets.filter.raisedByMe")}</option>
            <option value="unassigned">{t("tickets.unassigned")}</option>
          </Select>
          {projects.length > 1 && (
            <Select className="w-full sm:w-40" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">{t("tickets.filter.allProjects")}</option>
              {projects.map((id) => (
                <option key={id} value={id}>
                  {findTicketProject(id)?.name ?? id}
                </option>
              ))}
            </Select>
          )}
          <div className="col-span-2 flex gap-2">
            <Select className="w-full sm:w-44" aria-label={t("tickets.sort.label")} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t("tickets.sort.label")}: {t(SORT_LABEL[k])}
                </option>
              ))}
            </Select>
            <Button
              size="icon"
              className="shrink-0"
              title={t(dir === "asc" ? "tickets.sort.asc" : "tickets.sort.desc")}
              aria-label={t(dir === "asc" ? "tickets.sort.asc" : "tickets.sort.desc")}
              onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {dir === "asc" ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}
            </Button>
          </div>
          <div className="col-span-2 sm:w-64">
            <Input icon={<Search className="size-4" />} placeholder={t("tickets.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState error={new Error(error)} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(tk) => tk.id}
          loading={!data}
          onRowClick={(tk) => navigate(`${base}/${tk.id}`)}
          empty={
            <EmptyState
              title={data?.length ? t("tickets.noMatch") : t("tickets.empty")}
              description={!data?.length && perms.raise ? t("tickets.emptyHint") : undefined}
              action={
                !data?.length &&
                perms.raise && (
                  <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setRaising(true)}>
                    {t("tickets.raise")}
                  </Button>
                )
              }
            />
          }
        />
      )}

      <TicketFormModal kind={kind} open={raising} onClose={() => setRaising(false)} onRaised={(id) => navigate(`${base}/${id}`)} />
      <TicketFormModal kind={kind} ticket={editing} open={!!editing} onClose={() => setEditing(null)} />
      <AssignModal ticket={assigning} onClose={() => setAssigning(null)} />
    </>
  );
}

export const ClientTickets = () => <TicketList key="client" kind="client" />;
export const DevTickets = () => <TicketList key="dev" kind="dev" />;
