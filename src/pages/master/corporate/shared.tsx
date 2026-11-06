import { Archive, ArchiveRestore, Eye, FilePlus2, FileX2, Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";

import {
  fieldLabel,
  kindSingular,
  optionLabel,
  useCorpSchema,
  type CorpField,
  type CorpHistoryItem,
  type CorpKind,
  type CorpRow,
  type CorpSchema,
} from "@/api/corporate";
import { Avatar, Badge, type Tone } from "@/components/ui/primitives";
import { t, type MsgKey } from "@/i18n";
import { ago, date, dateTime, money, num } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Schema + lookups (kind / section). */
export function useSchema() {
  const q = useCorpSchema();
  const schema = q.data;
  return {
    ...q,
    schema,
    kind: (k: string | undefined) => schema?.kinds.find((x) => x.kind === k),
    section: (s: string | undefined) => schema?.sections.find((x) => x.key === s),
  };
}

/** "2026-03-31" → Date (local, timezone shift nako). */
export const ymd = (s: unknown) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const STATUS_TONE: Record<string, Tone> = {
  active: "green",
  completed: "green",
  passed: "green",
  held: "green",
  filed: "green",
  received: "green",
  signed: "green",
  pending: "amber",
  scheduled: "blue",
  proposed: "blue",
  prospect: "blue",
  draft: "neutral",
  adjourned: "amber",
  objected: "amber",
  resigned: "neutral",
  inactive: "neutral",
  exited: "neutral",
  withdrawn: "neutral",
  notApplicable: "neutral",
  transferred: "neutral",
  abandoned: "neutral",
  expired: "red",
  disqualified: "red",
  rejected: "red",
  cancelled: "red",
  refunded: "red",
  terminated: "red",
};

/** Status sarkhe select — rang; baki select sadha badge. */
export function OptionBadge({ field, value }: { field: CorpField; value: unknown }) {
  if (value == null || value === "") return <span className="text-muted">—</span>;
  const tone = field.key.toLowerCase().includes("status") ? (STATUS_TONE[String(value)] ?? "neutral") : "neutral";
  return <Badge tone={tone}>{optionLabel(field, value)}</Badge>;
}

/** Field cha vachanya-yogya text (CSV, history). */
export function plainValue(field: { type: string; options?: CorpField["options"]; key: string }, value: unknown, refTitle?: string): string {
  if (value == null || value === "") return "";
  switch (field.type) {
    case "money":
      return money(Number(value));
    case "percent":
      return `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
    case "number":
      return num(Number(value));
    case "date":
      return date(ymd(value));
    case "bool":
      return value === true ? t("word.yes") : t("word.no");
    case "select":
      return optionLabel(field, value);
    case "ref":
      return refTitle ?? String(value);
    default:
      return String(value);
  }
}

/** Table / detail madhla value. `onRef` = ref var click (to record ughadto). */
export function FieldValue({
  field,
  row,
  onRef,
  full,
}: {
  field: CorpField | { key: string; label: string; type: CorpField["type"] };
  row: CorpRow;
  onRef?: (kind: string, id: string) => void;
  full?: boolean;
}) {
  const v = row[field.key];
  if (v == null || v === "") return <span className="text-muted">—</span>;
  const f = field as CorpField;
  switch (f.type) {
    case "select":
      return <OptionBadge field={f} value={v} />;
    case "bool":
      return <Badge tone={v ? "green" : "neutral"}>{v ? t("word.yes") : t("word.no")}</Badge>;
    case "ref": {
      const title = row._refs?.[f.key] ?? String(v);
      return onRef && f.ref ? (
        <button
          type="button"
          className="text-left font-medium text-accent hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onRef(f.ref!, String(v));
          }}
        >
          {title}
        </button>
      ) : (
        <span>{title}</span>
      );
    }
    case "email":
      return (
        <a className="text-accent hover:underline" href={`mailto:${v}`} onClick={(e) => e.stopPropagation()}>
          {String(v)}
        </a>
      );
    case "url":
      return (
        <a className="break-all text-accent hover:underline" href={String(v)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
          {String(v).replace(/^https?:\/\//, "")}
        </a>
      );
    case "textarea":
      return <span className={cn("whitespace-pre-wrap", !full && "line-clamp-2")}>{String(v)}</span>;
    case "money":
    case "number":
    case "percent":
      return <span className="tabular">{plainValue(f, v)}</span>;
    case "text":
      return <span className={cn(f.pattern && "font-mono text-xs")}>{String(v)}</span>;
    default:
      return <span>{plainValue(f, v)}</span>;
  }
}

/** Computed fields — compliance overdue / days left la vishesh rang. */
export function ComputedValue({ kind, field, row }: { kind: CorpKind; field: { key: string; label: string; type: CorpField["type"] }; row: CorpRow }) {
  const v = row[field.key];
  if (field.key === "overdue") return v ? <Badge tone="red">{t("corp.overdue")}</Badge> : <span className="text-muted">—</span>;
  if ((field.key === "daysLeft" || field.key === "daysToRenewal") && typeof v === "number") {
    if (kind.kind === "compliance" && row.status !== "pending") return <span className="text-muted">—</span>;
    return <DaysBadge days={v} />;
  }
  return <FieldValue field={field} row={row} />;
}

export function DaysBadge({ days }: { days: number }) {
  if (days < 0) return <Badge tone="red">{t("corp.daysAgo", { n: -days })}</Badge>;
  if (days === 0) return <Badge tone="red">{t("corp.today")}</Badge>;
  return <Badge tone={days <= 7 ? "amber" : days <= 30 ? "blue" : "neutral"}>{t("corp.daysLeft", { n: days })}</Badge>;
}

// ── Form validation (server `corporate.ts` sobat same) ───────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{6,20}$/;

export function validate(f: CorpField, v: unknown, schema: CorpSchema): string | null {
  const empty = v == null || (typeof v === "string" && v.trim() === "");
  if (empty) return f.required && f.type !== "bool" ? t("corp.err.required") : null;
  const s = typeof v === "string" ? v.trim() : v;
  switch (f.type) {
    case "text":
    case "textarea":
      if (String(s).length > (f.max ?? (f.type === "text" ? 200 : 5000))) return t("corp.err.tooLong", { n: f.max ?? (f.type === "text" ? 200 : 5000) });
      if (f.pattern && !new RegExp(schema.patterns[f.pattern]).test(String(s).toUpperCase().replace(/\s+/g, ""))) return t("corp.err.format", { example: f.hint ?? patternExample(f.pattern) });
      return null;
    case "email":
      return EMAIL.test(String(s)) ? null : t("core.err.badEmail");
    case "phone":
      return PHONE.test(String(s)) ? null : t("corp.err.phone");
    case "url":
      return /^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i.test(String(s)) ? null : t("corp.err.url");
    case "number":
    case "money":
    case "percent": {
      const n = Number(String(s).replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) return t("corp.err.number");
      if (f.type === "percent" && n > 100) return t("corp.err.percent");
      return null;
    }
    default:
      return null;
  }
}

const EXAMPLES: Record<string, string> = { pan: "AAAAA0000A", tan: "AAAA00000A", gstin: "27AAAAA0000A1Z5", cin: "U72900MH2020PTC123456", din: "01234567" };
export const patternExample = (p: string) => EXAMPLES[p] ?? "";

/**
 * Prakar-nihay disnare fields — share transaction madhe allotment la "From" nako,
 * buy-back la "To" nako (server pan hech kadhto).
 */
export function isVisible(kind: string, field: CorpField, form: Record<string, unknown>): boolean {
  if (kind === "shareTxns") {
    const type = String(form.type ?? "");
    if (field.key === "fromHolder") return ["transfer", "transmission", "buyback"].includes(type);
    if (field.key === "toHolder") return type !== "buyback";
  }
  if (kind === "compliance" && (field.key === "filedDate" || field.key === "srn")) return form.status === "filed";
  if (kind === "directors" && field.key === "resignationDate") return form.status !== "active" || !!form.resignationDate;
  if (kind === "resolutions" && field.key === "filingRef") return form.filingRequired === true;
  return true;
}

// ── History ──────────────────────────────────────────────────────────

const ACTION_META: Record<CorpHistoryItem["action"], { icon: ReactNode; tone: string; label: MsgKey }> = {
  create: { icon: <Plus className="size-3.5" />, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "corp.act.create" },
  update: { icon: <Pencil className="size-3.5" />, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400", label: "corp.act.update" },
  archive: { icon: <Archive className="size-3.5" />, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400", label: "corp.act.archive" },
  restore: { icon: <ArchiveRestore className="size-3.5" />, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400", label: "corp.act.restore" },
  fileAdd: { icon: <FilePlus2 className="size-3.5" />, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "corp.act.fileAdd" },
  fileRemove: { icon: <FileX2 className="size-3.5" />, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400", label: "corp.act.fileRemove" },
  fileView: { icon: <Eye className="size-3.5" />, tone: "bg-surface-2 text-muted", label: "corp.act.fileView" },
};
export const HISTORY_ACTIONS = Object.keys(ACTION_META) as CorpHistoryItem["action"][];
export const actionLabel = (a: CorpHistoryItem["action"]) => t(ACTION_META[a]?.label ?? "corp.act.update");

/** Badalachi yadi — konta field, juna → navin. */
export function HistoryList({
  items,
  schema,
  showRecord,
  onOpen,
}: {
  items: CorpHistoryItem[];
  schema: CorpSchema;
  showRecord?: boolean;
  onOpen?: (kind: string, id: string) => void;
}) {
  if (!items.length) return <p className="py-6 text-center text-xs text-muted">{t("corp.history.empty")}</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((h) => {
        const meta = ACTION_META[h.action] ?? ACTION_META.update;
        const def = schema.kinds.find((k) => k.kind === h.kind);
        return (
          <li key={h.id} className="relative">
            <span className={cn("absolute top-0 -left-[31px] flex size-5 items-center justify-center rounded-full ring-4 ring-bg", meta.tone)}>{meta.icon}</span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <Avatar name={h.byName || h.byEmail} seed={h.by} size="sm" />
              <span className="font-semibold">{h.byName || h.byEmail}</span>
              <span className="text-muted">{actionLabel(h.action)}</span>
              {showRecord && def && (
                <>
                  <span className="text-muted">·</span>
                  <Badge tone="neutral">{kindSingular(def)}</Badge>
                  <button
                    type="button"
                    disabled={!onOpen || h.action === "archive"}
                    className="font-medium text-accent enabled:hover:underline disabled:text-text"
                    onClick={() => onOpen?.(h.kind, h.recordId)}
                  >
                    {h.recordTitle}
                  </button>
                </>
              )}
              <span className="ml-auto text-muted" title={dateTime(h.at ? new Date(h.at) : null)}>
                {ago(h.at ? new Date(h.at) : null)}
              </span>
            </div>
            {h.file && <p className="mt-1 text-xs text-muted">📎 {h.file.name}</p>}
            {h.reason && h.reason !== "recurrence" && <p className="mt-1 text-xs text-muted">“{h.reason}”</p>}
            {h.reason === "recurrence" && <p className="mt-1 text-xs text-muted">{t("corp.history.recurrence")}</p>}
            {h.changes?.length > 0 && def && (
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border">
                    {h.changes.map((c) => {
                      const f = def.fields.find((x) => x.key === c.field);
                      if (!f) return null;
                      return (
                        <tr key={c.field}>
                          <td className="w-1/3 bg-surface-2/50 px-2.5 py-1.5 font-medium">{fieldLabel(f)}</td>
                          {h.action === "update" && (
                            <td className="px-2.5 py-1.5 text-muted line-through decoration-rose-400/60">
                              <Clip>{plainValue(f, c.from) || "—"}</Clip>
                            </td>
                          )}
                          <td className="px-2.5 py-1.5">
                            <Clip>{plainValue(f, c.to) || "—"}</Clip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const Clip = ({ children }: { children: string }) => (
  <span className="line-clamp-3 break-words whitespace-pre-wrap" title={children.length > 120 ? children : undefined}>
    {f(children)}
  </span>
);
const f = (s: string) => (s.length > 400 ? s.slice(0, 400) + "…" : s);

export const fileSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
