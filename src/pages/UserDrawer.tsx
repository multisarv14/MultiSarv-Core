import { Ban, Check, Copy, ExternalLink, Pencil, ShieldCheck, Star, Trash2, Undo2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { KycImages } from "@/components/KycImages";
import { KycReturnDialog } from "@/components/KycReturnDialog";
import { UserEditModal } from "@/components/UserEditModal";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Card, EmptyState, KV, Skeleton } from "@/components/ui/primitives";
import { KycBadge, RoleBadge, TaskBadge, TXN_META, TxnBadge } from "@/components/ui/status";
import type { User } from "@/api/types";
import { useCan, useProject } from "@/context/project";
import { useDeleteUser, useReviewKyc, useToggleBlock, useUserDetail } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t, type MsgKey } from "@/i18n";
import { ago, date, dateTime, money } from "@/lib/format";
import { profileCompletion } from "@/lib/profile";
import { cn, copyText } from "@/lib/utils";

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function UserDrawer() {
  const { project } = useProject();
  const can = useCan();
  const [uid, , close] = useDrawerParam("user");
  const [, openTask] = useDrawerParam("task");
  const { data, isLoading, error } = useUserDetail(uid);
  const block = useToggleBlock();
  const review = useReviewKyc();
  const remove = useDeleteUser();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [editing, setEditing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const user = data?.user;

  const copy = async (text: string) => {
    if (await copyText(text)) toast.success(t("act.copied"));
  };

  return (
    <Drawer
      open={!!uid}
      onClose={close}
      title={user ? user.businessName || user.name : t("users.drawer.user")}
      subtitle={user ? `${project.phonePrefix} ${user.phone}` : uid}
      actions={
        user && can("users") && (
          <>
            <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              {t("users.drawer.edit")}
            </Button>
            <Button
              size="sm"
              variant={user.isBlocked ? "success" : "danger"}
              icon={user.isBlocked ? <ShieldCheck className="size-3.5" /> : <Ban className="size-3.5" />}
              onClick={() => setConfirmBlock(true)}
            >
              {user.isBlocked ? t("users.drawer.unblock") : t("users.drawer.block")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-rose-500 hover:text-rose-600"
              title={t("users.drawer.delete")}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error || !data || !user ? (
        <EmptyState title={t("users.drawer.notFound")} description={uid ?? ""} />
      ) : (
        <>
          <Card className="mb-6 p-4">
            <div className="flex items-center gap-4">
              <Avatar name={user.businessName || user.name} seed={user.id} size="lg" src={user.photoUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {user.availableRoles.map((r) => (
                    <RoleBadge key={r} role={r} />
                  ))}
                  <KycBadge status={user.kycStatus} />
                  {user.isBlocked && <Badge tone="red">{t("users.status.blocked")}</Badge>}
                </div>
                <p className="mt-2 flex items-center gap-3 text-xs text-muted">
                  {user.ratingCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" />
                      {user.rating.toFixed(1)} ({user.ratingCount})
                    </span>
                  )}
                  <span>{t("users.drawer.jobs", { n: user.completedJobs })}</span>
                  <span>{t("users.drawer.joined", { date: date(user.joinedAt) })}</span>
                </p>
              </div>
            </div>
            <ProfileMeter user={user} />
          </Card>

          <Section title={t("users.section.wallet")}>
            <div className="grid grid-cols-3 gap-2">
              {[
                [t("users.wallet.balance"), data.wallet.balance],
                [t("users.wallet.inEscrow"), data.wallet.escrowHeld],
                [t("users.wallet.pendingPayout"), data.wallet.pendingPayout],
                [t("users.wallet.lifetimeEarned"), data.wallet.lifetimeEarned],
                [t("users.wallet.lifetimeSpent"), data.wallet.lifetimeSpent],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-[11px] text-muted">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular">{money(value as number)}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("users.section.profile")}>
            <Card className="divide-y divide-border px-4">
              <KV label={t("users.field.name")}>{user.name}</KV>
              {user.businessName && <KV label={t("users.field.business")}>{user.businessName}</KV>}
              {user.gstin && <KV label={t("users.field.gstin")}>{user.gstin}</KV>}
              <KV label={t("users.field.email")}>{user.email || "—"}</KV>
              <KV label={t("users.field.upi")}>{user.upiId || data.wallet.upiId || "—"}</KV>
              <KV label={t("users.field.city")}>{user.location?.city || "—"}</KV>
              <KV label={t("users.field.language")}>{user.language?.toUpperCase() || "EN"}</KV>
              {user.skills.length > 0 && (
                <KV label={t("users.field.skills")}>
                  <span className="flex flex-wrap justify-end gap-1">
                    {user.skills.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </span>
                </KV>
              )}
              <KV label={t("users.field.userId")}>
                <button
                  onClick={() => copy(user.id)}
                  className="inline-flex items-center gap-1 font-mono text-xs hover:text-accent"
                >
                  {user.id.slice(0, 14)}… <Copy className="size-3" />
                </button>
              </KV>
            </Card>
          </Section>

          {data.kyc && (
            <Section
              title={t("users.section.kyc")}
              action={
                user.kycStatus === "pending" && can("kyc") && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Undo2 className="size-3.5" />}
                      onClick={() => setReturning(true)}
                    >
                      {t("users.kyc.return")}
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      icon={<Check className="size-3.5" />}
                      loading={review.isPending && review.variables?.approve === true}
                      onClick={() => review.mutate({ userId: user.id, approve: true })}
                    >
                      {t("users.kyc.approve")}
                    </Button>
                  </div>
                )
              }
            >
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{data.kyc.documentType}</span>
                  <span className="font-mono text-xs">{data.kyc.documentNumber}</span>
                </div>
                {user.kycStatus === "rejected" && user.kycRejectReason && (
                  <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                    {t("users.kyc.returnedWith", { reason: user.kycRejectReason })}
                  </p>
                )}
                <KycImages uid={user.id} />
                <p className="mt-2 text-[11px] text-muted">
                  {t("users.kyc.submitted", { time: dateTime(data.kyc.submittedAt) })}
                </p>
              </Card>
            </Section>
          )}

          <Section title={t("users.section.recentTasks")}>
            {data.tasks.length === 0 ? (
              <p className="text-sm text-muted">{t("users.noTasks")}</p>
            ) : (
              <Card className="divide-y divide-border">
                {data.tasks.slice(0, 8).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => openTask(task.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted">
                        {task.customerId === user.id ? t("users.asCustomer") : t("users.asPartner")} ·{" "}
                        {ago(task.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular">{money(task.budget)}</span>
                    <TaskBadge status={task.status} />
                  </button>
                ))}
              </Card>
            )}
          </Section>

          <Section
            title={t("users.section.recentTxns")}
            action={
              <Link
                to={`/p/${project.id}/ledger?userId=${user.id}`}
                onClick={close}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                {t("users.fullLedger")} <ExternalLink className="size-3" />
              </Link>
            }
          >
            {data.transactions.length === 0 ? (
              <p className="text-sm text-muted">{t("users.noTxns")}</p>
            ) : (
              <Card className="divide-y divide-border">
                {data.transactions.map((tx) => {
                  const credit = TXN_META[tx.type]?.credit;
                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5">
                      <TxnBadge type={tx.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs">{tx.taskTitle || tx.counterparty}</p>
                        <p className="text-[11px] text-muted">{dateTime(tx.createdAt)}</p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold tabular",
                          credit ? "text-emerald-600 dark:text-emerald-400" : "",
                        )}
                      >
                        {credit ? "+" : "−"}
                        {money(tx.amount)}
                      </span>
                    </div>
                  );
                })}
              </Card>
            )}
          </Section>
        </>
      )}

      {user && (
        <>
          <UserEditModal user={user} open={editing} onClose={() => setEditing(false)} />
          <KycReturnDialog
            open={returning}
            name={user.name}
            loading={review.isPending}
            onClose={() => setReturning(false)}
            onSend={(reason) =>
              review.mutate({ userId: user.id, approve: false, reason }, { onSuccess: () => setReturning(false) })
            }
          />
          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            tone="danger"
            title={t("users.delete.title", { name: user.name })}
            description={t("users.delete.desc")}
            confirmLabel={t("users.delete.confirm")}
            loading={remove.isPending}
            onConfirm={() =>
              remove.mutate(user.id, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  close();
                },
              })
            }
          />
        </>
      )}
      {user && (
        <ConfirmDialog
          open={confirmBlock}
          onClose={() => setConfirmBlock(false)}
          tone={user.isBlocked ? "success" : "danger"}
          title={t(user.isBlocked ? "users.confirm.unblockTitle" : "users.confirm.blockTitle", { name: user.name })}
          description={user.isBlocked ? t("users.confirm.unblockDesc") : t("users.confirm.blockDesc")}
          confirmLabel={user.isBlocked ? t("users.drawer.unblock") : t("users.confirm.blockUser")}
          loading={block.isPending}
          onConfirm={() => block.mutate(user.id, { onSuccess: () => setConfirmBlock(false) })}
        />
      )}
    </Drawer>
  );
}

/** Profile kiti % bharla — app madhla mandatory setup sarkhach hishob. */
function ProfileMeter({ user }: { user: User }) {
  const { percent, missing } = profileCompletion(user);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium">{t("users.profile.percent", { n: percent })}</span>
        {missing.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {t("users.profile.missing", {
              fields: missing.map((f) => t(`users.profile.field.${f}` as MsgKey)).join(", "),
            })}
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all", percent === 100 ? "bg-emerald-500" : "bg-accent")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
