import { ArrowLeft, Bot, Download, ExternalLink, Rocket, Send, Smartphone, Trash2, Globe } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  CEO_BUSY,
  ceoAction,
  sendCeoCommand,
  useCeoEvents,
  useCeoProjects,
  useCeoRunner,
  useCeoTasks,
  type CeoAction,
  type CeoEvent,
  type CeoProject,
  type CeoStatus,
  type CeoTask,
} from "@/api/ceo";
import { PageHeader } from "@/components/ui/data";
import { rise } from "@/components/ui/motion";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Badge, Button, Card, EmptyState, Select, Skeleton, Spinner, Textarea, type Tone } from "@/components/ui/primitives";
import { t, type MsgKey } from "@/i18n";
import { ago, dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<CeoStatus, Tone> = {
  routing: "blue",
  needsProject: "amber",
  working: "blue",
  preview: "violet",
  deploying: "blue",
  deployed: "green",
  releasing: "blue",
  rejected: "neutral",
  failed: "red",
};

const StatusBadge = ({ status }: { status: CeoStatus }) => (
  <Badge tone={STATUS_TONE[status]} dot>
    {t(`ceo.status.${status}` as MsgKey)}
  </Badge>
);

const isBusy = (task: CeoTask) => task.waiting || CEO_BUSY.includes(task.status);

/** Super Admin → CEO agent: command dya, preview bagha, deploy / web live / APK. Phone var pan. */
export function Ceo() {
  const projects = useCeoProjects();
  const tasks = useCeoTasks();
  const runner = useCeoRunner();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("task");
  const selected = tasks?.find((x) => x.id === selectedId) ?? null;
  const select = (id: string | null) => setParams(id ? { task: id } : {}, { replace: !id });

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("master.nav.ceo")}
            <Badge tone="violet">{t("ceo.beta")}</Badge>
          </span>
        }
        description={t("ceo.subtitle")}
        actions={runner?.online && <Badge tone="green" dot>{t("ceo.runnerOnline", { host: runner.host })}</Badge>}
      />
      {runner && !runner.online && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {t("ceo.runnerOffline")}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className={cn("space-y-4", selected && "hidden lg:block")}>
          <Composer projects={projects ?? []} onSent={select} />
          <TaskList tasks={tasks} projects={projects ?? []} selectedId={selectedId} onSelect={select} />
        </div>
        <div className={cn(!selected && "hidden lg:block")}>
          {selected ? (
            <TaskDetail key={selected.id} task={selected} projects={projects ?? []} onBack={() => select(null)} />
          ) : (
            <Card>
              <EmptyState icon={<Bot className="size-5" />} title={t("ceo.select")} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Composer({ projects, onSent }: { projects: CeoProject[]; onSent: (id: string) => void }) {
  const [command, setCommand] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const r = await sendCeoCommand(command.trim(), projectId || null);
      setCommand("");
      onSent(r.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="animate-rise space-y-3 p-4">
      <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        <option value="">{t("ceo.autoProject")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Textarea
        rows={4}
        value={command}
        maxLength={4000}
        placeholder={t("ceo.placeholder")}
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && command.trim().length >= 3) send();
        }}
      />
      <Button variant="primary" className="w-full justify-center" icon={<Send className="size-4" />} loading={sending} disabled={command.trim().length < 3} onClick={send}>
        {t("ceo.send")}
      </Button>
    </Card>
  );
}

const projectName = (projects: CeoProject[], id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? id) : null);

function TaskList({
  tasks,
  projects,
  selectedId,
  onSelect,
}: {
  tasks: CeoTask[] | null;
  projects: CeoProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-border px-4 py-3 text-sm font-semibold">{t("ceo.tasks")}</p>
      {!tasks ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : !tasks.length ? (
        <EmptyState title={t("ceo.empty")} />
      ) : (
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {tasks.map((task, i) => (
            <li key={task.id} className="animate-rise" style={rise(i)}>
              <button
                className={cn("w-full px-4 py-3 text-left transition hover:bg-surface-2", task.id === selectedId && "bg-surface-2")}
                onClick={() => onSelect(task.id)}
              >
                <p className="line-clamp-2 text-sm">{task.command}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <StatusBadge status={task.status} />
                  {task.projectId && <Badge>{projectName(projects, task.projectId)}</Badge>}
                  <span title={dateTime(task.createdAt)}>{ago(task.createdAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Agent che uttar — ``` blocks (diff stat, errors) monospace madhe. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("```").map((part, i) =>
        i % 2 ? (
          <pre key={i} className="my-2 overflow-x-auto rounded-lg bg-surface-2 p-2 font-mono text-[11px] leading-relaxed">
            {part.replace(/^\w*\n/, "").trim()}
          </pre>
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {part.trim()}
          </span>
        ),
      )}
    </>
  );
}

function EventItem({ e, projects }: { e: CeoEvent; projects: CeoProject[] }) {
  if (e.role === "you") {
    const text =
      !e.action || e.action === "changes"
        ? e.text
        : e.action === "pick"
          ? t("ceo.act.pick", { name: projectName(projects, e.projectId) ?? "" })
          : t(`ceo.act.${e.action}` as MsgKey);
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm break-words whitespace-pre-wrap text-accent-fg">{text}</div>
      </li>
    );
  }
  if (e.role === "system") {
    return (
      <li className={cn("rounded-lg px-3 py-2 text-xs break-words", e.error ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "text-center text-muted")}>
        <Rich text={e.text ?? ""} />
      </li>
    );
  }
  return (
    <li className="flex gap-2">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Bot className="size-4" />
      </div>
      <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tl-sm border border-border bg-surface-2/50 px-3 py-2 text-sm break-words">
        <Rich text={e.text ?? ""} />
        {e.link && (
          <a href={e.link} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
            <Download className="size-4" /> {t("ceo.downloadApk")}
          </a>
        )}
      </div>
    </li>
  );
}

const LinkButton = ({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium hover:bg-surface-2 pointer-coarse:h-10"
  >
    {icon}
    {children}
  </a>
);

function TaskDetail({ task, projects, onBack }: { task: CeoTask; projects: CeoProject[]; onBack: () => void }) {
  const events = useCeoEvents(task.id);
  const project = projects.find((p) => p.id === task.projectId) ?? null;
  const busy = isBusy(task);
  const [acting, setActing] = useState<CeoAction | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "reject" | "live" | null>(null);
  const [changes, setChanges] = useState("");
  const [other, setOther] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [events?.length, task.progress]);

  const act = async (action: CeoAction, extra: { text?: string; projectId?: string } = {}) => {
    setActing(action);
    try {
      await ceoAction(task.id, action, extra);
      setConfirm(null);
      if (action === "changes") setChanges("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setActing(null);
    }
  };

  const canChange = !busy && ["preview", "failed", "deployed"].includes(task.status);
  const branch = project?.branch ?? "main";

  return (
    <Card className="animate-rise flex flex-col">
      <div className="flex items-start gap-2 border-b border-border p-4">
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={onBack} aria-label={t("ceo.back")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={task.status} />
            {project && <Badge tone="accent">{project.name}</Badge>}
          </div>
          <p className="mt-1.5 line-clamp-3 text-sm font-medium">{task.command}</p>
        </div>
      </div>

      <ul className="max-h-[55vh] min-h-40 space-y-3 overflow-y-auto p-4">
        {events?.map((e) => <EventItem key={e.id} e={e} projects={projects} />)}
        {busy && (
          <li className="flex gap-2 rounded-xl border border-dashed border-border p-3">
            <Spinner className="size-4 shrink-0" />
            <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
              {task.progress ?? (task.waiting ? t("ceo.waiting") : t(`ceo.status.${task.status}` as MsgKey))}
            </pre>
          </li>
        )}
        <div ref={end} />
      </ul>

      {!busy && (
        <div className="space-y-3 border-t border-border p-4">
          {task.status === "needsProject" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("ceo.pickProject")}</p>
              <div className="flex flex-wrap gap-2">
                {(task.match?.candidates ?? []).map((id) => (
                  <Button key={id} loading={acting === "pick"} onClick={() => act("pick", { projectId: id })}>
                    {projectName(projects, id)}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Select value={other} onChange={(e) => setOther(e.target.value)}>
                  <option value="">{t("ceo.otherProject")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Button variant="primary" disabled={!other} loading={acting === "pick"} onClick={() => act("pick", { projectId: other })}>
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {(task.previewUrl || task.apkUrl) && ["preview", "deployed"].includes(task.status) && (
            <div className="flex flex-wrap gap-2">
              {task.previewUrl && task.status === "preview" && (
                <LinkButton href={task.previewUrl} icon={<ExternalLink className="size-4" />}>
                  {t("ceo.openPreview")}
                </LinkButton>
              )}
              {task.apkUrl && (
                <LinkButton href={task.apkUrl} icon={<Download className="size-4" />}>
                  {t("ceo.downloadApk")}
                </LinkButton>
              )}
            </div>
          )}

          {task.status === "preview" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="success" icon={<Rocket className="size-4" />} onClick={() => setConfirm("approve")}>
                {t("ceo.approve")}
              </Button>
              <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("reject")}>
                {t("ceo.reject")}
              </Button>
            </div>
          )}
          {task.status === "failed" && (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("reject")}>
              {t("ceo.reject")}
            </Button>
          )}

          {task.status === "deployed" && (project?.web || project?.mobile) && (
            <div className="flex flex-wrap gap-2">
              {project.web && (
                <Button variant="primary" icon={<Globe className="size-4" />} onClick={() => setConfirm("live")}>
                  {t("ceo.live")}
                </Button>
              )}
              {project.mobile && (
                <Button icon={<Smartphone className="size-4" />} loading={acting === "apk"} onClick={() => act("apk")}>
                  {t("ceo.apk")}
                </Button>
              )}
            </div>
          )}

          {canChange && (
            <div className="flex items-end gap-2">
              <Textarea rows={2} value={changes} maxLength={4000} placeholder={t("ceo.changesPlaceholder")} onChange={(e) => setChanges(e.target.value)} />
              <Button
                variant="secondary"
                className="shrink-0"
                aria-label={t("ceo.changes")}
                title={t("ceo.changes")}
                loading={acting === "changes"}
                disabled={changes.trim().length < 3}
                onClick={() => act("changes", { text: changes.trim() })}
              >
                <Send className="size-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm === "approve"}
        onClose={() => setConfirm(null)}
        onConfirm={() => act("approve")}
        title={t("ceo.approve")}
        description={t("ceo.approveBody", { branch })}
        confirmLabel={t("ceo.approve")}
        tone="success"
        loading={acting === "approve"}
      />
      <ConfirmDialog
        open={confirm === "reject"}
        onClose={() => setConfirm(null)}
        onConfirm={() => act("reject")}
        title={t("ceo.reject")}
        description={t("ceo.rejectBody")}
        confirmLabel={t("ceo.reject")}
        tone="danger"
        loading={acting === "reject"}
      />
      <ConfirmDialog
        open={confirm === "live"}
        onClose={() => setConfirm(null)}
        onConfirm={() => act("live")}
        title={t("ceo.live")}
        description={t("ceo.liveBody", { branch })}
        confirmLabel={t("ceo.live")}
        loading={acting === "live"}
      />
    </Card>
  );
}
