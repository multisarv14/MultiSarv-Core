import { Copy, Download, KeyRound, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { listUsers, sendResetLink, type EmUser } from "@/api/evermind";
import { DataTable, ErrorState, PageHeader, type Column } from "@/components/ui/data";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, EmptyState, Input, Segmented } from "@/components/ui/primitives";
import { useProject } from "@/context/project";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { date, num } from "@/lib/format";
import { copyText, downloadCsv } from "@/lib/utils";

import { matches, RoleBadge, roleLabel, useEmQuery } from "./parts";

const ROLES = ["owner", "admin", "member", "viewer"] as const;
type RoleFilter = (typeof ROLES)[number] | "all";

export function EmUsers() {
  const { project } = useProject();
  const list = useEmQuery(["users"], listUsers);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [resetFor, setResetFor] = useState<EmUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ user: EmUser; link: string; emailed: boolean } | null>(null);

  const all = list.data?.rows ?? [];
  const rows = all.filter((u) => (role === "all" || u.role === role) && matches(q, u.name, u.email, u.company, u.id));
  const countOf = (r: RoleFilter) => all.filter((u) => u.role === r).length;

  const reset = async () => {
    if (!resetFor) return;
    setBusy(true);
    try {
      const res = await sendResetLink(project, resetFor.id);
      setSent({ user: resetFor, ...res });
      setResetFor(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<EmUser>[] = [
    {
      key: "name",
      header: t("em.col.user"),
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={u.name || u.email} seed={u.id} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {u.name || "—"}
              {u.platformAdmin && (
                <span title={t("em.platformAdmin")}>
                  <ShieldCheck className="size-3.5 text-accent" />
                </span>
              )}
            </p>
            <p className="truncate text-[11px] text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: "company", header: t("em.col.company"), cell: (u) => <span className="truncate">{u.company ?? "—"}</span> },
    { key: "role", header: t("em.col.role"), cell: (u) => <RoleBadge role={u.role} /> },
    { key: "created", header: t("em.col.joined"), hideSm: true, cell: (u) => <span className="text-xs text-muted">{date(u.createdAt)}</span> },
    {
      key: "password",
      header: t("em.col.password"),
      hideSm: true,
      cell: (u) => <span className="text-xs text-muted">{u.passwordChangedAt ? t("em.changedOn", { date: date(u.passwordChangedAt) }) : "—"}</span>,
    },
    {
      key: "act",
      header: "",
      className: "text-right",
      cell: (u) => (
        <Button size="sm" variant="ghost" icon={<KeyRound className="size-3.5" />} onClick={() => setResetFor(u)}>
          {t("em.reset.action")}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.users")}
        description={t("em.users.desc")}
        actions={
          <>
            <Input className="min-w-0 flex-1 sm:w-64 sm:flex-none" value={q} placeholder={t("em.users.search")} onChange={(e) => setQ(e.target.value)} />
            <Button
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "evermind-users.csv",
                  rows.map((u) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    company: u.company,
                    role: u.role,
                    platformAdmin: u.platformAdmin,
                    joined: u.createdAt?.toISOString() ?? "",
                  })),
                )
              }
            >
              CSV
            </Button>
          </>
        }
      />
      <Segmented
        className="mb-3"
        value={role}
        onChange={setRole}
        options={[{ value: "all", label: t("word.all"), count: all.length }, ...ROLES.map((r) => ({ value: r, label: roleLabel(r), count: countOf(r) }))]}
      />
      {list.data?.truncated && <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{t("em.truncated", { n: num(all.length) })}</p>}
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          loading={list.isLoading}
          empty={<EmptyState icon={<Users className="size-5" />} title={t("em.users.empty")} />}
        />
      )}

      <ConfirmDialog
        open={!!resetFor}
        onClose={() => setResetFor(null)}
        onConfirm={reset}
        loading={busy}
        title={t("em.reset.title")}
        description={resetFor ? t("em.reset.desc", { email: resetFor.email }) : undefined}
        confirmLabel={t("em.reset.send")}
      />

      <Modal
        open={!!sent}
        onClose={() => setSent(null)}
        size="sm"
        title={t("em.reset.sentTitle")}
        description={sent?.user.email}
        footer={<Button onClick={() => setSent(null)}>{t("act.close")}</Button>}
      >
        {sent && (
          <>
            <Badge tone={sent.emailed ? "green" : "amber"} dot>
              {t(sent.emailed ? "em.reset.emailed" : "em.reset.notEmailed")}
            </Badge>
            <p className="mt-3 text-xs text-muted">{t("em.reset.linkHint")}</p>
            <div className="mt-2 flex gap-2">
              <Input readOnly className="font-mono text-xs" value={sent.link} onFocus={(e) => e.target.select()} />
              <Button
                icon={<Copy className="size-4" />}
                onClick={async () => {
                  if (await copyText(sent.link)) toast.success(t("act.copied"));
                  else toast.error(t("err.generic"));
                }}
              >
                {t("act.copy")}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
