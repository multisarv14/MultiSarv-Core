import { BellRing, Send, Users as UsersIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useCoreNotices, useRoles, type NoticeAudience } from "@/api/core";
import { rise } from "@/components/ui/motion";
import { PageHeader } from "@/components/ui/data";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Segmented, Skeleton, Textarea } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { ago, dateTime } from "@/lib/format";
import { callCore, errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { useAdmins } from "./admins";

type Kind = NoticeAudience["kind"];

/** Super Admin → Notifications: fakt Core Users na (master panel cha bell). */
export function Notifications() {
  const { admins } = useAdmins();
  const { roles } = useRoles();
  const history = useCoreNotices();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [uids, setUids] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const active = (admins ?? []).filter((a) => a.active);
  const recipients = active.filter((a) =>
    kind === "roles" ? !!a.roleId && roleIds.includes(a.roleId) : kind === "users" ? uids.includes(a.uid) : true,
  ).length;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const audience: NoticeAudience = kind === "roles" ? { kind, roleIds } : kind === "users" ? { kind, uids } : { kind: "all" };
  const canSend = title.trim().length >= 2 && body.trim().length >= 2 && recipients > 0;

  const send = async () => {
    setSending(true);
    try {
      const r = await callCore<{ targeted: number }>("sendCoreNotice", { title, body, audience });
      toast.success(t("cn.sent", { n: r.targeted }));
      setTitle("");
      setBody("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const audienceLabel = (a: NoticeAudience) =>
    a.kind === "roles"
      ? a.roleIds.map((id) => roles?.find((r) => r.id === id)?.name ?? "—").join(", ")
      : a.kind === "users"
        ? t("cn.aud.users")
        : t("cn.aud.all");

  return (
    <>
      <PageHeader title={t("master.nav.notifications")} description={t("cn.subtitle")} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="animate-rise">
          <CardHeader title={t("cn.compose")} />
          <div className="space-y-4 px-5 pb-5">
            <div>
              <Label>{t("cn.title")}</Label>
              <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label hint={`${body.length}/500`}>{t("cn.body")}</Label>
              <Textarea rows={4} value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div>
              <Label>{t("cn.audience")}</Label>
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: "all", label: t("cn.aud.all") },
                  { value: "roles", label: t("cn.aud.roles") },
                  { value: "users", label: t("cn.aud.users") },
                ]}
              />
              {kind === "roles" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {roles?.length === 0 && <p className="text-xs text-muted">{t("cn.noRoles")}</p>}
                  {roles?.map((r) => (
                    <Chip key={r.id} active={roleIds.includes(r.id)} onClick={() => setRoleIds(toggle(roleIds, r.id))}>
                      {r.name}
                    </Chip>
                  ))}
                </div>
              )}
              {kind === "users" && (
                <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {active.map((a) => (
                    <Chip key={a.uid} active={uids.includes(a.uid)} onClick={() => setUids(toggle(uids, a.uid))}>
                      {a.name || a.email}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <UsersIcon className="size-3.5" /> {t("cn.recipients", { n: recipients })}
              </span>
              <Button variant="primary" icon={<Send className="size-4" />} loading={sending} disabled={!canSend} onClick={send}>
                {t("cn.send")}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="animate-rise" style={rise(1)}>
          <CardHeader title={t("cn.history")} />
          {!history ? (
            <div className="space-y-2 px-5 pb-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <EmptyState icon={<BellRing className="size-5" />} title={t("cn.historyEmpty")} />
          ) : (
            <ul className="divide-y divide-border px-2 pb-2">
              {history.map((n) => (
                <li key={n.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold break-words">{n.title}</p>
                    <Badge tone="blue" className="shrink-0">
                      {t("cn.recipients", { n: n.targeted })}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs break-words whitespace-pre-line text-muted">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted/80" title={dateTime(n.createdAt)}>
                    {audienceLabel(n.audience)} · {t("cn.by", { name: n.byName })} · {ago(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition pointer-coarse:py-1.5",
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
