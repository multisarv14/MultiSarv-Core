import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeIndianRupee, Check, History, Inbox, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  assignSubscription,
  cancelSubscription,
  closeSubscriptionRequest,
  daysLeft,
  expiryFor,
  getSubscription,
  isoDay,
  listPlans,
  listSubscriptionHistory,
  listSubscriptionRequests,
  savePlan,
  subscriptionStatus,
  type SocietySubscription,
  type SubscriptionPlan,
  type SubscriptionRequest,
  type SubscriptionStatus,
} from "@/api/society";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Select, Skeleton, Textarea, Toggle, type Tone } from "@/components/ui/primitives";
import { allows, useProject } from "@/context/project";
import { useAdmin } from "@/context/session";
import { t, type MsgKey } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { date, dateTime, money } from "@/lib/format";

import { useSociety, useSocietyQuery } from "./state";

const STATUS_TONE: Record<SubscriptionStatus, Tone> = { ACTIVE: "green", EXPIRING_SOON: "amber", EXPIRED: "red", NONE: "neutral" };
export const SubscriptionBadge = ({ status }: { status: SubscriptionStatus }) => (
  <Badge tone={STATUS_TONE[status]} dot>
    {t(`soc.sub.status.${status}` as MsgKey)}
  </Badge>
);

const REQUEST_TONE: Record<SubscriptionRequest["status"], Tone> = { PENDING: "amber", DONE: "green", REJECTED: "red" };

/** `yyyy-MM-dd` → panel cha date format. */
const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? date(new Date(y, m - 1, d)) : iso || "—";
};

const usePlans = () => {
  const { project } = useProject();
  return useQuery({ queryKey: [project.id, "plans"], queryFn: () => listPlans(project), staleTime: 30_000 });
};

// ── Plan catalogue (sagle societies) ─────────────────────────────────

const blankPlan = (order: number): SubscriptionPlan => ({
  id: "",
  name: "",
  description: "",
  price: 0,
  durationMonths: 12,
  features: [],
  isActive: true,
  sortOrder: order,
});

function PlanEditor({ plan, onClose }: { plan: SubscriptionPlan | null; onClose: () => void }) {
  const { project } = useProject();
  const qc = useQueryClient();
  const [form, setForm] = useState<SubscriptionPlan>(blankPlan(0));
  const [features, setFeatures] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setForm(plan);
    setFeatures(plan.features.join("\n"));
  }, [plan]);

  const valid = form.name.trim() !== "" && form.price >= 0 && form.durationMonths >= 1;

  const save = async () => {
    if (!valid) {
      toast.error(t("soc.plans.invalid"));
      return;
    }
    setBusy(true);
    try {
      await savePlan(project, { ...form, features: features.split("\n") });
      toast.success(t("soc.plans.saved"));
      qc.invalidateQueries({ queryKey: [project.id, "plans"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!plan}
      onClose={busy ? () => {} : onClose}
      title={form.id ? t("soc.plans.edit") : t("soc.plans.add")}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("soc.plans.name")}</Label>
          <Input autoFocus maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>{t("soc.roles.description")}</Label>
          <Input maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>{t("soc.plans.price")}</Label>
            <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </div>
          <div>
            <Label>{t("soc.plans.duration")}</Label>
            <Input
              type="number"
              min={1}
              step={1}
              value={form.durationMonths}
              onChange={(e) => setForm({ ...form, durationMonths: Math.round(Number(e.target.value)) })}
            />
          </div>
          <div>
            <Label>{t("soc.plans.order")}</Label>
            <Input type="number" step={1} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Math.round(Number(e.target.value)) })} />
          </div>
        </div>
        <div>
          <Label hint={t("soc.plans.featuresHint")}>{t("soc.plans.features")}</Label>
          <Textarea className="min-h-28" value={features} onChange={(e) => setFeatures(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t("soc.plans.active")}</span>
          <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
        </div>
      </div>
    </Modal>
  );
}

function PlanCatalogue({ canEdit }: { canEdit: boolean }) {
  const plans = usePlans();
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const list = plans.data ?? [];

  return (
    <Card className="mt-6">
      <CardHeader
        title={t("soc.plans.title")}
        subtitle={t("soc.plans.desc")}
        action={
          canEdit && (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing(blankPlan(list.length + 1))}>
              {t("soc.plans.add")}
            </Button>
          )
        }
      />
      <div className="px-5 pb-5">
        {plans.error ? (
          <ErrorState error={plans.error} onRetry={plans.refetch} />
        ) : plans.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : list.length === 0 ? (
          <EmptyState icon={<BadgeIndianRupee className="size-5" />} title={t("soc.plans.empty")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <div key={p.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    {p.description && <p className="text-xs text-muted">{p.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!p.isActive && <Badge tone="red">{t("soc.plans.retired")}</Badge>}
                    {canEdit && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(p)} aria-label={t("soc.plans.edit")} />}
                  </div>
                </div>
                <p className="mt-2 text-lg font-semibold tabular">
                  {money(p.price)} <span className="text-xs font-normal text-muted">{t("soc.plans.perMonths", { n: p.durationMonths })}</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <PlanEditor plan={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

// ── Society subscription ─────────────────────────────────────────────

/** Renewal chalu plan sampalyachya dusrya divsapasun; nahitar aajpasun. */
const defaultStart = (current: SocietySubscription | null) => {
  const status = subscriptionStatus(current);
  if (current && (status === "ACTIVE" || status === "EXPIRING_SOON")) {
    const [y, m, d] = current.expiryDate.split("-").map(Number);
    return isoDay(new Date(y, m - 1, d + 1));
  }
  return isoDay(new Date());
};

function AssignDialog({
  open,
  request,
  current,
  onClose,
}: {
  open: boolean;
  request: SubscriptionRequest | null;
  current: SocietySubscription | null;
  onClose: () => void;
}) {
  const { project } = useProject();
  const { current: society } = useSociety();
  const me = useAdmin();
  const qc = useQueryClient();
  const plans = usePlans();
  const [planId, setPlanId] = useState("");
  const [start, setStart] = useState(isoDay(new Date()));
  const [busy, setBusy] = useState(false);

  const offered = (plans.data ?? []).filter((p) => p.isActive || p.id === planId);
  const plan = (plans.data ?? []).find((p) => p.id === planId) ?? null;

  useEffect(() => {
    if (!open) return;
    setPlanId(request?.planId ?? current?.planId ?? plans.data?.find((p) => p.isActive)?.id ?? "");
    setStart(defaultStart(current));
  }, [open, request, current, plans.data]);

  const save = async () => {
    if (!society || !plan || !start) return;
    setBusy(true);
    try {
      await assignSubscription(project, society.code, plan, start, me.email, current, request?.id);
      toast.success(t("soc.sub.assigned"));
      qc.invalidateQueries({ queryKey: [project.id, "soc", society.code] });
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
      title={current ? t("soc.sub.renewOrChange") : t("soc.sub.assign")}
      description={society ? `${society.name} · ${society.code}` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!plan || !start} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("soc.sub.plan")}</Label>
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {offered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {money(p.price)} {t("soc.plans.perMonths", { n: p.durationMonths })}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("soc.sub.start")}</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>{t("soc.sub.expiry")}</Label>
            <Input readOnly value={plan && start ? day(expiryFor(start, plan.durationMonths)) : "—"} />
          </div>
        </div>
        <p className="text-xs text-muted">{t("soc.sub.startHint")}</p>
      </div>
    </Modal>
  );
}

function DeclineDialog({ request, onClose }: { request: SubscriptionRequest | null; onClose: () => void }) {
  const { project } = useProject();
  const { current } = useSociety();
  const me = useAdmin();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const decline = async (reason: string) => {
    if (!request || !current) return;
    setBusy(true);
    try {
      await closeSubscriptionRequest(project, current.code, request.id, "REJECTED", reason, me.email);
      toast.success(t("soc.sub.declined"));
      qc.invalidateQueries({ queryKey: [project.id, "soc", current.code] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={!!request}
      onClose={onClose}
      onConfirm={decline}
      loading={busy}
      tone="danger"
      withReason
      reasonPlaceholder={t("soc.sub.declineReason")}
      title={t("soc.sub.decline")}
      description={request ? `${request.planName} · ${t("soc.sub.requestedBy", { name: request.requestedBy, flat: request.requestedFlat })}` : undefined}
      confirmLabel={t("soc.sub.decline")}
    />
  );
}

export function Subscription() {
  const { project, menus } = useProject();
  const { current: society } = useSociety();
  const me = useAdmin();
  const qc = useQueryClient();
  const sub = useSocietyQuery("subscription", getSubscription);
  const requests = useSocietyQuery("subscription_requests", listSubscriptionRequests);
  const history = useSocietyQuery("subscription_history", listSubscriptionHistory);
  const [assigning, setAssigning] = useState<{ request: SubscriptionRequest | null } | null>(null);
  const [declining, setDeclining] = useState<SubscriptionRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = allows(menus, "subscriptions");

  const current = sub.data ?? null;
  const status = subscriptionStatus(current);

  const cancel = async () => {
    if (!society || !current) return;
    setBusy(true);
    try {
      await cancelSubscription(project, society.code, current, me.email);
      toast.success(t("soc.sub.cancelled"));
      qc.invalidateQueries({ queryKey: [project.id, "soc", society.code] });
      setCancelling(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const requestColumns: Column<SubscriptionRequest>[] = [
    { key: "when", header: t("soc.roles.col.when"), cell: (r) => <span className="text-xs whitespace-nowrap">{dateTime(r.createdAt)}</span> },
    {
      key: "plan",
      header: t("soc.sub.plan"),
      cell: (r) => (
        <div>
          <p className="font-medium">{r.planName}</p>
          {r.note && <p className="text-[11px] text-muted">{r.note}</p>}
        </div>
      ),
    },
    {
      key: "by",
      header: t("soc.roles.col.by"),
      hideSm: true,
      cell: (r) => (
        <div className="text-xs">
          <p>{t("soc.sub.requestedBy", { name: r.requestedBy, flat: r.requestedFlat })}</p>
          <p className="font-mono text-muted">{r.contactNumber}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: t("soc.col.status"),
      cell: (r) => (
        <div>
          <Badge tone={REQUEST_TONE[r.status]}>{t(`soc.sub.request.${r.status}` as MsgKey)}</Badge>
          {r.adminNote && <p className="mt-1 text-[11px] text-muted">{r.adminNote}</p>}
        </div>
      ),
    },
    ...(canEdit
      ? [
          {
            key: "act",
            header: "",
            className: "text-right",
            cell: (r: SubscriptionRequest) =>
              r.status === "PENDING" ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="primary" onClick={() => setAssigning({ request: r })}>
                    {t("soc.sub.activate")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeclining(r)}>
                    {t("soc.sub.decline")}
                  </Button>
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  const historyColumns: Column<NonNullable<typeof history.data>[number]>[] = [
    { key: "when", header: t("soc.roles.col.when"), cell: (h) => <span className="text-xs whitespace-nowrap">{dateTime(h.at)}</span> },
    { key: "action", header: t("soc.roles.col.change"), cell: (h) => <Badge tone={h.action === "CANCELLED" ? "red" : "blue"}>{t(`soc.sub.action.${h.action}` as MsgKey)}</Badge> },
    {
      key: "plan",
      header: t("soc.sub.plan"),
      cell: (h) => (
        <div>
          <p className="font-medium">{h.planName}</p>
          <p className="text-[11px] text-muted">{t("soc.sub.period", { start: day(h.startDate), end: day(h.expiryDate) })}</p>
        </div>
      ),
    },
    { key: "price", header: t("soc.plans.price"), hideSm: true, cell: (h) => <span className="tabular">{money(h.price)}</span> },
    { key: "by", header: t("soc.roles.col.by"), hideSm: true, cell: (h) => <span className="text-xs">{h.updatedBy || "—"}</span> },
  ];

  return (
    <>
      <PageHeader title={t("soc.nav.subscription")} description={t("soc.sub.desc")} />

      <Card>
        <CardHeader
          title={t("soc.sub.current")}
          action={
            canEdit && (
              <div className="flex flex-wrap gap-2">
                {current && status !== "NONE" && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
                    {t("soc.sub.cancel")}
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={() => setAssigning({ request: null })}>
                  {current && status !== "NONE" ? t("soc.sub.renewOrChange") : t("soc.sub.assign")}
                </Button>
              </div>
            )
          }
        />
        <div className="px-5 pb-5">
          {sub.error ? (
            <ErrorState error={sub.error} onRetry={sub.refetch} />
          ) : sub.isLoading ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : !current || status === "NONE" ? (
            <div className="flex items-center gap-3">
              <SubscriptionBadge status="NONE" />
              <span className="text-sm text-muted">{t("soc.sub.none")}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold">{current.planName}</p>
                  <SubscriptionBadge status={status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {status === "EXPIRED"
                    ? t("soc.sub.expiredOn", { date: day(current.expiryDate) })
                    : t("soc.sub.validTill", { date: day(current.expiryDate), days: daysLeft(current) })}
                </p>
                <p className="text-xs text-muted">{t("soc.sub.period", { start: day(current.startDate), end: day(current.expiryDate) })}</p>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {current.features.map((f) => (
                    <li key={f}>
                      <Badge>{f}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xl font-semibold tabular">
                {money(current.price)} <span className="text-xs font-normal text-muted">{t("soc.plans.perMonths", { n: current.durationMonths })}</span>
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title={t("soc.sub.requests")} action={<Inbox className="size-4 text-muted" />} />
        <div className="px-2 pb-2">
          {requests.error ? (
            <ErrorState error={requests.error} onRetry={requests.refetch} />
          ) : (
            <DataTable
              columns={requestColumns}
              rows={requests.data ?? []}
              rowKey={(r) => r.id}
              loading={requests.isLoading}
              empty={<EmptyState icon={<Inbox className="size-5" />} title={t("soc.sub.requestsEmpty")} />}
            />
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title={t("soc.sub.history")} action={<History className="size-4 text-muted" />} />
        <div className="px-2 pb-2">
          {history.error ? (
            <ErrorState error={history.error} onRetry={history.refetch} />
          ) : (
            <DataTable
              columns={historyColumns}
              rows={history.data ?? []}
              rowKey={(h) => h.id}
              loading={history.isLoading}
              empty={<EmptyState icon={<History className="size-5" />} title={t("soc.sub.historyEmpty")} />}
            />
          )}
        </div>
      </Card>

      <PlanCatalogue canEdit={canEdit} />

      <AssignDialog open={!!assigning} request={assigning?.request ?? null} current={current} onClose={() => setAssigning(null)} />
      <DeclineDialog request={declining} onClose={() => setDeclining(null)} />
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={cancel}
        loading={busy}
        tone="danger"
        title={t("soc.sub.cancel")}
        description={t("soc.sub.cancelConfirm")}
        confirmLabel={t("soc.sub.cancel")}
      />
    </>
  );
}
