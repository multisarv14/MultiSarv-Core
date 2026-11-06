import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBlob, ref, uploadBytes } from "firebase/storage";

import { getLang, t, tMaybe } from "@/i18n";
import { callCore, core, errorMessage } from "@/lib/firebase";

/**
 * Corporate Affairs — fakt super admin. Sagle reads / writes core `corp*` callables madhun
 * (Firestore rules client la `corp_*` detch nahit). Schema server deto (`corporateSchema.ts`) —
 * forms, tables ani phone app ekach definition vachtat.
 */

export type CorpFieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "percent"
  | "date"
  | "select"
  | "email"
  | "phone"
  | "url"
  | "ref"
  | "bool";

export interface CorpOption {
  value: string;
  label: string;
}

export interface CorpField {
  key: string;
  label: string;
  type: CorpFieldType;
  required?: boolean;
  options?: CorpOption[];
  ref?: string;
  pattern?: string;
  list?: boolean;
  filter?: boolean;
  max?: number;
  hint?: string;
}

export interface CorpKind {
  kind: string;
  section: string;
  label: string;
  singular: string;
  titleField: string;
  sortField: string;
  dateField?: string;
  singleton?: boolean;
  computed?: { key: string; label: string; type: CorpFieldType }[];
  fields: CorpField[];
}

export interface CorpSection {
  key: string;
  label: string;
  kinds: string[];
}

export interface CorpSchema {
  sections: CorpSection[];
  kinds: CorpKind[];
  patterns: Record<string, string>;
}

export interface CorpFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: number | null;
  byName: string;
}

/** Server row — fields + `_title`, `_refs` (ref che naav), computed, meta. */
export type CorpRow = Record<string, unknown> & {
  id: string;
  _title: string;
  _refs: Record<string, string>;
  files: CorpFile[];
  archived?: boolean;
  createdAt: number | null;
  updatedAt: number | null;
  createdByName?: string;
  updatedByName?: string;
  archiveReason?: string | null;
};

export interface CorpChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface CorpHistoryItem {
  id: string;
  kind: string;
  section: string;
  recordId: string;
  recordTitle: string;
  action: "create" | "update" | "archive" | "restore" | "fileAdd" | "fileRemove" | "fileView";
  changes: CorpChange[];
  reason: string | null;
  file: { name: string; size: number; type: string } | null;
  by: string;
  byName: string;
  byEmail: string;
  at: number | null;
}

export interface CorpListParams {
  kind: string;
  q?: string;
  filters?: Record<string, string>;
  from?: string;
  to?: string;
  archived?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

export interface CorpListResult {
  rows: CorpRow[];
  total: number;
  offset: number;
  totals: Record<string, number>;
}

export interface CorpRecordResult {
  record: CorpRow | null;
  history: CorpHistoryItem[];
  related: { kind: string; field: string; rows: CorpRow[] }[];
}

// ── Labels ───────────────────────────────────────────────────────────
// English = server cha label (field-nihay, "Investor name"); itar bhasha = key-nihay
// bhashantar (`corp.f.name`) — nasel tar server cha English.

const local = (key: string, en: string) => (getLang() === "en" ? en : tMaybe(key, en));

export const kindLabel = (k: CorpKind) => local(`corp.k.${k.kind}`, k.label);
export const kindSingular = (k: CorpKind) => local(`corp.k1.${k.kind}`, k.singular);
export const sectionLabel = (s: CorpSection) => local(`corp.s.${s.key}`, s.label);
export const fieldLabel = (f: { key: string; label: string }) => local(`corp.f.${f.key}`, f.label);
export const optionLabel = (f: Pick<CorpField, "options">, v: unknown) => {
  const o = f.options?.find((x) => x.value === v);
  return o ? local(`corp.o.${o.value}`, o.label) : String(v ?? "");
};

/** Server `corpBadField` (details.field) → "PAN: tapasa". */
export function corpError(err: unknown, kind?: CorpKind): string {
  const field = (err as { details?: { field?: string } })?.details?.field;
  if (field && kind) {
    const f = kind.fields.find((x) => x.key === field);
    if (f) return t("corp.err.field", { field: fieldLabel(f) });
  }
  return errorMessage(err);
}

// ── Queries ──────────────────────────────────────────────────────────

const KEY = "corp";

export function useCorpSchema() {
  return useQuery({
    queryKey: [KEY, "schema"],
    queryFn: () => callCore<CorpSchema>("corpSchema", {}),
    staleTime: Infinity,
  });
}

export function useCorpList(params: CorpListParams) {
  return useQuery({
    queryKey: [KEY, "list", params],
    queryFn: () => callCore<CorpListResult>("corpList", { ...params }),
    placeholderData: keepPreviousData,
  });
}

/** CSV export — filter lavlele sagle rows. */
export const fetchCorpAll = (params: CorpListParams) => callCore<CorpListResult>("corpList", { ...params, all: true });

export function useCorpRecord(kind: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: [KEY, "record", kind, id],
    queryFn: () => callCore<CorpRecordResult>("corpGet", { kind, id }),
    enabled: !!kind && (!!id || id === ""),
  });
}

export function useCorpOptions(kind: string | undefined) {
  return useQuery({
    queryKey: [KEY, "options", kind],
    queryFn: () => callCore<{ id: string; title: string }[]>("corpOptions", { kind }),
    enabled: !!kind,
  });
}

export interface CorpReport {
  today: string;
  fyStart: string;
  company: { name: string; cin: string; incorporationDate: string | null } | null;
  counts: Record<"directors" | "shareholders" | "investors" | "documents" | "meetings" | "assets", number>;
  capTable: {
    totalShares: number;
    classTotals: Record<string, number>;
    rows: { id: string; _title: string; name: string; holderType: string; shares: number; percent: number; invested: number; byClass: Record<string, number> }[];
  };
  shareHistory: { id: string; _title: string; type: string; date: string; shares: number; shareClass: string; amount: number | null; _refs: Record<string, string> }[];
  capital: { latest: CorpRow | null; history: Record<string, unknown>[] };
  valuation: { latest: CorpRow | null; series: { date: string; valuation: number; pricePerShare: number | null }[] };
  investors: { commitment: number; received: number; pending: number; byInstrument: Record<string, number> };
  compliance: {
    overdue: { id: string; _title: string; form: string | null; authority: string; dueDate: string; daysLeft: number }[];
    upcoming: { id: string; _title: string; form: string | null; authority: string; dueDate: string; daysLeft: number }[];
    pending: number;
    filedThisFy: number;
  };
  directors: { kycDue: { id: string; _title: string; name: string; din: string | null; kycStatus: string | null }[] };
  renewals: { kind: string; id: string; _title: string; date: string; days: number; type: string }[];
  relatedParty: { fyTotal: number; byNature: Record<string, number>; count: number };
  recent: CorpHistoryItem[];
}

export function useCorpReport() {
  return useQuery({ queryKey: [KEY, "report"], queryFn: () => callCore<CorpReport>("corpReport", {}) });
}

export interface CorpHistoryParams {
  kind?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}

export function useCorpHistory(params: CorpHistoryParams) {
  return useQuery({
    queryKey: [KEY, "history", params],
    queryFn: () => callCore<{ rows: CorpHistoryItem[]; total: number; offset: number }>("corpHistory", { ...params }),
    placeholderData: keepPreviousData,
  });
}

/** Kontyahi badal nantar — list, record, report, history sagle taje. */
export function useCorpRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY], predicate: (q) => q.queryKey[1] !== "schema" });
}

// ── Mutations ────────────────────────────────────────────────────────

export const saveCorpRecord = (kind: string, id: string | null, data: Record<string, unknown>) =>
  callCore<{ id: string; changed: boolean; nextId?: string | null }>("corpSave", { kind, id, data });

export const archiveCorpRecord = (kind: string, id: string, archived: boolean, reason = "") =>
  callCore("corpArchive", { kind, id, archived, reason });

/** Storage rules sobat same (25 MB, documents / images). */
export const CORP_MAX_FILE = 25 * 1024 * 1024;
export const CORP_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";

export async function uploadCorpFile(kind: string, id: string, file: File) {
  if (file.size > CORP_MAX_FILE) throw new Error(t("corp.file.tooBig"));
  const safe = file.name.replace(/[^\w.\-() ]+/g, "_").slice(-120);
  const path = `corporate/${kind}/${id}/${Date.now()}-${safe}`;
  await uploadBytes(ref(core().storage, path), file, { contentType: file.type || "application/octet-stream" });
  return callCore("corpAttach", { kind, id, path, name: file.name });
}

export const removeCorpFile = (kind: string, id: string, fileId: string) => callCore("corpDetach", { kind, id, fileId });

/**
 * Ughadne / download — adhi `corpFileOpen` (audit), mag Storage (rules: fakt super admin).
 * Public download URL (token) vaparat nahi, mhanun link baher gela tari chalat nahi.
 */
export async function openCorpFile(kind: string, id: string, file: CorpFile, download = false) {
  const meta = await callCore<{ path: string; name: string; type: string }>("corpFileOpen", { kind, id, fileId: file.id });
  const blob = await getBlob(ref(core().storage, meta.path));
  const url = URL.createObjectURL(new Blob([blob], { type: meta.type }));
  if (download || !/^(application\/pdf|image\/|text\/)/.test(meta.type)) {
    const a = Object.assign(document.createElement("a"), { href: url, download: meta.name });
    a.click();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
