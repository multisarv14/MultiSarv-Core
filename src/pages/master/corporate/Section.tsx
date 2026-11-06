import { ArrowDown, ArrowUp, Building2, ChevronLeft, ChevronRight, Download, Eye, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  fetchCorpAll,
  fieldLabel,
  kindLabel,
  kindSingular,
  optionLabel,
  sectionLabel,
  useCorpList,
  useCorpOptions,
  useCorpRecord,
  type CorpField,
  type CorpKind,
  type CorpListParams,
  type CorpRow,
  type CorpSchema,
} from "@/api/corporate";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Segmented, Select, Skeleton, Toggle } from "@/components/ui/primitives";
import { useCompany } from "@/context/company";
import { t, tMaybe } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { money, num } from "@/lib/format";
import { downloadCsv } from "@/lib/utils";

import { Details, Files, RecordDrawer, type Target } from "./RecordDrawer";
import { RecordForm } from "./RecordForm";
import { ComputedValue, FieldValue, HistoryList, plainValue, useSchema } from "./shared";

const PAGE = 25;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function RefFilter({ field, value, onChange }: { field: CorpField; value: string; onChange: (v: string) => void }) {
  const { data } = useCorpOptions(field.ref);
  return (
    <Select className="w-44" value={value} onChange={(e) => onChange(e.target.value)} title={fieldLabel(field)}>
      <option value="">{t("corp.filter.any", { field: fieldLabel(field) })}</option>
      {(data ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.title}
        </option>
      ))}
    </Select>
  );
}

function Filter({ field, value, onChange }: { field: CorpField; value: string; onChange: (v: string) => void }) {
  if (field.type === "ref") return <RefFilter field={field} value={value} onChange={onChange} />;
  return (
    <Select className="w-44" value={value} onChange={(e) => onChange(e.target.value)} title={fieldLabel(field)}>
      <option value="">{t("corp.filter.any", { field: fieldLabel(field) })}</option>
      {field.type === "bool" ? (
        <>
          <option value="true">{t("word.yes")}</option>
          <option value="false">{t("word.no")}</option>
        </>
      ) : (
        field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {optionLabel(field, o.value)}
          </option>
        ))
      )}
    </Select>
  );
}

/** CSV — sagle fields (label = column), computed, meta. */
function toCsv(kind: CorpKind, rows: CorpRow[]) {
  return rows.map((r) => {
    const o: Record<string, unknown> = { ID: r.id };
    for (const f of kind.fields) o[fieldLabel(f)] = plainValue(f, r[f.key], r._refs?.[f.key]);
    for (const c of kind.computed ?? []) o[fieldLabel(c)] = plainValue(c, r[c.key]);
    o[t("corp.col.files")] = r.files.length;
    o[t("corp.col.updated")] = r.updatedAt ? new Date(r.updatedAt) : "";
    return o;
  });
}

/** Ekach kind chi list — search, filters, date range, archived, sort, pages, totals, CSV. */
function KindList({ kind, schema, onOpen }: { kind: CorpKind; schema: CorpSchema; onOpen: (t: Target) => void }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CorpRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const term = useDebounced(q);

  // Kind badalla (tab) — filters parat suruvatila.
  useEffect(() => {
    setQ("");
    setFilters({});
    setFrom("");
    setTo("");
    setArchived(false);
    setSort(null);
    setPage(0);
  }, [kind.kind]);
  useEffect(() => setPage(0), [term, filters, from, to, archived, sort]);

  const params: CorpListParams = {
    kind: kind.kind,
    q: term || undefined,
    filters,
    from: from || undefined,
    to: to || undefined,
    archived,
    sort: sort?.key,
    dir: sort?.dir,
    offset: page * PAGE,
    limit: PAGE,
  };
  const { data, error, isFetching, refetch } = useCorpList(params);

  const filterFields = kind.fields.filter((f) => f.filter);
  const boolComputed = (kind.computed ?? []).filter((c) => c.type === "bool");
  const active = Object.values(filters).filter(Boolean).length + (from ? 1 : 0) + (to ? 1 : 0) + (term ? 1 : 0);

  const headerBtn = (key: string, label: string) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 uppercase hover:text-text"
      onClick={() => setSort((s) => (s?.key === key ? (s.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }))}
    >
      {label}
      {sort?.key === key && (sort.dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
    </button>
  );

  const listFields = kind.fields.filter((f) => f.list);
  const listComputed = (kind.computed ?? []).filter((c) => c.type !== "bool");
  const columns: Column<CorpRow>[] = [
    ...listFields.map((f, i) => ({
      key: f.key,
      header: headerBtn(f.key, fieldLabel(f)),
      hideSm: i >= 3,
      cell: (r: CorpRow) =>
        i === 0 && f.type !== "ref" && f.type !== "select" ? (
          <span className="font-medium">
            <FieldValue field={f} row={r} />
          </span>
        ) : (
          <FieldValue field={f} row={r} onRef={(k, id) => onOpen({ kind: k, id })} />
        ),
    })),
    ...listComputed.map((c) => ({
      key: c.key,
      header: headerBtn(c.key, fieldLabel(c)),
      cell: (r: CorpRow) => <ComputedValue kind={kind} field={c} row={r} />,
    })),
    {
      key: "files",
      header: t("corp.col.files"),
      hideSm: true,
      cell: (r: CorpRow) => (r.files.length ? <Badge tone="neutral">📎 {r.files.length}</Badge> : <span className="text-muted">—</span>),
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      cell: (r: CorpRow) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="size-8" title={t("corp.view")} onClick={() => onOpen({ kind: kind.kind, id: r.id })}>
            <Eye className="size-4" />
          </Button>
          {!r.archived && (
            <Button size="icon" variant="ghost" className="size-8" title={t("corp.edit")} onClick={() => setEditing(r)}>
              <Pencil className="size-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchCorpAll({ ...params, offset: 0 });
      if (!all.rows.length) return toast.info(t("table.empty"));
      downloadCsv(`${kind.kind}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(kind, all.rows));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const total = data?.total ?? 0;
  const totals = Object.entries(data?.totals ?? {}).filter(([, v]) => v > 0);
  const label = (key: string) => {
    const f = [...kind.fields, ...(kind.computed ?? [])].find((x) => x.key === key);
    return f ? fieldLabel(f) : tMaybe(`corp.f.${key}`, key);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <Input icon={<Search className="size-4" />} value={q} placeholder={t("corp.search")} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filterFields.map((f) => (
          <Filter key={f.key} field={f} value={filters[f.key] ?? ""} onChange={(v) => setFilters((x) => ({ ...x, [f.key]: v }))} />
        ))}
        {boolComputed.map((c) => (
          <label key={c.key} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium">
            <Toggle size="sm" checked={filters[c.key] === "true"} onChange={(v) => setFilters((x) => ({ ...x, [c.key]: v ? "true" : "" }))} />
            {t("corp.filter.only", { field: fieldLabel(c) })}
          </label>
        ))}
        {kind.dateField && (
          <div className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span>{label(kind.dateField)}</span>
            <Input type="date" className="w-38" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("corp.filter.from")} />
            <span>–</span>
            <Input type="date" className="w-38" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("corp.filter.to")} />
          </div>
        )}
        <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium">
          <Toggle size="sm" checked={archived} onChange={setArchived} />
          {t("corp.filter.archived")}
        </label>
        {active > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQ("");
              setFilters({});
              setFrom("");
              setTo("");
            }}
          >
            {t("act.clear")}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" icon={<Download className="size-3.5" />} loading={exporting} onClick={exportCsv}>
            {t("act.exportCsv")}
          </Button>
          {!archived && (
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
              {t("corp.form.new", { name: kindSingular(kind) })}
            </Button>
          )}
        </div>
      </div>

      {totals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {totals.map(([k, v]) => (
            <span key={k} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
              <span className="text-muted">{t("corp.totalOf", { field: label(k) })}: </span>
              <span className="font-semibold tabular">{k === "shares" ? num(v) : money(v)}</span>
            </span>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={!data}
          onRowClick={(r) => onOpen({ kind: kind.kind, id: r.id })}
          empty={
            <EmptyState
              title={archived ? t("corp.emptyArchived") : active ? t("corp.emptyFiltered") : t("corp.empty", { name: kindLabel(kind) })}
              action={
                !archived &&
                !active && (
                  <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
                    {t("corp.form.new", { name: kindSingular(kind) })}
                  </Button>
                )
              }
            />
          }
          footer={
            total > 0 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted">
                <span className="tabular">
                  {t("corp.pageOf", { from: num(page * PAGE + 1), to: num(Math.min(total, (page + 1) * PAGE)), total: num(total) })}
                  {isFetching && " …"}
                </span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="size-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)} title={t("corp.prev")}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} title={t("corp.next")}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )
          }
        />
      )}

      <RecordForm open={adding} onClose={() => setAdding(false)} kind={kind} schema={schema} onSaved={(id) => onOpen({ kind: kind.kind, id })} />
      {editing && <RecordForm open onClose={() => setEditing(null)} kind={kind} schema={schema} row={editing} />}
    </div>
  );
}

/** Company Profile — ekach record; navin asel tar Settings → Company madhun bharun. */
function CompanyView({ kind, schema }: { kind: CorpKind; schema: CorpSchema }) {
  const q = useCorpRecord(kind.kind, "");
  const settings = useCompany();
  const [editing, setEditing] = useState(false);
  const row = q.data?.record ?? null;

  const preset = useMemo(
    () =>
      settings
        ? {
            name: settings.name,
            pan: settings.pan,
            gstin: settings.gstin,
            email: settings.email,
            phone: settings.phone,
            website: settings.website,
            registeredAddress: [settings.address, settings.city, settings.state, settings.pincode, settings.country].filter(Boolean).join(", "),
          }
        : undefined,
    [settings],
  );

  if (q.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <>
      {!row ? (
        <Card>
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={t("corp.company.empty")}
            description={t("corp.company.emptyHint")}
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(true)}>
                {t("corp.company.setup")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                {t("corp.edit")}
              </Button>
            </div>
            <Details kind={kind} row={row} />
          </div>
          <div className="space-y-4">
            <Files kind={kind.kind} row={row} />
            <Card>
              <CardHeader title={t("corp.tab.history")} subtitle={t("corp.company.historyHint")} />
              <div className="max-h-[32rem] overflow-y-auto px-5 pt-1 pb-5">
                <HistoryList items={q.data?.history ?? []} schema={schema} />
              </div>
            </Card>
          </div>
        </div>
      )}
      <RecordForm open={editing} onClose={() => setEditing(false)} kind={kind} schema={schema} row={row} preset={row ? undefined : preset} />
    </>
  );
}

/** `/corporate/:section` — ekhada section (Directors, Shareholders …), kinds = tabs. */
export function CorporateSection() {
  const { section: key } = useParams();
  const [params, setParams] = useSearchParams();
  const s = useSchema();
  const section = s.section(key);

  const open = params.get("open");
  const target: Target | null = open && open.includes(":") ? { kind: open.split(":")[0], id: open.split(":")[1] } : null;
  const setTarget = (tg: Target | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (tg) n.set("open", `${tg.kind}:${tg.id}`);
        else n.delete("open");
        return n;
      },
      { replace: !tg },
    );

  if (s.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (s.error) return <ErrorState error={s.error} onRetry={() => s.refetch()} />;
  if (!section || !s.schema) return <Navigate to="/corporate" replace />;

  const kinds = section.kinds.map((k) => s.kind(k)!).filter(Boolean);
  const tab = kinds.find((k) => k.kind === params.get("tab")) ?? kinds[0];

  return (
    <>
      <PageHeader title={sectionLabel(section)} description={tMaybe(`corp.sd.${section.key}`, "")} />
      {kinds.length > 1 && (
        <Segmented
          className="mb-4"
          value={tab.kind}
          onChange={(v) =>
            setParams(
              (p) => {
                const n = new URLSearchParams(p);
                n.set("tab", v);
                return n;
              },
              { replace: true },
            )
          }
          options={kinds.map((k) => ({ value: k.kind, label: kindLabel(k) }))}
        />
      )}
      {tab.singleton ? <CompanyView kind={tab} schema={s.schema} /> : <KindList kind={tab} schema={s.schema} onOpen={setTarget} />}
      <RecordDrawer target={target} schema={s.schema} onClose={() => setTarget(null)} />
    </>
  );
}
