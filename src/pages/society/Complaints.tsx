import { useQueryClient } from "@tanstack/react-query";
import { Image, MessageSquareWarning, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { blobSrc, listComplaints, TICKET_STATUSES, updateComplaintStatus, type Complaint, type TicketStatus } from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Lightbox, Modal } from "@/components/ui/overlay";
import { Badge, Button, EmptyState, Label, Segmented, Select, Textarea } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";

import { matches, SearchBox, TicketBadge, ticketLabel } from "./parts";
import { enumLabel, useSociety, useSocietyQuery } from "./state";

function UpdateDialog({ complaint, onClose }: { complaint: Complaint | null; onClose: () => void }) {
  const { project } = useProject();
  const { current } = useSociety();
  const qc = useQueryClient();
  const [status, setStatus] = useState<TicketStatus>("OPEN");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!complaint) return;
    setStatus(complaint.status);
    setNotes("");
  }, [complaint]);

  const save = async () => {
    if (!complaint || !current) return;
    setBusy(true);
    try {
      await updateComplaintStatus(project, current.code, complaint, status, notes);
      toast.success(t("soc.complaints.updated"));
      qc.invalidateQueries({ queryKey: [project.id, "soc", current.code] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!complaint}
      onClose={busy ? () => {} : onClose}
      title={t("soc.complaints.update")}
      description={complaint ? `#${complaint.id} · ${complaint.flatNumber} · ${enumLabel(complaint.category)}` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      {complaint && <p className="mb-4 rounded-lg bg-surface-2/60 p-3 text-sm whitespace-pre-line">{complaint.description}</p>}
      <Label>{t("soc.col.status")}</Label>
      <Select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
        {TICKET_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ticketLabel(s)}
          </option>
        ))}
      </Select>
      <div className="mt-4">
        <Label hint={complaint?.resolutionNotes ? t("soc.complaints.notesKeep") : undefined}>{t("soc.complaints.notes")}</Label>
        <Textarea
          className="min-h-24"
          value={notes}
          maxLength={1000}
          placeholder={complaint?.resolutionNotes || t("soc.complaints.notesPlaceholder")}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}

export function Complaints() {
  const { menus } = useProject();
  const list = useSocietyQuery("complaints", listComplaints);
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const canEdit = allows(menus, "complaints");

  const all = list.data ?? [];
  const rows = all.filter(
    (c) => (status === "all" || c.status === status) && matches(q, c.flatNumber, c.residentName, c.description, c.id),
  );

  const columns: Column<Complaint>[] = [
    {
      key: "id",
      header: "#",
      cell: (c) => (
        <div>
          <p className="font-mono text-xs">#{c.id}</p>
          <p className="text-[11px] whitespace-nowrap text-muted">{c.filedDate}</p>
        </div>
      ),
    },
    {
      key: "flat",
      header: t("soc.col.flat"),
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-mono font-semibold">{c.flatNumber}</p>
          <p className="truncate text-[11px] text-muted">{c.residentName}</p>
        </div>
      ),
    },
    {
      key: "issue",
      header: t("soc.col.issue"),
      cell: (c) => (
        <div className="min-w-0 max-w-sm">
          <Badge>{enumLabel(c.category)}</Badge>
          <p className="mt-1 line-clamp-2 text-xs">{c.description}</p>
          {c.resolutionNotes && <p className="mt-1 line-clamp-1 text-[11px] text-muted">↳ {c.resolutionNotes}</p>}
        </div>
      ),
    },
    { key: "status", header: t("soc.col.status"), cell: (c) => <TicketBadge status={c.status} /> },
    {
      key: "act",
      header: "",
      className: "text-right",
      cell: (c) => (
        <div className="flex justify-end gap-1">
          {c.attachment && (
            <Button size="icon" variant="ghost" className="size-8" title={t("soc.complaints.photo")} onClick={() => setPhoto(blobSrc(c.attachment))}>
              <Image className="size-4" />
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" icon={<PencilLine className="size-3.5" />} onClick={() => setEditing(c)}>
              {t("soc.complaints.update")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("soc.nav.complaints")}
        description={t("soc.complaints.desc")}
        actions={<SearchBox value={q} onChange={setQ} placeholder={t("soc.complaints.search")} />}
      />
      <Segmented
        className="mb-3"
        value={status}
        onChange={setStatus}
        options={[
          { value: "all" as const, label: t("soc.filter.all"), count: all.length },
          ...TICKET_STATUSES.map((s) => ({ value: s, label: ticketLabel(s), count: all.filter((c) => c.status === s).length })),
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.docId}
          loading={list.isLoading}
          empty={<EmptyState icon={<MessageSquareWarning className="size-5" />} title={t("soc.complaints.empty")} />}
        />
      )}
      <UpdateDialog complaint={editing} onClose={() => setEditing(null)} />
      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </>
  );
}
