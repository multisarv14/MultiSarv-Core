import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { toDate } from "@/context/session";
import { callCore, core, errorMessage } from "@/lib/firebase";

/** Core `ceoTasks` — CEO agent la dilele commands. Writes `ceoCommand` / `ceoAction` ani Mac varcha runner. */
export type CeoStatus =
  | "routing"
  | "needsProject"
  | "working"
  | "preview"
  | "deploying"
  | "deployed"
  | "releasing"
  | "rejected"
  | "failed";

export type CeoAction = "pick" | "changes" | "approve" | "reject" | "apk" | "live";

/** Runner kaam karat aahe — buttons band. */
export const CEO_BUSY: CeoStatus[] = ["routing", "working", "deploying", "releasing"];

export interface CeoProject {
  id: string;
  name: string;
  type: "web" | "mobile" | "webMobile" | "backend";
  context: string;
  branch: string;
  web: boolean;
  mobile: boolean;
}

export interface CeoTask {
  id: string;
  command: string;
  projectId: string | null;
  status: CeoStatus;
  /** Runner ne ajun uchalli nahi. */
  waiting: boolean;
  match: { confidence: number; reason: string; candidates: string[] } | null;
  previewUrl: string | null;
  apkUrl: string | null;
  progress: string | null;
  cost: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CeoEvent {
  id: string;
  role: "you" | "ceo" | "system";
  text: string | null;
  action: CeoAction | null;
  projectId: string | null;
  link: string | null;
  error: boolean;
  at: Date | null;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

const toTask = (id: string, d: Record<string, unknown>): CeoTask => ({
  id,
  command: String(d.command ?? ""),
  projectId: str(d.projectId),
  status: (d.status as CeoStatus) ?? "routing",
  waiting: d.needsRunner === true,
  match: (d.match as CeoTask["match"]) ?? null,
  previewUrl: str(d.previewUrl),
  apkUrl: str(d.apkUrl),
  progress: str(d.progress),
  cost: Number(d.cost ?? 0),
  createdAt: toDate(d.createdAt),
  updatedAt: toDate(d.updatedAt),
});

/** Rules deploy nastil tar permission-denied — chupchap rikama nako, toast dakhva. */
const showError = (err: unknown) => toast.error(errorMessage(err), { id: "ceo-live" });

function useLive<T>(subscribe: (set: (v: T) => void) => () => void, deps: unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    setValue(null);
    return subscribe(setValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export const useCeoProjects = () =>
  useLive<CeoProject[]>(
    (set) =>
      onSnapshot(collection(core().db, "ceoProjects"), (snap) =>
        set(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CeoProject, "id">) })).sort((a, b) => a.name.localeCompare(b.name))),
        showError,
      ),
    [],
  );

export const useCeoTasks = () =>
  useLive<CeoTask[]>(
    (set) =>
      onSnapshot(query(collection(core().db, "ceoTasks"), orderBy("createdAt", "desc"), limit(100)), (snap) =>
        set(snap.docs.map((d) => toTask(d.id, d.data()))),
        showError,
      ),
    [],
  );

export const useCeoEvents = (taskId: string) =>
  useLive<CeoEvent[]>(
    (set) =>
      onSnapshot(query(collection(core().db, "ceoTasks", taskId, "events"), orderBy("at", "asc")), (snap) =>
        set(
          snap.docs.map((d) => {
            const e = d.data();
            return {
              id: d.id,
              role: e.role,
              text: str(e.text),
              action: (e.action as CeoAction) ?? null,
              projectId: str(e.projectId),
              link: str(e.link),
              error: e.error === true,
              at: toDate(e.at),
            };
          }),
        ),
        showError,
      ),
    [taskId],
  );

/** Runner cha heartbeat (30s) — 90s peksha juna = offline. */
export function useCeoRunner() {
  const runner = useLive<{ at: Date | null; host: string; busy: string | null }>(
    (set) =>
      onSnapshot(doc(core().db, "ceoRunner", "main"), (snap) => {
        const d = snap.data() ?? {};
        set({ at: toDate(d.at), host: String(d.host ?? ""), busy: str(d.busy) });
      }, showError),
    [],
  );
  const [nowMs, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return runner && { ...runner, online: !!runner.at && nowMs - runner.at.getTime() < 90_000 };
}

export const sendCeoCommand = (command: string, projectId: string | null) =>
  callCore<{ id: string }>("ceoCommand", { command, projectId });

export const ceoAction = (taskId: string, action: CeoAction, extra: { text?: string; projectId?: string } = {}) =>
  callCore("ceoAction", { taskId, action, ...extra });
