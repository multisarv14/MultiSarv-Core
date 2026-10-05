import { Download, ListChecks, MapPin, Zap } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { TASK_STATUSES, type Task, type TaskStatus } from "@/api/types";
import { DataTable, ErrorState, LoadMore, PageHeader, type Column } from "@/components/ui/data";
import { Badge, Button, EmptyState, Select } from "@/components/ui/primitives";
import { TaskBadge, taskLabel } from "@/components/ui/status";
import { useTasks } from "@/hooks/queries";
import { useDrawerParam } from "@/hooks/useDrawer";
import { t } from "@/i18n";
import { ago, money } from "@/lib/format";
import { downloadCsv } from "@/lib/utils";

type Filter = TaskStatus | "live" | "";

export function Tasks() {
  const [params, setParams] = useSearchParams();
  const [, openTask] = useDrawerParam("task");
  const status = (params.get("status") ?? "") as Filter;
  const list = useTasks(status || undefined);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const setStatus = (v: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v) n.set("status", v);
      else n.delete("status");
      return n;
    });

  const columns: Column<Task>[] = [
    {
      key: "task",
      header: t("tasks.col.task"),
      cell: (task) => (
        <div className="min-w-0 max-w-xs">
          <p className="flex items-center gap-1.5 truncate font-medium">
            {task.isUrgent && <Zap className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            {task.title}
          </p>
          <p className="truncate text-xs text-muted">
            {task.categoryName}
            {task.location.city && (
              <>
                {" · "}
                <MapPin className="-mt-0.5 inline size-3" /> {task.location.city}
              </>
            )}
          </p>
        </div>
      ),
    },
    { key: "status", header: t("tasks.col.status"), cell: (task) => <TaskBadge status={task.status} /> },
    {
      key: "budget",
      header: t("tasks.col.budget"),
      cell: (task) => <span className="font-medium tabular">{money(task.budget)}</span>,
    },
    {
      key: "customer",
      header: t("tasks.col.customer"),
      hideSm: true,
      cell: (task) => <span className="text-sm">{task.customerName}</span>,
    },
    {
      key: "partner",
      header: t("tasks.col.partner"),
      hideSm: true,
      cell: (task) =>
        task.workerName ? (
          <span className="flex items-center gap-1.5 text-sm">
            {task.workerName}
            {task.workerIsEmployee && <Badge tone="cyan">{t("tasks.employee")}</Badge>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "created",
      header: t("tasks.col.posted"),
      hideSm: true,
      cell: (task) => <span className="text-muted">{ago(task.createdAt)}</span>,
    },
  ];

  const exportCsv = () =>
    downloadCsv(
      "tasks.csv",
      rows.map((task) => ({
        id: task.id,
        title: task.title,
        category: task.categoryName,
        status: task.status,
        budget: task.budget,
        customer: task.customerName,
        partner: task.workerName ?? "",
        city: task.location.city ?? "",
        createdAt: task.createdAt,
      })),
    );

  return (
    <>
      <PageHeader
        title={t("nav.tasks")}
        description={t("tasks.desc")}
        actions={
          <>
            <Select className="min-w-0 flex-1 sm:w-44 sm:flex-none" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("tasks.filter.all")}</option>
              <option value="live">{t("tasks.filter.live")}</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {taskLabel(s)}
                </option>
              ))}
            </Select>
            <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={rows.length === 0}>
              {t("tasks.export")}
            </Button>
          </>
        }
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(task) => task.id}
          onRowClick={(task) => openTask(task.id)}
          loading={list.isLoading}
          empty={
            <EmptyState
              icon={<ListChecks className="size-5" />}
              title={t("tasks.empty.title")}
              description={t("tasks.empty.desc")}
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
