import {
  AlertTriangle,
  BellOff,
  BellRing,
  Briefcase,
  Building2,
  CheckCircle2,
  Download,
  FlaskConical,
  Globe2,
  Hash,
  Inbox,
  MapPin,
  Megaphone,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Tags,
  UserRound,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  watchBroadcast,
  type Audience,
  type Broadcast,
  type BroadcastStats,
  type BroadcastType,
  type DeliveryStatus,
  type NewTaskAudience,
  type NoticeText,
} from "@/api/notifications";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { CountUp, rise } from "@/components/ui/motion";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  Textarea,
  Toggle,
  type Tone,
} from "@/components/ui/primitives";
import { roleLabel } from "@/components/ui/status";
import { useProject } from "@/context/project";
import {
  useAudienceEstimate,
  useBroadcasts,
  useCategories,
  useNotificationSettings,
  useRecipients,
  useSendBroadcast,
  useUpdateNotificationSettings,
} from "@/hooks/queries";
import { LANGUAGES, t, useLang, type Lang, type MsgKey } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { ago, dateTime, num } from "@/lib/format";
import { enablePush, pushState, type PushState } from "@/lib/push";
import { cn, downloadCsv } from "@/lib/utils";

type Tab = "compose" | "history" | "auto";

// ── Shared bits ──────────────────────────────────────────────────────

const TITLE_MAX = 80;
const BODY_MAX = 500;

const parsePhones = (raw: string) => [
  ...new Set(
    raw
      .split(/[\s,;]+/)
      .map((p) => p.replace(/\D/g, "").slice(-10))
      .filter((p) => p.length === 10),
  ),
];

/** Status = state → reserved status rang + icon + label (rang ekta kadhich nahi). */
const DELIVERY: Record<DeliveryStatus, { tone: Tone; bar: string; icon: LucideIcon; label: MsgKey }> = {
  sent: { tone: "green", bar: "bg-emerald-500", icon: CheckCircle2, label: "notif.delivery.sent" },
  partial: { tone: "amber", bar: "bg-amber-500", icon: AlertTriangle, label: "notif.delivery.partial" },
  noToken: { tone: "neutral", bar: "bg-slate-400 dark:bg-slate-500", icon: Inbox, label: "notif.delivery.noToken" },
  failed: { tone: "red", bar: "bg-rose-500", icon: XCircle, label: "notif.delivery.failed" },
  error: { tone: "red", bar: "bg-rose-700", icon: XCircle, label: "notif.delivery.error" },
};
const DELIVERY_ORDER: DeliveryStatus[] = ["sent", "partial", "noToken", "failed", "error"];

function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const d = DELIVERY[status];
  return (
    <Badge tone={d.tone}>
      <d.icon className="size-3" />
      {t(d.label)}
    </Badge>
  );
}

/** Ekach stacked bar — pratyek segment madhe 2px gap, khali legend. */
function DeliveryBar({ stats, live, className }: { stats: BroadcastStats; live?: boolean; className?: string }) {
  const total = Math.max(1, stats.targeted);
  return (
    <div className={cn("flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-2", className)}>
      {DELIVERY_ORDER.map((k) =>
        stats[k] > 0 ? (
          <div
            key={k}
            title={`${t(DELIVERY[k].label)}: ${num(stats[k])}`}
            className={cn("h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full", DELIVERY[k].bar, live && "progress-stripes")}
            style={{ width: `${(stats[k] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

const pushReach = (s: BroadcastStats) => (s.targeted ? Math.round(((s.sent + s.partial) / s.targeted) * 100) : 0);

function audienceSummary(a: Audience, adminUid?: string): string {
  if (a.uids?.length) return a.uids.length === 1 && a.uids[0] === adminUid ? t("notif.audienceSummary.self") : `${a.uids.length}`;
  if (a.phones?.length) return t("notif.audienceSummary.phones", { n: a.phones.length });
  const plural: Record<string, MsgKey> = { customer: "role.customers", worker: "role.workers", business: "role.businesses" };
  const who = a.roles?.length ? a.roles.map((r) => t(plural[r])).join(" + ") : t("notif.audienceSummary.all");
  if (a.skill) return t("notif.audienceSummary.skill", { who, skill: a.skill });
  if (a.city) return t("notif.audienceSummary.city", { who, city: a.city });
  return who;
}

const TYPE_META: Record<BroadcastType, { tone: Tone; icon: LucideIcon; label: MsgKey }> = {
  announcement: { tone: "accent", icon: Megaphone, label: "notif.type.announcement" },
  newTask: { tone: "blue", icon: Briefcase, label: "notif.type.newTask" },
  test: { tone: "neutral", icon: FlaskConical, label: "notif.type.test" },
};

function TypeBadge({ type }: { type: BroadcastType }) {
  const m = TYPE_META[type] ?? TYPE_META.announcement;
  return (
    <Badge tone={m.tone}>
      <m.icon className="size-3" />
      {t(m.label)}
    </Badge>
  );
}

function StatusPill({ b }: { b: Broadcast }) {
  if (b.status === "done") return null;
  const tone: Tone = b.status === "failed" ? "red" : "amber";
  return (
    <Badge tone={tone} dot>
      {t(`notif.status.${b.status}`)}
    </Badge>
  );
}

/** Broadcast doc live (pathavtana stats chadhtat). */
function useLiveBroadcast(initial: Broadcast | null) {
  const { project } = useProject();
  const [live, setLive] = useState<Broadcast | null>(initial);
  useEffect(() => {
    setLive(initial);
    if (!initial) return;
    return watchBroadcast(project, initial.id, setLive);
  }, [project, initial]);
  return live;
}

// ── Page ─────────────────────────────────────────────────────────────

export function Notifications() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "compose";
  const [report, setReport] = useState<Broadcast | null>(null);

  const setTab = (v: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title={t("notif.title")}
        description={t("notif.subtitle")}
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "compose", label: t("notif.tab.compose") },
              { value: "history", label: t("notif.tab.history") },
              { value: "auto", label: t("notif.tab.auto") },
            ]}
          />
        }
      />
      <div key={tab} className="animate-rise">
        {tab === "compose" && <Compose onReport={setReport} />}
        {tab === "history" && <History onOpen={setReport} />}
        {tab === "auto" && <Automatic />}
      </div>
      <ReportDrawer broadcast={report} onClose={() => setReport(null)} />
    </>
  );
}

// ── Compose ──────────────────────────────────────────────────────────

type AudienceKind = "all" | "customer" | "worker" | "business" | "skill" | "city" | "phones";

const AUDIENCES: { kind: AudienceKind; icon: LucideIcon; label: () => string; hint: MsgKey }[] = [
  { kind: "all", icon: Globe2, label: () => t("notif.aud.all"), hint: "notif.aud.allHint" },
  { kind: "customer", icon: UserRound, label: () => t("role.customers"), hint: "notif.aud.customersHint" },
  { kind: "worker", icon: Briefcase, label: () => t("role.workers"), hint: "notif.aud.workersHint" },
  { kind: "business", icon: Building2, label: () => t("role.businesses"), hint: "notif.aud.businessesHint" },
  { kind: "skill", icon: Tags, label: () => t("notif.aud.skill"), hint: "notif.aud.skillHint" },
  { kind: "city", icon: MapPin, label: () => t("notif.aud.city"), hint: "notif.aud.cityHint" },
  { kind: "phones", icon: Phone, label: () => t("notif.aud.phones"), hint: "notif.aud.phonesHint" },
];

function Compose({ onReport }: { onReport: (b: Broadcast) => void }) {
  const { project, admin } = useProject();
  const [uiLang] = useLang();
  const [editLang, setEditLang] = useState<Lang>(uiLang);
  const [text, setText] = useState<Record<Lang, { title: string; body: string }>>({
    en: { title: "", body: "" },
    hi: { title: "", body: "" },
    mr: { title: "", body: "" },
    gu: { title: "", body: "" },
  });
  const [kind, setKind] = useState<AudienceKind>("all");
  const [skill, setSkill] = useState("");
  const [city, setCity] = useState("");
  const [phonesRaw, setPhonesRaw] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const categories = useCategories();
  const send = useSendBroadcast();

  const phones = useMemo(() => parsePhones(phonesRaw), [phonesRaw]);
  const audience = useMemo<Audience>(() => {
    switch (kind) {
      case "customer":
      case "worker":
      case "business":
        return { roles: [kind] };
      case "skill":
        return { roles: ["worker", "business"], skill: skill || null };
      case "city":
        return { city: city.trim() || null };
      case "phones":
        return { phones };
      default:
        return {};
    }
  }, [kind, skill, city, phones]);
  const audienceReady =
    (kind !== "skill" || !!skill) && (kind !== "city" || !!city.trim()) && (kind !== "phones" || phones.length > 0);
  const estimate = useAudienceEstimate(audience);

  const filled = (l: Lang) => text[l].title.trim().length >= 2 && text[l].body.trim().length >= 2;
  const payload: NoticeText = Object.fromEntries(
    LANGUAGES.filter((l) => filled(l.code)).map((l) => [l.code, { title: text[l.code].title.trim(), body: text[l.code].body.trim() }]),
  );
  const hasText = Object.keys(payload).length > 0;
  const preview = filled(editLang) ? text[editLang] : (payload.en ?? Object.values(payload)[0]);

  const set = (field: "title" | "body", v: string) =>
    setText((s) => ({ ...s, [editLang]: { ...s[editLang], [field]: v } }));

  const doSend = (test: boolean) => {
    if (!hasText) return toast.error(t("notif.send.needText"));
    if (!test && !audienceReady) return toast.error(t("notif.send.needAudience"));
    send.mutate(
      { text: payload, audience, test },
      {
        onSuccess: (r) => {
          setConfirm(false);
          if (!test) setSentId(r.id);
        },
      },
    );
  };

  const audienceText = audienceSummary(audience, admin.uid);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card className="animate-rise" style={rise(0)}>
          <CardHeader
            title={t("notif.compose.message")}
            subtitle={t("notif.compose.messageHint")}
            action={
              <div className="inline-flex rounded-lg bg-surface-2 p-0.5">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setEditLang(l.code)}
                    title={l.label}
                    className={cn(
                      "relative rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                      editLang === l.code ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
                    )}
                  >
                    {l.short}
                    {filled(l.code) && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500" />}
                  </button>
                ))}
              </div>
            }
          />
          <div className="space-y-3 px-5 pb-5">
            <div>
              <Label hint={`${text[editLang].title.length}/${TITLE_MAX}`}>{t("notif.compose.titleLabel")}</Label>
              <Input
                value={text[editLang].title}
                maxLength={TITLE_MAX}
                lang={editLang}
                placeholder={t("notif.compose.titlePh")}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div>
              <Label hint={`${text[editLang].body.length}/${BODY_MAX}`}>{t("notif.compose.bodyLabel")}</Label>
              <Textarea
                value={text[editLang].body}
                maxLength={BODY_MAX}
                lang={editLang}
                rows={4}
                placeholder={t("notif.compose.bodyPh")}
                onChange={(e) => set("body", e.target.value)}
              />
            </div>
            {editLang !== "en" && filled("en") && !filled(editLang) && (
              <button onClick={() => setText((s) => ({ ...s, [editLang]: { ...s.en } }))} className="text-xs text-accent hover:underline">
                {t("notif.compose.copyEn")}
              </button>
            )}
          </div>
        </Card>

        <Card className="animate-rise" style={rise(1)}>
          <CardHeader
            title={t("notif.compose.audience")}
            action={
              <span className="text-xs font-medium text-muted tabular">
                {estimate.isFetching ? (
                  <Spinner className="size-4" />
                ) : estimate.data != null ? (
                  t("notif.aud.estimate", { n: num(estimate.data) })
                ) : (
                  t("notif.aud.estimateLater")
                )}
              </span>
            }
          />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AUDIENCES.map((a, i) => (
                <button
                  key={a.kind}
                  onClick={() => setKind(a.kind)}
                  style={rise(i)}
                  className={cn(
                    "animate-rise flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition hover:-translate-y-0.5",
                    kind === a.kind
                      ? "border-accent bg-accent/8 ring-3 ring-[var(--ring)]"
                      : "border-border hover:border-accent/40 hover:bg-surface-2/60",
                  )}
                >
                  <a.icon className={cn("size-4", kind === a.kind ? "text-accent" : "text-muted")} />
                  <span className="text-sm font-medium">{a.label()}</span>
                  <span className="text-[11px] leading-snug text-muted">{t(a.hint)}</span>
                </button>
              ))}
            </div>

            {kind === "skill" && (
              <div className="animate-rise mt-3">
                <Select value={skill} onChange={(e) => setSkill(e.target.value)}>
                  <option value="">{t("notif.aud.pickCategory")}</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {kind === "city" && (
              <div className="animate-rise mt-3">
                <Input icon={<MapPin className="size-4" />} value={city} placeholder={t("notif.aud.cityPh")} onChange={(e) => setCity(e.target.value)} />
              </div>
            )}
            {kind === "phones" && (
              <div className="animate-rise mt-3">
                <Label hint={t("notif.aud.phonesCount", { n: phones.length })}>{t("notif.aud.phones")}</Label>
                <Textarea value={phonesRaw} rows={3} placeholder={t("notif.aud.phonesPh")} onChange={(e) => setPhonesRaw(e.target.value)} />
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button icon={<FlaskConical className="size-4" />} loading={send.isPending && send.variables?.test} onClick={() => doSend(true)}>
            {t("notif.send.test")}
          </Button>
          <Button
            variant="primary"
            icon={<Send className="size-4" />}
            disabled={!hasText || !audienceReady}
            onClick={() => setConfirm(true)}
          >
            {t("notif.send.go")}
          </Button>
        </div>

        {sentId && <SendProgress id={sentId} estimate={estimate.data ?? null} onReport={onReport} />}
      </div>

      <div className="space-y-4">
        <PhonePreview title={preview?.title} body={preview?.body} lang={editLang} appName={project.name} />
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => doSend(false)}
        title={t("notif.send.confirmTitle")}
        description={t("notif.send.confirmBody", { audience: audienceText })}
        confirmLabel={t("act.send")}
        loading={send.isPending}
      />
    </div>
  );
}

/** Phone lock-screen sarkha preview — admin la "user la kasa disel" kalte. */
function PhonePreview({ title, body, lang, appName }: { title?: string; body?: string; lang: Lang; appName: string }) {
  const time = new Intl.DateTimeFormat(`${lang}-IN-u-nu-latn`, { hour: "numeric", minute: "2-digit" }).format(new Date());
  return (
    <Card className="animate-rise overflow-hidden lg:sticky lg:top-20" style={rise(1)}>
      <CardHeader title={t("notif.preview")} />
      <div className="px-5 pb-6">
        <div className="mx-auto w-full max-w-[260px] rounded-[2.2rem] border-[6px] border-text/85 bg-gradient-to-b from-indigo-500 via-violet-500 to-fuchsia-500 p-3 shadow-pop">
          <div className="mx-auto mb-6 h-4 w-20 rounded-full bg-black/70" />
          <p className="text-center text-4xl font-light text-white tabular">{time}</p>
          <div key={`${title}|${body}`} className="animate-pop mt-8 mb-24 rounded-2xl bg-white/85 p-3 text-slate-900 shadow-lg backdrop-blur">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-slate-500 uppercase">
              <span className="flex size-4 items-center justify-center rounded bg-indigo-600 text-[8px] font-bold text-white">
                {appName.slice(0, 1)}
              </span>
              {appName}
              <span className="ml-auto normal-case">{t("notif.preview.now")}</span>
            </div>
            <p lang={lang} className="text-[13px] font-semibold leading-snug break-words">
              {title || t("notif.preview.emptyTitle")}
            </p>
            <p lang={lang} className="mt-0.5 line-clamp-4 text-xs leading-snug break-words text-slate-700">
              {body || t("notif.preview.emptyBody")}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SendProgress({ id, estimate, onReport }: { id: string; estimate: number | null; onReport: (b: Broadcast) => void }) {
  const { project } = useProject();
  const [b, setB] = useState<Broadcast | null>(null);
  useEffect(() => watchBroadcast(project, id, setB), [project, id]);

  const done = b?.status === "done";
  const sending = !b || b.status === "queued" || b.status === "sending";
  return (
    <Card className="animate-pop overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-4">
        <span className={cn("flex size-9 items-center justify-center rounded-xl", done ? "bg-emerald-500/10 text-emerald-600" : "bg-accent/10 text-accent")}>
          {done ? <CheckCircle2 className="size-5" /> : <Send className="size-4 animate-pulse" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t(done ? "notif.progress.done" : "notif.progress.title")}</p>
          <p className="truncate text-xs text-muted">{b?.title}</p>
        </div>
        {b && done && (
          <Button size="sm" onClick={() => onReport(b)}>
            {t("notif.report.open")}
          </Button>
        )}
      </div>
      <div className="px-5 pt-3 pb-4">
        {b && b.stats.targeted > 0 ? (
          <DeliveryBar stats={b.stats} live={sending} />
        ) : (
          <div className="progress-stripes h-2.5 rounded-full bg-accent/60" style={{ width: estimate ? "8%" : "100%" }} />
        )}
        {b && <StatTiles stats={b.stats} compact />}
        {b?.status === "failed" && <p className="mt-2 text-xs text-rose-600">{t("notif.report.failure", { msg: b.failure ?? "" })}</p>}
      </div>
    </Card>
  );
}

function StatTiles({ stats, compact }: { stats: BroadcastStats; compact?: boolean }) {
  const tiles = [
    { label: t("notif.stat.targeted"), value: stats.targeted, icon: Users, cls: "text-text" },
    { label: t("notif.stat.pushed"), value: stats.sent + stats.partial, icon: Smartphone, cls: "text-emerald-600 dark:text-emerald-400" },
    { label: t("notif.stat.inboxOnly"), value: stats.noToken, icon: Inbox, cls: "text-muted" },
    { label: t("notif.stat.failed"), value: stats.failed + stats.error, icon: XCircle, cls: "text-rose-600 dark:text-rose-400" },
  ];
  return (
    <div className={cn("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4", compact && "text-xs")}>
      {tiles.map((x, i) => (
        <div key={x.label} className="animate-rise rounded-xl bg-surface-2/60 p-2.5" style={rise(i)}>
          <p className="flex items-center gap-1 text-[11px] text-muted">
            <x.icon className="size-3" />
            {x.label}
          </p>
          <p className={cn("text-lg font-semibold tabular", x.cls)}>
            <CountUp value={x.value} format={num} />
          </p>
        </div>
      ))}
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────

function History({ onOpen }: { onOpen: (b: Broadcast) => void }) {
  const { admin } = useProject();
  const [type, setType] = useState<BroadcastType | "all">("all");
  const { data, isLoading, error, refetch } = useBroadcasts(type === "all" ? undefined : type);

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const columns: Column<Broadcast>[] = [
    {
      key: "msg",
      header: t("notif.history.col.message"),
      cell: (b) => (
        <div className="min-w-0 max-w-md">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <TypeBadge type={b.type} />
            <StatusPill b={b} />
          </div>
          <p className="truncate font-medium">{b.title}</p>
          <p className="truncate text-xs text-muted">{b.body}</p>
        </div>
      ),
    },
    {
      key: "aud",
      header: t("notif.history.col.audience"),
      hideSm: true,
      cell: (b) => <span className="text-xs text-muted">{audienceSummary(b.audience, admin.uid)}</span>,
    },
    {
      key: "reach",
      header: t("notif.history.col.reach"),
      cell: (b) => (
        <div className="w-40">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold tabular">{num(b.stats.targeted)}</span>
            <span className="text-muted tabular">
              {t("notif.stat.rate")} {pushReach(b.stats)}%
            </span>
          </div>
          <DeliveryBar stats={b.stats} live={b.status === "sending"} />
        </div>
      ),
    },
    {
      key: "at",
      header: t("notif.history.col.sent"),
      hideSm: true,
      cell: (b) => (
        <span className="text-xs whitespace-nowrap text-muted" title={dateTime(b.createdAt)}>
          {ago(b.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: "all", label: t("word.all") },
          { value: "announcement", label: t("notif.type.announcement") },
          { value: "newTask", label: t("notif.type.newTask") },
          { value: "test", label: t("notif.type.test") },
        ]}
      />
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(b) => b.id}
        loading={isLoading}
        onRowClick={onOpen}
        empty={
          <EmptyState
            icon={<Megaphone className="size-5" />}
            title={t("notif.history.empty")}
            description={t("notif.history.emptyHint")}
          />
        }
      />
    </div>
  );
}

function ReportDrawer({ broadcast, onClose }: { broadcast: Broadcast | null; onClose: () => void }) {
  const live = useLiveBroadcast(broadcast);
  const [filter, setFilter] = useState<DeliveryStatus | "all">("all");
  const [q, setQ] = useState("");
  const { admin } = useProject();
  const recipients = useRecipients(live?.id ?? null);

  useEffect(() => {
    setFilter("all");
    setQ("");
  }, [broadcast?.id]);

  // Pathavne chalu asel tar list pan taji.
  const { refetch } = recipients;
  useEffect(() => {
    if (live?.status === "sending" || live?.status === "done") refetch();
  }, [live?.status, live?.stats.targeted, refetch]);

  const rows = (recipients.data ?? []).filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.phone.includes(q.replace(/\D/g, ""))),
  );
  const counts = (recipients.data ?? []).reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});

  const exportCsv = () =>
    downloadCsv(`notification-${live?.id}.csv`, (recipients.data ?? []).map((r) => ({
      name: r.name,
      phone: r.phone,
      roles: r.roles.join(" "),
      language: r.language,
      status: r.status,
      devices: r.devices,
      delivered: r.delivered,
      error: r.error ?? "",
    })));

  return (
    <Drawer
      open={!!broadcast}
      onClose={onClose}
      width="max-w-2xl"
      title={t("notif.report.title")}
      subtitle={live ? `${dateTime(live.createdAt)} · ${audienceSummary(live.audience, admin.uid)}` : undefined}
      actions={
        <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv} disabled={!recipients.data?.length}>
          {t("act.exportCsv")}
        </Button>
      }
    >
      {!live ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <TypeBadge type={live.type} />
              <StatusPill b={live} />
            </div>
            <p className="font-semibold">{live.title}</p>
            <p className="mt-0.5 text-sm text-muted">{live.body}</p>
          </div>

          <div>
            <DeliveryBar stats={live.stats} live={live.status === "sending"} />
            <StatTiles stats={live.stats} />
            <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              {t("notif.delivery.explain")}
            </p>
            {live.status === "failed" && (
              <p className="mt-2 text-xs text-rose-600">{t("notif.report.failure", { msg: live.failure ?? "" })}</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">{t("notif.report.who")}</p>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: t("word.all"), count: recipients.data?.length },
                  ...DELIVERY_ORDER.filter((k) => counts[k]).map((k) => ({ value: k, label: t(DELIVERY[k].label), count: counts[k] })),
                ]}
              />
              <div className="sm:ml-auto sm:w-56">
                <Input icon={<Search className="size-4" />} value={q} placeholder={t("notif.report.searchPh")} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            {recipients.isLoading ? (
              <Skeleton className="h-40" />
            ) : rows.length === 0 ? (
              <EmptyState icon={<Users className="size-5" />} title={t("notif.report.empty")} className="py-8" />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {rows.slice(0, 300).map((r, i) => (
                  <li key={r.id} className="animate-rise flex items-center gap-3 px-3 py-2.5" style={rise(Math.min(i, 10))}>
                    <Avatar name={r.name || "?"} seed={r.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name || t("word.unnamed")}</p>
                      <p className="truncate text-[11px] text-muted tabular">
                        {r.phone ? `+91 ${r.phone}` : r.id} · {r.roles.filter((x) => x !== "admin").map(roleLabel).join(", ")} · {r.language.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <DeliveryBadge status={r.status} />
                      {r.devices > 0 && <span className="text-[10px] text-muted">{t("notif.report.devices", { n: `${r.delivered}/${r.devices}` })}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ── Automatic ────────────────────────────────────────────────────────

const NEW_TASK_OPTIONS: { value: NewTaskAudience; icon: LucideIcon; label: MsgKey; hint: MsgKey }[] = [
  { value: "skilled", icon: Tags, label: "notif.auto.skilled", hint: "notif.auto.skilledHint" },
  { value: "city", icon: MapPin, label: "notif.auto.city", hint: "notif.auto.cityHint" },
  { value: "partners", icon: Briefcase, label: "notif.auto.partners", hint: "notif.auto.partnersHint" },
  { value: "all", icon: Globe2, label: "notif.auto.everyone", hint: "notif.auto.everyoneHint" },
  { value: "none", icon: BellOff, label: "notif.auto.none", hint: "notif.auto.noneHint" },
];

function Automatic() {
  const { data, isLoading, error, refetch } = useNotificationSettings();
  const save = useUpdateNotificationSettings();

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="animate-rise" style={rise(0)}>
        <CardHeader title={t("notif.auto.newTask")} subtitle={t("notif.auto.newTaskHint")} />
        <div className="space-y-2 px-5 pb-5">
          {isLoading || !data
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)
            : NEW_TASK_OPTIONS.map((o, i) => {
                const active = data.newTaskAudience === o.value;
                return (
                  <button
                    key={o.value}
                    style={rise(i)}
                    disabled={save.isPending}
                    onClick={() => !active && save.mutate({ newTaskAudience: o.value })}
                    className={cn(
                      "animate-rise flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                      active ? "border-accent bg-accent/8 ring-3 ring-[var(--ring)]" : "border-border hover:border-accent/40 hover:bg-surface-2/60",
                    )}
                  >
                    <span className={cn("flex size-9 items-center justify-center rounded-lg", active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>
                      <o.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{t(o.label)}</span>
                      <span className="block text-xs text-muted">{t(o.hint)}</span>
                    </span>
                    <span className={cn("flex size-5 items-center justify-center rounded-full border-2 transition", active ? "border-accent" : "border-border")}>
                      {active && <span className="animate-pop size-2.5 rounded-full bg-accent" />}
                    </span>
                  </button>
                );
              })}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="animate-rise" style={rise(1)}>
          <CardHeader title={t("notif.auto.admin")} subtitle={t("notif.auto.adminHint")} />
          <div className="divide-y divide-border px-5 pb-3">
            {(
              [
                { key: "adminOnNewUser", label: "notif.auto.onNewUser", hint: "notif.auto.onNewUserHint", icon: UserRound },
                { key: "adminOnNewTask", label: "notif.auto.onNewTask", hint: "notif.auto.onNewTaskHint", icon: Hash },
              ] as const
            ).map((row) => (
              <div key={row.key} className="flex items-center gap-3 py-3">
                <row.icon className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(row.label)}</p>
                  <p className="text-xs text-muted">{t(row.hint)}</p>
                </div>
                {isLoading || !data ? (
                  <Skeleton className="h-6 w-11 rounded-full" />
                ) : (
                  <Toggle checked={data[row.key]} disabled={save.isPending} onChange={(v) => save.mutate({ [row.key]: v })} />
                )}
              </div>
            ))}
          </div>
        </Card>
        <PushCard />
      </div>
    </div>
  );
}

function PushCard() {
  const { project } = useProject();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState(project).then(setState);
  }, [project]);

  const enable = async () => {
    setBusy(true);
    try {
      const s = await enablePush(project);
      setState(s);
      if (s === "granted") toast.success(t("push.enabled"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (state === null) body = <Skeleton className="h-9 w-32" />;
  else if (state === "granted")
    body = (
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-4" />
        {t("push.on")}
      </p>
    );
  else if (state === "unsupported") body = <p className="text-xs text-muted">{t("push.unsupported")}</p>;
  else if (state === "noVapid")
    body = (
      <p className="text-xs leading-relaxed text-muted">
        {t("push.noVapid", { env: `VITE_${project.id.toUpperCase()}_VAPID_KEY` })}
      </p>
    );
  else if (state === "denied") body = <p className="text-xs leading-relaxed text-rose-600">{t("push.denied")}</p>;
  else
    body = (
      <Button variant="primary" icon={<BellRing className="size-4" />} loading={busy} onClick={enable}>
        {t("push.enable")}
      </Button>
    );

  return (
    <Card className="animate-rise" style={rise(2)}>
      <CardHeader title={t("push.title")} subtitle={t("push.desc")} />
      <div className="px-5 pb-5">{body}</div>
    </Card>
  );
}
