import { Ban, CheckCircle2, Circle, Copy, MapPin, MessageSquare, Scale, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { TASK_STATUSES, type TaskStatus } from "@/api/types";
import { ConfirmDialog, Drawer, Lightbox } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Card, EmptyState, KV, Segmented, Skeleton } from "@/components/ui/primitives";
import { DisputeBadge, roleLabel, TaskBadge, taskLabel } from "@/components/ui/status";
import { useCan, useProject } from "@/context/project";
import { useCancelTask, useTaskDetail } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t, tMaybe } from "@/i18n";
import { dateTime, humanize, money } from "@/lib/format";
import { cn, copyText } from "@/lib/utils";

type Tab = "overview" | "proof" | "chat";

export function TaskDrawer() {
  const { project } = useProject();
  const can = useCan();
  const [id, , close] = useDrawerParam("task");
  const [, openUser] = useDrawerParam("user");
  const { data, isLoading } = useTaskDetail(id);
  const cancel = useCancelTask();
  const [tab, setTab] = useState<Tab>("overview");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => setTab("overview"), [id]);

  const task = data?.task;
  const canCancel = task && !["paid", "cancelled", "disputed"].includes(task.status);
  const proofPhotos = task?.proof ? Object.entries(task.proof.photoUrls ?? {}) : [];

  // Timeline: statusHistory madhe jya steps zalya tya kramane.
  const timeline = task
    ? TASK_STATUSES.filter((s) => task.statusHistory[s] !== undefined)
        .map((s) => ({ status: s as TaskStatus, at: task.statusHistory[s] ?? null }))
        .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))
    : [];

  return (
    <Drawer
      open={!!id}
      onClose={close}
      width="max-w-2xl"
      title={task?.title ?? t("tasks.drawer.fallbackTitle")}
      subtitle={
        task && (
          <button
            className="inline-flex items-center gap-1 font-mono hover:text-accent"
            onClick={async () => (await copyText(task.id)) && toast.success(t("tasks.drawer.idCopied"))}
          >
            {task.id} <Copy className="size-3" />
          </button>
        )
      }
      actions={
        canCancel && can("tasks") && (
          <Button size="sm" variant="danger" icon={<Ban className="size-3.5" />} onClick={() => setConfirmCancel(true)}>
            {t("act.cancel")}
          </Button>
        )
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-56" />
        </div>
      ) : !task ? (
        <EmptyState title={t("tasks.drawer.notFound")} description={id ?? ""} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2">
            <Card className="p-3">
              <p className="text-[11px] text-muted">{t("tasks.col.status")}</p>
              <div className="mt-1">
                <TaskBadge status={task.status} />
              </div>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] text-muted">{t("tasks.col.budget")}</p>
              <p className="mt-0.5 font-semibold tabular">{money(task.budget)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] text-muted">{t("tasks.drawer.escrow")}</p>
              <p className="mt-0.5 text-sm font-semibold">
                {data.escrow ? (
                  tMaybe(`tasks.escrow.${data.escrow.status}`, humanize(data.escrow.status))
                ) : (
                  <span className="text-muted">—</span>
                )}
              </p>
            </Card>
          </div>

          <Segmented
            className="mb-4"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview", label: t("tasks.tab.overview") },
              { value: "proof", label: t("tasks.tab.proof"), count: proofPhotos.length },
              { value: "chat", label: t("tasks.tab.chat"), count: data.messages.length },
            ]}
          />

          {tab === "overview" && (
            <div className="space-y-5">
              {data.disputes.length > 0 && (
                <Card className="border-rose-500/30 bg-rose-500/5 p-4">
                  {data.disputes.map((d) => (
                    <div key={d.id} className="flex items-start gap-3">
                      <Scale className="mt-0.5 size-4 text-rose-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {t("tasks.drawer.disputeBy", { name: d.raisedByName, role: roleLabel(d.raisedByRole) })}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{d.reason}</p>
                      </div>
                      <Link to={`/p/${project.id}/disputes?id=${d.id}`} onClick={close}>
                        <DisputeBadge status={d.status} />
                      </Link>
                    </div>
                  ))}
                </Card>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: t("tasks.col.customer"), name: task.customerName, uid: task.customerId },
                  {
                    label: task.workerIsEmployee ? t("tasks.drawer.partnerEmployee") : t("tasks.col.partner"),
                    name: task.workerName,
                    uid: task.workerIsEmployee ? task.businessId : task.workerId,
                  },
                ].map((p) => (
                  <Card key={p.label} className="p-3">
                    <p className="mb-2 text-[11px] text-muted">{p.label}</p>
                    {p.name && p.uid ? (
                      <button onClick={() => openUser(p.uid!)} className="flex items-center gap-2.5 text-left hover:text-accent">
                        <Avatar name={p.name} seed={p.uid} size="sm" />
                        <span className="truncate text-sm font-medium">{p.name}</span>
                      </button>
                    ) : (
                      <p className="text-sm text-muted">{t("tasks.drawer.notAssigned")}</p>
                    )}
                  </Card>
                ))}
              </div>

              <Card className="divide-y divide-border px-4">
                <KV label={t("tasks.drawer.category")}>{task.categoryName || "—"}</KV>
                <KV label={t("tasks.drawer.urgent")}>
                  {task.isUrgent ? <Badge tone="amber">{t("tasks.drawer.urgent")}</Badge> : t("word.no")}
                </KV>
                <KV label={t("tasks.drawer.scheduled")}>{dateTime(task.scheduledAt)}</KV>
                <KV label={t("tasks.drawer.duration")}>
                  {task.estimatedDurationMins ? t("tasks.drawer.mins", { n: task.estimatedDurationMins }) : "—"}
                </KV>
                <KV label={t("tasks.drawer.location")}>
                  <span className="block">{task.location.address || task.location.city || "—"}</span>
                  {task.location.landmark && <span className="block text-xs text-muted">{task.location.landmark}</span>}
                  {task.location.latitude != null && (
                    <a
                      href={`https://www.google.com/maps?q=${task.location.latitude},${task.location.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <MapPin className="size-3" /> {t("tasks.drawer.openMap")}
                    </a>
                  )}
                </KV>
                {task.cancelReason && <KV label={t("tasks.drawer.cancelReason")}>{task.cancelReason}</KV>}
                {task.customerRating != null && (
                  <KV label={t("tasks.drawer.rating")}>
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" /> {task.customerRating}
                    </span>
                    {task.customerReview && <span className="block text-xs text-muted">"{task.customerReview}"</span>}
                  </KV>
                )}
              </Card>

              {task.description && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{t("tasks.drawer.description")}</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{t("tasks.drawer.timeline")}</h3>
                <ol className="relative ml-2 border-l border-border">
                  {timeline.map((s, i) => (
                    <li key={s.status} className="mb-4 ml-5 last:mb-0">
                      <span className="absolute -left-[9px] flex size-[18px] items-center justify-center rounded-full bg-bg">
                        {i === timeline.length - 1 ? (
                          <CheckCircle2 className="size-[18px] text-accent" />
                        ) : (
                          <Circle className="size-3 fill-border text-border" />
                        )}
                      </span>
                      <p className={cn("text-sm", i === timeline.length - 1 && "font-semibold")}>{taskLabel(s.status)}</p>
                      <p className="text-[11px] text-muted">{dateTime(s.at)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {tab === "proof" &&
            (task.proof ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {proofPhotos.map(([label, url]) => (
                    <button key={label} onClick={() => setZoom(url)} className="group text-left">
                      <div className="aspect-square overflow-hidden rounded-xl border border-border bg-surface-2">
                        <img src={url} alt={label} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
                      </div>
                      <p className="mt-1 truncate text-xs text-muted">{label}</p>
                    </button>
                  ))}
                </div>
                {Object.keys(task.proof.checklist ?? {}).length > 0 && (
                  <Card className="p-4">
                    <h4 className="mb-2 text-xs font-semibold text-muted uppercase">{t("tasks.drawer.checklist")}</h4>
                    <ul className="space-y-1.5 text-sm">
                      {Object.entries(task.proof.checklist).map(([item, done]) => (
                        <li key={item} className="flex items-center gap-2">
                          {done ? (
                            <CheckCircle2 className="size-4 text-emerald-500" />
                          ) : (
                            <Circle className="size-4 text-muted" />
                          )}
                          {item}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card className="p-4">
                  <h4 className="mb-1 text-xs font-semibold text-muted uppercase">{t("tasks.drawer.notes")}</h4>
                  <p className="text-sm whitespace-pre-wrap">{task.proof.notes}</p>
                  <p className="mt-2 text-[11px] text-muted">{t("tasks.drawer.uploaded", { time: dateTime(task.proof.uploadedAt) })}</p>
                </Card>
              </div>
            ) : (
              <EmptyState title={t("tasks.drawer.noProof")} />
            ))}

          {tab === "chat" &&
            (data.messages.length === 0 ? (
              <EmptyState icon={<MessageSquare className="size-5" />} title={t("tasks.drawer.noChat")} />
            ) : (
              <div className="space-y-2">
                {data.messages.map((m) =>
                  m.isSystem ? (
                    <p key={m.id} className="py-1 text-center text-[11px] text-muted">
                      {m.text}
                    </p>
                  ) : (
                    <div
                      key={m.id}
                      className={cn("flex", m.senderId === task.customerId ? "justify-start" : "justify-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                          m.senderId === task.customerId ? "rounded-bl-md bg-surface-2" : "rounded-br-md bg-accent/12",
                        )}
                      >
                        <p className="mb-0.5 text-[11px] font-medium text-muted">{m.senderName}</p>
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <p className="mt-1 text-right text-[10px] text-muted">{dateTime(m.sentAt)}</p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ))}
        </>
      )}

      <Lightbox src={zoom} onClose={() => setZoom(null)} />
      {task && (
        <ConfirmDialog
          open={confirmCancel}
          onClose={() => setConfirmCancel(false)}
          tone="danger"
          title={t("tasks.cancel.title")}
          description={t("tasks.cancel.desc", { amount: money(task.budget) })}
          confirmLabel={t("tasks.cancel.confirm")}
          withReason
          reasonPlaceholder={t("tasks.cancel.reasonPh")}
          loading={cancel.isPending}
          onConfirm={(reason) =>
            cancel.mutate({ taskId: task.id, reason: reason || "Cancelled by admin" }, { onSuccess: () => setConfirmCancel(false) })
          }
        />
      )}
    </Drawer>
  );
}
