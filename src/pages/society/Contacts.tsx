import { Phone, PhoneCall } from "lucide-react";

import { listContacts } from "@/api/society";
import { ErrorState, PageHeader } from "@/components/ui/data";
import { rise } from "@/components/ui/motion";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { getLang, t } from "@/i18n";

import { useSocietyQuery } from "./state";

export function Contacts() {
  const list = useSocietyQuery("contacts", listContacts);
  const rows = list.data ?? [];
  const mr = getLang() === "mr";

  return (
    <>
      <PageHeader title={t("soc.nav.contacts")} description={t("soc.contacts.desc")} />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<PhoneCall className="size-5" />} title={t("soc.contacts.empty")} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c, i) => (
            <Card key={c.docId} className="animate-rise flex items-center gap-3 p-4" style={rise(i)}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Phone className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{(mr && c.titleMr) || c.titleEn || c.name}</p>
                <p className="truncate text-xs text-muted">{c.name}</p>
                <a href={`tel:${c.phoneNumber}`} className="font-mono text-xs text-accent hover:underline">
                  {c.phoneNumber}
                </a>
              </div>
              {c.category && <Badge>{c.category}</Badge>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
