import { BadgeCheck, Check, Undo2 } from "lucide-react";
import { useState } from "react";

import type { KycItem } from "@/api/admin";
import type { KycStatus } from "@/api/types";
import { KycImages } from "@/components/KycImages";
import { KycReturnDialog } from "@/components/KycReturnDialog";
import { ErrorState, PageHeader } from "@/components/ui/data";
import { Avatar, Button, Card, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { KycBadge, kycLabel, RoleBadge } from "@/components/ui/status";
import { useProject } from "@/context/project";
import { useKycQueue, useQueueCounts, useReviewKyc } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t } from "@/i18n";
import { ago } from "@/lib/format";

function KycCard({ item }: { item: KycItem }) {
  const { project } = useProject();
  const [, openUser] = useDrawerParam("user");
  const review = useReviewKyc();
  const [rejecting, setRejecting] = useState(false);
  const { user, kyc } = item;
  const pending = user.kycStatus === "pending";

  return (
    <Card className="flex flex-col p-4">
      <button onClick={() => openUser(user.id)} className="flex items-center gap-3 text-left">
        <Avatar name={user.businessName || user.name} seed={user.id} src={user.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold hover:text-accent">{user.businessName || user.name}</p>
          <p className="text-xs text-muted tabular">
            {project.phonePrefix} {user.phone}
          </p>
        </div>
        <RoleBadge role={user.activeRole} />
      </button>

      <div className="my-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-surface-2/60 p-3 text-xs">
        <div>
          <p className="text-muted">{t("users.kyc.document")}</p>
          <p className="font-medium">{kyc?.documentType ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted">{t("users.kyc.number")}</p>
          <p className="font-mono font-medium">{kyc?.documentNumber ?? "—"}</p>
        </div>
        {kyc?.gstin && (
          <div className="col-span-2">
            <p className="text-muted">{t("users.field.gstin")}</p>
            <p className="font-mono font-medium">{kyc.gstin}</p>
          </div>
        )}
      </div>

      {user.kycStatus === "rejected" && (user.kycRejectReason || kyc?.rejectionReason) && (
        <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {t("users.kyc.returnedWith", { reason: user.kycRejectReason || kyc?.rejectionReason || "" })}
        </p>
      )}
      <KycImages uid={user.id} />

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] text-muted">
          {t(pending ? "users.kyc.submitted" : "users.kyc.reviewed", {
            time: ago(pending ? kyc?.submittedAt : (kyc?.reviewedAt ?? kyc?.submittedAt)),
          })}
        </span>
        {pending ? (
          <div className="flex gap-2">
            <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => setRejecting(true)}>
              {t("users.kyc.return")}
            </Button>
            <Button
              size="sm"
              variant="success"
              icon={<Check className="size-3.5" />}
              loading={review.isPending && review.variables?.approve}
              onClick={() => review.mutate({ userId: user.id, approve: true })}
            >
              {t("users.kyc.approve")}
            </Button>
          </div>
        ) : (
          <KycBadge status={user.kycStatus} />
        )}
      </div>

      <KycReturnDialog
        open={rejecting}
        name={user.name}
        loading={review.isPending}
        onClose={() => setRejecting(false)}
        onSend={(reason) =>
          review.mutate({ userId: user.id, approve: false, reason }, { onSuccess: () => setRejecting(false) })
        }
      />
    </Card>
  );
}

export function Kyc() {
  const [status, setStatus] = useState<KycStatus>("pending");
  const { data, isLoading, error, refetch } = useKycQueue(status);
  const { data: queues } = useQueueCounts();

  return (
    <>
      <PageHeader
        title={t("users.kyc.title")}
        description={t("users.kyc.description")}
        actions={
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "pending", label: kycLabel("pending"), count: queues?.kyc },
              { value: "verified", label: kycLabel("verified") },
              { value: "rejected", label: kycLabel("rejected") },
            ]}
          />
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((item) => (
            <KycCard key={item.user.id} item={item} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<BadgeCheck className="size-5" />}
            title={status === "pending" ? t("users.kyc.allClear") : t("table.empty")}
            description={status === "pending" ? t("users.kyc.allClearDesc") : undefined}
          />
        </Card>
      )}
    </>
  );
}
