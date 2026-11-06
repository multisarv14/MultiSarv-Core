import { Archive, ArchiveRestore, ArrowLeft, Download, Eye, FileText, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  archiveCorpRecord,
  CORP_ACCEPT,
  corpError,
  fieldLabel,
  kindLabel,
  kindSingular,
  openCorpFile,
  removeCorpFile,
  uploadCorpFile,
  useCorpRecord,
  useCorpRefresh,
  type CorpFile,
  type CorpKind,
  type CorpRow,
  type CorpSchema,
} from "@/api/corporate";
import { ErrorState } from "@/components/ui/data";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, KV, Segmented, Skeleton } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { date, dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";

import { RecordForm } from "./RecordForm";
import { ComputedValue, FieldValue, fileSize, HistoryList, isVisible } from "./shared";

export interface Target {
  kind: string;
  id: string;
}

/** Record che files — upload, ughadne (audit), kadhne. */
export function Files({ kind, row, readOnly }: { kind: string; row: CorpRow; readOnly?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CorpFile | null>(null);
  const refresh = useCorpRefresh();

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("upload");
    try {
      for (const f of Array.from(list)) await uploadCorpFile(kind, row.id, f);
      toast.success(t("corp.file.uploaded"));
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const open = async (f: CorpFile, download = false) => {
    setBusy(f.id);
    try {
      await openCorpFile(kind, row.id, f, download);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    try {
      await removeCorpFile(kind, row.id, removing.id);
      toast.success(t("corp.file.removed"));
      setRemoving(null);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Paperclip className="size-4" /> {t("corp.file.title")} <Badge tone="neutral">{row.files.length}</Badge>
          </span>
        }
        subtitle={t("corp.file.hint")}
        action={
          !readOnly && (
            <Button size="sm" icon={<Upload className="size-3.5" />} loading={busy === "upload"} onClick={() => input.current?.click()}>
              {t("corp.file.upload")}
            </Button>
          )
        }
      />
      <input ref={input} type="file" multiple hidden accept={CORP_ACCEPT} onChange={(e) => upload(e.target.files)} />
      {row.files.length === 0 ? (
        <p className="px-5 pb-5 text-xs text-muted">{t("corp.file.none")}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {row.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-2.5">
              <FileText className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.name}</p>
                <p className="text-[11px] text-muted">
                  {fileSize(f.size)} · {f.byName} · {dateTime(f.uploadedAt ? new Date(f.uploadedAt) : null)}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="size-8" title={t("corp.file.view")} disabled={!!busy} onClick={() => open(f)}>
                <Eye className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="size-8" title={t("corp.file.download")} disabled={!!busy} onClick={() => open(f, true)}>
                <Download className="size-4" />
              </Button>
              {!readOnly && (
                <Button size="icon" variant="ghost" className="size-8 text-rose-500" title={t("corp.file.remove")} disabled={!!busy} onClick={() => setRemoving(f)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={!!removing && busy === removing.id}
        tone="danger"
        title={t("corp.file.removeTitle")}
        description={t("corp.file.removeDesc", { name: removing?.name ?? "" })}
        confirmLabel={t("corp.file.remove")}
      />
    </Card>
  );
}

/** Record che sagle fields — label / value grid. */
export function Details({ kind, row, onOpen }: { kind: CorpKind; row: CorpRow; onOpen?: (kind: string, id: string) => void }) {
  const fields = kind.fields.filter((f) => isVisible(kind.kind, f, row) && f.type !== "textarea");
  const long = kind.fields.filter((f) => f.type === "textarea" && row[f.key]);
  return (
    <div className="space-y-4">
      {kind.computed?.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kind.computed.map((c) => (
            <div key={c.key} className="rounded-xl border border-border bg-surface px-3 py-2.5">
              <p className="text-[11px] text-muted">{fieldLabel(c)}</p>
              <div className="mt-0.5 text-base font-semibold">
                <ComputedValue kind={kind} field={c} row={row} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <Card className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
        {fields.map((f) => (
          <KV key={f.key} label={fieldLabel(f)}>
            <FieldValue field={f} row={row} onRef={onOpen} />
          </KV>
        ))}
      </Card>
      {long.map((f) => (
        <Card key={f.key} className="p-5">
          <p className="mb-1.5 text-xs font-medium text-muted">{fieldLabel(f)}</p>
          <FieldValue field={f} row={row} full />
        </Card>
      ))}
      <p className="text-[11px] text-muted">
        {t("corp.meta", {
          created: date(row.createdAt ? new Date(row.createdAt) : null),
          by: row.createdByName ?? "—",
          updated: dateTime(row.updatedAt ? new Date(row.updatedAt) : null),
          updatedBy: row.updatedByName ?? "—",
        })}
      </p>
    </div>
  );
}

/** Related records (shareholder → transactions, meeting → resolutions …). */
function Related({ schema, related, onOpen, onAdd }: { schema: CorpSchema; related: { kind: string; field: string; rows: CorpRow[] }[]; onOpen: (k: string, id: string) => void; onAdd?: (kind: CorpKind, field: string) => void }) {
  return (
    <div className="space-y-4">
      {related.map((r) => {
        const def = schema.kinds.find((k) => k.kind === r.kind);
        if (!def) return null;
        const cols = def.fields.filter((f) => f.list && f.key !== r.field).slice(0, 4);
        return (
          <Card key={`${r.kind}.${r.field}`}>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  {kindLabel(def)} <Badge tone="neutral">{r.rows.length}</Badge>
                </span>
              }
              subtitle={fieldLabel(def.fields.find((f) => f.key === r.field)!)}
              action={
                onAdd && (
                  <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => onAdd(def, r.field)}>
                    {t("corp.add")}
                  </Button>
                )
              }
            />
            <ul className="divide-y divide-border border-t border-border">
              {r.rows.slice(0, 50).map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onOpen(r.kind, row.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-left text-sm transition hover:bg-surface-2/60">
                    {cols.map((f) => (
                      <span key={f.key} className="min-w-0">
                        <FieldValue field={f} row={row} />
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

type Tab = "details" | "files" | "related" | "history";

/** Ek record — details, files, jodlele records, itihas; edit / archive / restore. Related var click = stack. */
export function RecordDrawer({ target, schema, onClose }: { target: Target | null; schema: CorpSchema; onClose: () => void }) {
  const [stack, setStack] = useState<Target[]>([]);
  const current = stack.length ? stack[stack.length - 1] : target;
  const [tab, setTab] = useState<Tab>("details");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ kind: CorpKind; preset: Record<string, unknown> } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = useCorpRefresh();

  const kind = schema.kinds.find((k) => k.kind === current?.kind);
  const q = useCorpRecord(current?.kind, current?.id);
  const row = q.data?.record ?? null;

  const close = () => {
    setStack([]);
    setTab("details");
    onClose();
  };
  const openRef = (k: string, id: string) => {
    setStack((s) => [...(s.length ? s : target ? [target] : []), { kind: k, id }]);
    setTab("details");
  };
  const back = () => {
    setStack((s) => s.slice(0, -1));
    setTab("details");
  };

  const toggleArchive = async (reason: string) => {
    if (!row || !kind) return;
    setBusy(true);
    try {
      await archiveCorpRecord(kind.kind, row.id, !row.archived, reason);
      toast.success(row.archived ? t("corp.restored") : t("corp.archived"));
      setArchiving(false);
      await refresh();
    } catch (err) {
      toast.error(corpError(err, kind));
    } finally {
      setBusy(false);
    }
  };

  const relatedCount = q.data?.related.reduce((s, r) => s + r.rows.length, 0) ?? 0;

  return (
    <Drawer
      open={!!target}
      onClose={close}
      width="max-w-2xl"
      title={
        <span className="inline-flex items-center gap-2">
          {stack.length > 1 && (
            <Button size="icon" variant="ghost" className="-ml-2 size-8" onClick={back} title={t("corp.back")}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          {row?._title ?? (kind ? kindSingular(kind) : "")}
          {row?.archived && <Badge tone="red">{t("corp.archivedBadge")}</Badge>}
        </span>
      }
      subtitle={kind ? kindSingular(kind) : undefined}
      actions={
        row &&
        kind && (
          <>
            {!row.archived && (
              <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                {t("corp.edit")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={row.archived ? "" : "text-rose-500"}
              icon={row.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
              onClick={() => (row.archived ? toggleArchive("") : setArchiving(true))}
              loading={busy && !!row.archived}
            >
              {row.archived ? t("corp.restore") : t("corp.archive")}
            </Button>
          </>
        )
      }
    >
      {q.isLoading || !kind ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-64" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !row ? (
        <ErrorState error={new Error(t("core.err.corpNotFound"))} />
      ) : (
        <div className="space-y-4">
          {row.archived && row.archiveReason && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">{row.archiveReason}</p>}
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "details", label: t("corp.tab.details") },
              { value: "files", label: t("corp.file.title"), count: row.files.length },
              ...(relatedCount ? [{ value: "related" as Tab, label: t("corp.tab.related"), count: relatedCount }] : []),
              { value: "history", label: t("corp.tab.history"), count: q.data?.history.length },
            ]}
          />
          {tab === "details" && <Details kind={kind} row={row} onOpen={openRef} />}
          {tab === "files" && <Files kind={kind.kind} row={row} readOnly={row.archived} />}
          {tab === "related" && (
            <Related
              schema={schema}
              related={q.data?.related ?? []}
              onOpen={openRef}
              onAdd={row.archived ? undefined : (k, field) => setAdding({ kind: k, preset: { [field]: row.id } })}
            />
          )}
          {tab === "history" && <HistoryList items={q.data?.history ?? []} schema={schema} />}
        </div>
      )}

      {kind && row && <RecordForm open={editing} onClose={() => setEditing(false)} kind={kind} schema={schema} row={row} />}
      {adding && <RecordForm open onClose={() => setAdding(null)} kind={adding.kind} schema={schema} preset={adding.preset} />}
      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={toggleArchive}
        loading={busy}
        tone="danger"
        withReason
        title={t("corp.archiveTitle", { name: row?._title ?? "" })}
        description={t("corp.archiveDesc")}
        confirmLabel={t("corp.archive")}
      />
    </Drawer>
  );
}
