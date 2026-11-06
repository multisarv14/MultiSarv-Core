import { AlertTriangle, BadgeIndianRupee, CalendarClock, ChevronLeft, ChevronRight, Download, Landmark, PieChart, ScrollText, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fieldLabel, kindLabel, optionLabel, useCorpHistory, useCorpReport, type CorpHistoryItem, type CorpSchema } from "@/api/corporate";
import { ErrorState, PageHeader, StatCard } from "@/components/ui/data";
import { Badge, Button, Card, CardHeader, Input, Segmented, Select, Skeleton } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { date, dateTime, money, moneyCompact, num } from "@/lib/format";
import { downloadCsv } from "@/lib/utils";

import { actionLabel, DaysBadge, HISTORY_ACTIONS, HistoryList, useSchema, ymd } from "./shared";

/** Kind + id → tya section cha page, drawer ughda. */
function useOpen(schema: CorpSchema | undefined) {
  const navigate = useNavigate();
  return (kind: string, id: string) => {
    const k = schema?.kinds.find((x) => x.kind === kind);
    if (!k) return;
    const s = schema!.sections.find((x) => x.kinds.includes(kind))!;
    navigate(`/corporate/${s.key}?tab=${kind}&open=${kind}:${id}`);
  };
}

function ListCard({ title, icon, empty, children, action }: { title: string; icon: React.ReactNode; empty: boolean; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="animate-rise">
      <CardHeader title={<span className="inline-flex items-center gap-2">{icon} {title}</span>} action={action} />
      {empty ? <p className="px-5 pb-5 text-xs text-muted">{t("corp.report.nothing")}</p> : <ul className="divide-y divide-border border-t border-border">{children}</ul>}
    </Card>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition hover:bg-surface-2/60">
        {children}
      </button>
    </li>
  );
}

function Report({ schema }: { schema: CorpSchema }) {
  const { data, error, refetch, isLoading } = useCorpReport();
  const open = useOpen(schema);
  const navigate = useNavigate();
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-[36rem] rounded-2xl" />;

  const kind = (k: string) => schema.kinds.find((x) => x.kind === k)!;
  const field = (k: string, f: string) => kind(k).fields.find((x) => x.key === f)!;
  const cap = data.capital.latest;
  const val = data.valuation.latest;

  const exportCapTable = () =>
    downloadCsv(
      `cap-table-${data.today}.csv`,
      data.capTable.rows.map((r) => ({
        [fieldLabel(field("shareholders", "name"))]: r.name,
        [fieldLabel(field("shareholders", "holderType"))]: optionLabel(field("shareholders", "holderType"), r.holderType),
        ...Object.fromEntries(Object.keys(data.capTable.classTotals).map((c) => [optionLabel(field("shareTxns", "shareClass"), c), r.byClass[c] ?? 0])),
        [t("corp.f.shares")]: r.shares,
        [t("corp.f.percent")]: r.percent,
        [t("corp.f.invested")]: r.invested,
      })),
    );

  return (
    <div className="space-y-4">
      {data.company && (
        <Card className="animate-rise flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4">
          <p className="text-base font-semibold">{data.company.name}</p>
          {data.company.cin && <span className="font-mono text-xs text-muted">CIN {data.company.cin}</span>}
          {data.company.incorporationDate && <span className="text-xs text-muted">{t("corp.report.since", { date: date(ymd(data.company.incorporationDate)) })}</span>}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard index={0} label={t("corp.report.directors")} value={num(data.counts.directors)} icon={<Users className="size-4" />} onClick={() => navigate("/corporate/directors")} />
        <StatCard
          index={1}
          label={t("corp.report.paidUp")}
          value={cap ? moneyCompact(Number(cap.paidUpCapital)) : "—"}
          hint={cap ? t("corp.report.ofAuthorized", { amount: moneyCompact(Number(cap.authorizedCapital)) }) : undefined}
          icon={<Landmark className="size-4" />}
          tone="blue"
          onClick={() => navigate("/corporate/capital")}
        />
        <StatCard
          index={2}
          label={t("corp.report.valuation")}
          value={val ? moneyCompact(Number(val.valuation)) : "—"}
          hint={val ? date(ymd(val.date)) : undefined}
          spark={data.valuation.series.length > 1 ? data.valuation.series.map((v) => Number(v.valuation)) : undefined}
          icon={<TrendingUp className="size-4" />}
          tone="violet"
          onClick={() => navigate("/corporate/capital?tab=valuations")}
        />
        <StatCard
          index={3}
          label={t("corp.report.overdue")}
          value={num(data.compliance.overdue.length)}
          hint={t("corp.report.pendingFiled", { pending: data.compliance.pending, filed: data.compliance.filedThisFy })}
          icon={<AlertTriangle className="size-4" />}
          tone={data.compliance.overdue.length ? "red" : "green"}
          onClick={() => navigate("/corporate/compliance")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("corp.report.committed")} value={money(data.investors.commitment)} icon={<BadgeIndianRupee className="size-4" />} hint={t("corp.report.activeInvestors", { n: data.counts.investors })} />
        <StatCard label={t("corp.report.received")} value={money(data.investors.received)} icon={<BadgeIndianRupee className="size-4" />} tone="green" />
        <StatCard label={t("corp.report.pendingAmt")} value={money(data.investors.pending)} icon={<BadgeIndianRupee className="size-4" />} tone="amber" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="animate-rise">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <PieChart className="size-4" /> {t("corp.report.capTable")}
              </span>
            }
            subtitle={t("corp.report.totalShares", { n: num(data.capTable.totalShares) })}
            action={
              data.capTable.rows.length > 0 && (
                <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportCapTable}>
                  CSV
                </Button>
              )
            }
          />
          {data.capTable.rows.length === 0 ? (
            <p className="px-5 pb-5 text-xs text-muted">{t("corp.report.noShares")}</p>
          ) : (
            <ul className="space-y-3 px-5 pb-5">
              {data.capTable.rows.map((r) => (
                <li key={r.id}>
                  <button type="button" className="w-full text-left" onClick={() => open("shareholders", r.id)}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted tabular">
                        {num(r.shares)} · <span className="font-semibold text-text">{r.percent.toFixed(2)}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(1, r.percent)}%` }} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <ListCard title={t("corp.report.complianceDue")} icon={<CalendarClock className="size-4" />} empty={!data.compliance.overdue.length && !data.compliance.upcoming.length}>
            {[...data.compliance.overdue, ...data.compliance.upcoming].slice(0, 10).map((c) => (
              <Row key={c.id} onClick={() => open("compliance", c.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c._title}</span>
                  <span className="text-xs text-muted">
                    {[c.form, optionLabel(field("compliance", "authority"), c.authority), date(ymd(c.dueDate))].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <DaysBadge days={c.daysLeft} />
              </Row>
            ))}
          </ListCard>

          <ListCard title={t("corp.report.renewals")} icon={<ShieldCheck className="size-4" />} empty={!data.renewals.length}>
            {data.renewals.slice(0, 10).map((r) => (
              <Row key={`${r.kind}${r.id}`} onClick={() => open(r.kind, r.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r._title}</span>
                  <span className="text-xs text-muted">
                    {kindLabel(kind(r.kind))} · {date(ymd(r.date))}
                  </span>
                </span>
                <DaysBadge days={r.days} />
              </Row>
            ))}
          </ListCard>

          <ListCard title={t("corp.report.kyc")} icon={<Users className="size-4" />} empty={!data.directors.kycDue.length}>
            {data.directors.kycDue.map((d) => (
              <Row key={d.id} onClick={() => open("directors", d.id)}>
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                {d.din && <span className="font-mono text-xs text-muted">{d.din}</span>}
                <Badge tone={d.kycStatus === "expired" ? "red" : "amber"}>{d.kycStatus ? optionLabel(field("directors", "kycStatus"), d.kycStatus) : t("corp.report.kycUnknown")}</Badge>
              </Row>
            ))}
          </ListCard>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ListCard title={t("corp.report.shareHistory")} icon={<ScrollText className="size-4" />} empty={!data.shareHistory.length}>
          {data.shareHistory.map((s) => (
            <Row key={s.id} onClick={() => open("shareTxns", s.id)}>
              <Badge tone={s.type === "transfer" || s.type === "transmission" ? "blue" : s.type === "buyback" ? "red" : "green"}>{optionLabel(field("shareTxns", "type"), s.type)}</Badge>
              <span className="min-w-0 flex-1 truncate text-xs">{[s._refs.fromHolder, s._refs.toHolder].filter(Boolean).join(" → ")}</span>
              <span className="shrink-0 text-xs text-muted tabular">
                {num(s.shares)} · {date(ymd(s.date))}
              </span>
            </Row>
          ))}
        </ListCard>

        <Card className="animate-rise">
          <CardHeader
            title={t("corp.report.rpt")}
            subtitle={t("corp.report.rptHint", { n: data.relatedParty.count, from: date(ymd(data.fyStart)) })}
            action={<span className="text-sm font-semibold tabular">{money(data.relatedParty.fyTotal)}</span>}
          />
          {Object.keys(data.relatedParty.byNature).length === 0 ? (
            <p className="px-5 pb-5 text-xs text-muted">{t("corp.report.nothing")}</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {Object.entries(data.relatedParty.byNature)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span>{optionLabel(field("rpTransactions", "nature"), k)}</span>
                    <span className="font-medium tabular">{money(v)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="animate-rise">
        <CardHeader title={t("corp.report.recent")} />
        <div className="px-5 pt-1 pb-5">
          <HistoryList items={data.recent} schema={schema} showRecord onOpen={open} />
        </div>
      </Card>
    </div>
  );
}

const AUDIT_PAGE = 30;

/** Sagle Corporate Affairs badal — filters, pages, CSV. */
function AuditLog({ schema }: { schema: CorpSchema }) {
  const [kind, setKind] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const params = { kind: kind || undefined, action: action || undefined, q: q.trim() || undefined, from: from || undefined, to: to || undefined };
  const { data, error, refetch, isFetching } = useCorpHistory({ ...params, offset: page * AUDIT_PAGE, limit: AUDIT_PAGE });
  const all = useCorpHistory({ ...params, offset: 0, limit: 500 });
  const open = useOpen(schema);
  const total = data?.total ?? 0;

  const exportCsv = () => {
    const kindName = (k: string) => {
      const d = schema.kinds.find((x) => x.kind === k);
      return d ? kindLabel(d) : k;
    };
    downloadCsv(
      `corporate-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      (all.data?.rows ?? []).map((h: CorpHistoryItem) => ({
        [t("corp.audit.when")]: h.at ? new Date(h.at) : "",
        [t("corp.audit.who")]: `${h.byName} <${h.byEmail}>`,
        [t("corp.audit.action")]: actionLabel(h.action),
        [t("corp.audit.type")]: kindName(h.kind),
        [t("corp.audit.record")]: h.recordTitle,
        [t("corp.audit.changes")]: h.changes.map((c) => c.field).join(", ") || h.file?.name || h.reason || "",
      })),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-56">
          <Input value={q} placeholder={t("corp.audit.search")} onChange={(e) => (setQ(e.target.value), setPage(0))} />
        </div>
        <Select className="w-48" value={kind} onChange={(e) => (setKind(e.target.value), setPage(0))}>
          <option value="">{t("corp.audit.allTypes")}</option>
          {schema.kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {kindLabel(k)}
            </option>
          ))}
        </Select>
        <Select className="w-40" value={action} onChange={(e) => (setAction(e.target.value), setPage(0))}>
          <option value="">{t("corp.audit.allActions")}</option>
          {HISTORY_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </Select>
        <Input type="date" className="w-38" value={from} onChange={(e) => (setFrom(e.target.value), setPage(0))} aria-label={t("corp.filter.from")} />
        <span className="text-xs text-muted">–</span>
        <Input type="date" className="w-38" value={to} onChange={(e) => (setTo(e.target.value), setPage(0))} aria-label={t("corp.filter.to")} />
        <Button size="sm" className="ml-auto" icon={<Download className="size-3.5" />} disabled={!all.data?.rows.length} onClick={exportCsv}>
          {t("act.exportCsv")}
        </Button>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Card className="p-5">
          {!data ? <Skeleton className="h-64" /> : <HistoryList items={data.rows} schema={schema} showRecord onOpen={open} />}
          {total > AUDIT_PAGE && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
              <span className="tabular">
                {t("corp.pageOf", { from: num(page * AUDIT_PAGE + 1), to: num(Math.min(total, (page + 1) * AUDIT_PAGE)), total: num(total) })}
                {isFetching && " …"}
              </span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="size-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" disabled={(page + 1) * AUDIT_PAGE >= total} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
      <p className="text-[11px] text-muted">{t("corp.audit.hint", { at: dateTime(new Date()) })}</p>
    </div>
  );
}

/** `/corporate` — reports (cap table, capital, compliance …) ani audit log. */
export function CorporateOverview() {
  const s = useSchema();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "audit" ? "audit" : "overview";
  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("master.nav.corporate")} <Badge tone="violet">{t("corp.confidential")}</Badge>
          </span>
        }
        description={t("corp.subtitle")}
        actions={
          <Segmented
            value={tab}
            onChange={(v) => setParams(v === "audit" ? { tab: "audit" } : {}, { replace: true })}
            options={[
              { value: "overview", label: t("corp.nav.overview") },
              { value: "audit", label: t("corp.audit.title") },
            ]}
          />
        }
      />
      {s.error ? <ErrorState error={s.error} onRetry={() => s.refetch()} /> : !s.schema ? <Skeleton className="h-96 rounded-2xl" /> : tab === "audit" ? <AuditLog schema={s.schema} /> : <Report schema={s.schema} />}
    </>
  );
}
