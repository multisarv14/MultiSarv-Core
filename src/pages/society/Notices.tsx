import { Megaphone, Pin } from "lucide-react";

import { listNotices } from "@/api/society";
import { ErrorState, PageHeader } from "@/components/ui/data";
import { rise } from "@/components/ui/motion";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { t } from "@/i18n";

import { enumLabel, useSocietyQuery } from "./state";

export function Notices() {
  const list = useSocietyQuery("notices", listNotices);
  const rows = list.data ?? [];

  return (
    <>
      <PageHeader title={t("soc.nav.notices")} description={t("soc.notices.desc")} />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : list.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone className="size-5" />} title={t("soc.notices.empty")} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((n, i) => (
            <Card key={n.docId} className="animate-rise p-5" style={rise(i)}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{n.title}</h3>
                {n.isPinned && (
                  <Badge tone="accent">
                    <Pin className="size-3" /> {t("soc.notices.pinned")}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <Badge>{enumLabel(n.category)}</Badge>
                <span>{n.publishedDate}</span>
                {n.authorRole && <span>· {n.authorRole}</span>}
              </div>
              <p className="mt-3 text-sm whitespace-pre-line text-muted">{n.content}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
