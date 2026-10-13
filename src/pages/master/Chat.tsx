import { MessagesSquare } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { ChatList, Conversation, peerKey, useChatDirectory, type ChatPeer } from "@/components/chat/parts";
import { PushToggle } from "@/components/chat/ChatDock";
import { PageHeader } from "@/components/ui/data";
import { Card, EmptyState } from "@/components/ui/primitives";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Internal Chat — Core Users madhe 1:1 ani groups. Davikade list, ujvikade conversation. */
export function Chat() {
  const me = useAdmin();
  const [params, setParams] = useSearchParams();
  const withUid = params.get("with");
  const groupId = params.get("group");
  const { users, rows } = useChatDirectory(me.uid);

  // `?with=uid` (1:1) kinva `?group=chatId` (push link pan).
  const open = (peer: ChatPeer | null) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("with");
      next.delete("group");
      next.delete("msg");
      if (peer?.kind === "user") next.set("with", peer.user.uid);
      if (peer?.kind === "group") next.set("group", peer.chatId);
      return next;
    });

  const user = users?.find((u) => u.uid === withUid);
  const selected: ChatPeer | null = groupId ? { kind: "group", chatId: groupId } : user ? { kind: "user", user } : null;

  return (
    <>
      <PageHeader title={t("master.nav.chat")} description={t("chat.subtitle")} actions={<PushToggle />} />
      <Card className="grid h-[calc(100dvh-12rem)] min-h-[420px] overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={cn("flex min-h-0 flex-col border-border md:border-r", selected && "hidden md:flex")}>
          <ChatList me={me.uid} rows={rows} users={users} loading={!users} selected={selected && peerKey(selected)} onOpen={open} />
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden md:flex")}>
          {selected ? (
            <Conversation key={peerKey(selected)} me={me.uid} peer={selected} onBack={() => open(null)} focusId={params.get("msg")} />
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
