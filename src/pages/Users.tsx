import { Download, Search, ShieldBan, Star, Users as UsersIcon } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { UserFilter } from "@/api/admin";
import { KYC_STATUSES, ROLES, type KycStatus, type Role, type User } from "@/api/types";
import { DataTable, ErrorState, LoadMore, PageHeader, type Column } from "@/components/ui/data";
import { Avatar, Badge, Button, EmptyState, Input, Select } from "@/components/ui/primitives";
import { KycBadge, kycLabel, RoleBadge, roleLabel } from "@/components/ui/status";
import { useProject } from "@/context/project";
import { useUsers, useUserSearch } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t } from "@/i18n";
import { ago } from "@/lib/format";
import { profileCompletion } from "@/lib/profile";
import { downloadCsv } from "@/lib/utils";

/** Role filter — panel admin accounts (`admin`) ithe dakhavat nahi. */
const FILTER_ROLES = ROLES.filter((r): r is Exclude<Role, "admin"> => r !== "admin");

export function Users() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const [, openUser] = useDrawerParam("user");
  const q = params.get("q") ?? "";

  const filter: UserFilter = {
    role: FILTER_ROLES.find((r) => r === params.get("role")),
    kyc: (params.get("kyc") as KycStatus) || undefined,
    blocked: params.get("blocked") === "1" ? true : undefined,
  };
  const setParam = (key: string, value: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (value) n.set(key, value);
      else n.delete(key);
      return n;
    });

  const list = useUsers(filter);
  const search = useUserSearch(q);

  const rows = useMemo(() => {
    const loaded = list.data?.pages.flatMap((p) => p.items) ?? [];
    const term = q.trim().toLowerCase();
    const local = term
      ? loaded.filter(
          (u) =>
            u.name.toLowerCase().includes(term) ||
            u.phone.includes(term) ||
            (u.businessName ?? "").toLowerCase().includes(term) ||
            u.id === q.trim(),
        )
      : loaded;
    // Server lookup (phone / uid) che results varti, duplicate shivay.
    const extra = (search.data ?? []).filter((u) => !local.some((l) => l.id === u.id));
    return [...extra, ...local];
  }, [list.data, search.data, q]);

  const columns: Column<User>[] = [
    {
      key: "user",
      header: t("users.col.user"),
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.businessName || u.name} seed={u.id} src={u.photoUrl} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {u.businessName || u.name}
              {u.isBlocked && <ShieldBan className="size-3.5 text-rose-500" />}
            </p>
            <p className="truncate text-xs text-muted tabular">
              {u.phone ? `${project.phonePrefix} ${u.phone}` : u.email || u.id}
              {u.businessName && ` · ${u.name}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "roles",
      header: t("users.col.roles"),
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.availableRoles.map((r) => (
            <RoleBadge key={r} role={r} />
          ))}
        </div>
      ),
    },
    { key: "kyc", header: t("users.col.kyc"), cell: (u) => <KycBadge status={u.kycStatus} /> },
    {
      key: "profile",
      header: t("users.col.profile"),
      hideSm: true,
      cell: (u) => {
        const { percent } = profileCompletion(u);
        return (
          <div className="flex w-24 items-center gap-2" title={t("users.profile.percent", { n: percent })}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className={percent === 100 ? "h-full bg-emerald-500" : "h-full bg-accent"}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-[11px] text-muted tabular">{percent}%</span>
          </div>
        );
      },
    },
    {
      key: "rating",
      header: t("users.col.rating"),
      hideSm: true,
      cell: (u) =>
        u.ratingCount > 0 ? (
          <span className="inline-flex items-center gap-1 tabular">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {u.rating.toFixed(1)}
            <span className="text-xs text-muted">({u.ratingCount})</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: "jobs", header: t("users.col.jobs"), hideSm: true, cell: (u) => <span className="tabular">{u.completedJobs}</span> },
    {
      key: "status",
      header: t("users.col.status"),
      hideSm: true,
      cell: (u) =>
        u.isBlocked ? (
          <Badge tone="red">{t("users.status.blocked")}</Badge>
        ) : u.isOnline ? (
          <Badge tone="green" dot>
            {t("users.status.online")}
          </Badge>
        ) : (
          <Badge>{t("users.status.offline")}</Badge>
        ),
    },
    { key: "joined", header: t("users.col.joined"), hideSm: true, cell: (u) => <span className="text-muted">{ago(u.joinedAt)}</span> },
  ];

  const exportCsv = () =>
    downloadCsv(
      "users.csv",
      rows.map((u) => ({
        id: u.id,
        name: u.name,
        businessName: u.businessName ?? "",
        phone: u.phone,
        email: u.email ?? "",
        roles: u.availableRoles.join("|"),
        kyc: u.kycStatus,
        blocked: u.isBlocked,
        rating: u.rating,
        completedJobs: u.completedJobs,
        city: u.location?.city ?? "",
        joinedAt: u.joinedAt,
      })),
    );

  return (
    <>
      <PageHeader
        title={t("users.title")}
        description={t("users.description")}
        actions={
          <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={rows.length === 0}>
            {t("act.exportCsv")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input
            icon={<Search className="size-4" />}
            placeholder={t("users.searchPlaceholder")}
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>
        <Select className="sm:w-40" value={filter.role ?? ""} onChange={(e) => setParam("role", e.target.value)}>
          <option value="">{t("users.filter.allRoles")}</option>
          {FILTER_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </Select>
        <Select className="sm:w-40" value={filter.kyc ?? ""} onChange={(e) => setParam("kyc", e.target.value)}>
          <option value="">{t("users.filter.anyKyc")}</option>
          {KYC_STATUSES.map((k) => (
            <option key={k} value={k}>
              {kycLabel(k)}
            </option>
          ))}
        </Select>
        <Select
          className="sm:w-36"
          value={params.get("blocked") ?? ""}
          onChange={(e) => setParam("blocked", e.target.value)}
        >
          <option value="">{t("users.filter.anyStatus")}</option>
          <option value="1">{t("users.filter.blockedOnly")}</option>
        </Select>
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          onRowClick={(u) => openUser(u.id)}
          loading={list.isLoading}
          empty={
            <EmptyState
              icon={<UsersIcon className="size-5" />}
              title={t("users.empty.title")}
              description={q ? t("users.empty.searchHint") : t("users.empty.filterHint")}
            />
          }
          footer={
            <LoadMore
              shown={rows.length}
              hasMore={!!list.hasNextPage}
              loading={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
            />
          }
        />
      )}
    </>
  );
}
