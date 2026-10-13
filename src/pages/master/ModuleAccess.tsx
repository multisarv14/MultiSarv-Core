import { Check, Crown, KeyRound, LayoutGrid, RotateCcw, Search, Sparkles, Users as UsersIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/data";
import { Avatar, Badge, Button, Card, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { callCore, errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { AccessMatrix, ModuleMatrix, useAdmins, type Access, type Modules } from "./admins";

const key = (a: Record<string, string[] | undefined>) =>
  JSON.stringify(
    Object.keys(a)
      .filter((id) => a[id]?.length)
      .sort()
      .map((id) => [id, [...a[id]!].sort()]),
  );

/** Settings → Module Access: admin nivda, tyala project ani menu access dya. */
export function ModuleAccess() {
  const { admins } = useAdmins();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Access>({});
  const [modules, setModules] = useState<Modules>({});
  const [saving, setSaving] = useState(false);

  const selectedId = params.get("admin") ?? admins?.find((a) => a.role !== "superAdmin")?.uid ?? admins?.[0]?.uid;
  const selected = admins?.find((a) => a.uid === selectedId) ?? null;
  const savedKey = selected ? key(selected.projects) + key(selected.modules) : "";

  // Dusra admin nivadla (kinva server var badalla) ki draft taja.
  useEffect(() => {
    if (selected) {
      setDraft(structuredClone(selected.projects));
      setModules(structuredClone(selected.modules));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.uid, savedKey]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (admins ?? []).filter((a) => !term || a.name.toLowerCase().includes(term) || a.email.includes(term));
  }, [admins, q]);

  const dirty = !!selected && key(draft) + key(modules) !== savedKey;

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await callCore("updateAdmin", { uid: selected.uid, projects: draft, modules });
      toast.success(t("access.admins.saved", { name: selected.name }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("master.nav.access")} description={t("master.access.subtitle")} />

      {!admins ? (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : admins.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title={t("access.admins.empty")}
            action={
              <Link to="/settings/users">
                <Button size="sm" variant="primary">
                  {t("access.admins.add")}
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr]">
          <Card className="p-2 lg:sticky lg:top-20">
            <div className="p-1.5">
              <Input icon={<Search className="size-4" />} placeholder={t("access.admins.search")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="max-h-[40dvh] space-y-0.5 lg:max-h-[60vh] overflow-y-auto">
              {list.map((a) => {
                const active = a.uid === selected?.uid;
                const count = [...Object.values(a.projects), ...Object.values(a.modules)].reduce((n, m) => n + (m?.length ?? 0), 0);
                return (
                  <li key={a.uid}>
                    <button
                      type="button"
                      onClick={() => setParams({ admin: a.uid }, { replace: true })}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition",
                        active ? "bg-accent/10" : "hover:bg-surface-2",
                        !a.active && "opacity-60",
                      )}
                    >
                      <Avatar name={a.name || a.email} seed={a.uid} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm font-medium", active && "text-accent")}>{a.name}</span>
                        <span className="block truncate text-[11px] text-muted">{a.email}</span>
                      </span>
                      {a.role === "superAdmin" ? (
                        <Crown className="size-3.5 shrink-0 text-violet-500" />
                      ) : (
                        <span className="text-[11px] text-muted tabular">{count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {selected && (
            <Card key={selected.uid} className="animate-pop p-5">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <Avatar name={selected.name || selected.email} seed={selected.uid} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{selected.name}</p>
                    {selected.role === "superAdmin" ? (
                      <Badge tone="violet">
                        <Crown className="size-3" /> {t("access.role.superAdmin")}
                      </Badge>
                    ) : (
                      <Badge tone="blue">{t("access.role.admin")}</Badge>
                    )}
                    {!selected.active && <Badge tone="red">{t("access.filter.disabled")}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted">{selected.email}</p>
                </div>
              </div>

              {selected.role === "superAdmin" ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 p-4 text-sm">
                  <Sparkles className="size-5 shrink-0 text-violet-500" />
                  {t("access.editor.superAll")}
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <LayoutGrid className="size-3.5" /> {t("master.access.modules")}
                    </span>
                    <span className="text-[11px] text-muted">{t("master.access.modulesHint")}</span>
                  </div>
                  <ModuleMatrix value={modules} onChange={setModules} />
                  <div className="mt-6 mb-3 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <KeyRound className="size-3.5" /> {t("access.editor.access")}
                    </span>
                    <span className="text-[11px] text-muted">
                      {t("access.editor.accessHint")}
                    </span>
                  </div>
                  <AccessMatrix value={draft} onChange={setDraft} />
                  <div className="mt-5 flex items-center justify-end gap-2">
                    {dirty && <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">{t("master.access.unsaved")}</span>}
                    <Button icon={<RotateCcw className="size-3.5" />} disabled={!dirty || saving} onClick={() => {
                        setDraft(structuredClone(selected.projects));
                        setModules(structuredClone(selected.modules));
                      }}>
                      {t("master.access.reset")}
                    </Button>
                    <Button variant="primary" icon={<Check className="size-4" />} loading={saving} disabled={!dirty} onClick={save}>
                      {t("act.save")}
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
