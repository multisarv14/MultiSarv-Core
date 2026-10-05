import { MessagesSquare } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { ChatList, Conversation, useChatDirectory } from "@/components/chat/parts";
import { PushToggle } from "@/components/chat/ChatDock";
import { PageHeader } from "@/components/ui/data";
import { Card, EmptyState } from "@/components/ui/primitives";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Internal Chat — Core Users madhe 1:1. Davikade list, ujvikade conversation. */
export function Chat() {
  const me = useAdmin();
  const [params, setParams] = useSearchParams();
  const withUid = params.get("with");
  const { users, rows } = useChatDirectory(me.uid);

  const open = (uid: string | null) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (uid) next.set("with", uid);
      else next.delete("with");
      return next;
    });

  const selected = users?.find((u) => u.uid === withUid) ?? null;

  return (
    <>
      <PageHeader title={t("master.nav.chat")} description={t("chat.subtitle")} actions={<PushToggle />} />
      <Card className="grid h-[calc(100dvh-12rem)] min-h-[420px] overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={cn("flex min-h-0 flex-col border-border md:border-r", selected && "hidden md:flex")}>
          <ChatList me={me.uid} rows={rows} loading={!users} selected={withUid} onOpen={(u) => open(u.uid)} />
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden md:flex")}>
          {selected ? (
            <Conversation key={selected.uid} me={me.uid} other={selected} onBack={() => open(null)} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={<MessagesSquare className="size-5" />} title={t("chat.pick")} description={t("chat.pickHint")} />
            </div>
          )}
        </section>
      </Card>
    </>
  );
}
