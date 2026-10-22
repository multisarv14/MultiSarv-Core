import { collection, onSnapshot } from "firebase/firestore";
import { useSyncExternalStore } from "react";

import { BUILT_IN_PROJECTS, PROJECT_STATUSES, PROJECT_TEMPLATES, type ProjectDef } from "@/config/projects";
import { core } from "@/lib/firebase";

import { toDate } from "./session";

/**
 * Projects registry = code madhle (NOAI) + super admin ne add kelele (core `projects`).
 * Login nantar SessionProvider `startProjects()` karto; RequireSession load hoiparyant thambto.
 */
let dynamic: ProjectDef[] = [];
let all: ProjectDef[] = BUILT_IN_PROJECTS;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Overview fields — dynamic project ani built-in overlay donhi sathi. */
const details = (d: Record<string, unknown>): Partial<ProjectDef> => ({
  logo: (d.logo as string | null) ?? null,
  client: (d.client as string) ?? "",
  description: (d.description as string) ?? "",
  // Juna status (completed / cancelled) Firestore madhe tasach rahto; UI la "status nahi".
  status: PROJECT_STATUSES.find((s) => s === d.status),
  projectType: (d.projectType as ProjectDef["projectType"]) ?? undefined,
  startDate: (d.startDate as string | null) ?? null,
  endDate: (d.endDate as string | null) ?? null,
  manager: (d.manager as ProjectDef["manager"]) ?? null,
  team: (d.team as ProjectDef["team"]) ?? [],
  createdAt: toDate(d.createdAt),
  updatedAt: toDate(d.updatedAt),
  createdBy: typeof d.createdBy === "object" ? (d.createdBy as ProjectDef["createdBy"]) : null,
});

const toDef = (id: string, d: Record<string, unknown>): ProjectDef => ({
  ...details(d),
  id,
  name: String(d.name ?? id),
  tagline: String(d.tagline ?? ""),
  accent: String(d.accent ?? "#6366f1"),
  region: String(d.region ?? "asia-south1"),
  currency: "INR",
  phonePrefix: "+91",
  platformFeePercent: 10,
  firebase: d.connected === true && d.firebase ? (d.firebase as ProjectDef["firebase"]) : null,
  // Core `type` — juna / rikama = marketplace (NOAI sarkha).
  template: PROJECT_TEMPLATES.find((x) => x === d.type) ?? "marketplace",
  databaseId: typeof d.databaseId === "string" && d.databaseId ? d.databaseId : undefined,
  apiUrl: typeof d.apiUrl === "string" && d.apiUrl ? d.apiUrl : undefined,
  vapidKey: (d.vapidKey as string | null) ?? undefined,
  builtIn: false,
});

export function startProjects(): () => void {
  return onSnapshot(
    collection(core().db, "projects"),
    (snap) => {
      // `builtIn: true` doc = NOAI sarkhya built-in project chi overview mahiti (overlay).
      const overlay = new Map(snap.docs.filter((d) => d.get("builtIn") === true).map((d) => [d.id, d.data()]));
      dynamic = snap.docs
        .filter((d) => d.get("builtIn") !== true)
        .map((d) => toDef(d.id, d.data()))
        .sort((a, b) => a.name.localeCompare(b.name));
      const builtIn = BUILT_IN_PROJECTS.map((p) => {
        const o = overlay.get(p.id);
        if (!o) return p;
        return {
          ...p,
          ...details(o),
          name: (o.name as string) || p.name,
          tagline: (o.tagline as string) ?? p.tagline,
          accent: (o.accent as string) || p.accent,
          vapidKey: (o.vapidKey as string) || p.vapidKey,
        };
      });
      all = [...builtIn, ...dynamic];
      loaded = true;
      emit();
    },
    () => {
      loaded = true;
      emit();
    },
  );
}

export function resetProjects() {
  dynamic = [];
  all = BUILT_IN_PROJECTS;
  loaded = false;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getProjects = () => all;
export const findProject = (id: string | undefined) => all.find((p) => p.id === id);

/** Sagle projects (live). */
export const useProjects = () => useSyncExternalStore(subscribe, getProjects);
export const useProjectsLoaded = () => useSyncExternalStore(subscribe, () => loaded);

/** Tickets sathi — master panel swatah (Firebase project nahi). Core `MULTISARV_ID` sobat same. */
export const MULTISARV_PROJECT: ProjectDef = {
  id: "multisarv",
  name: "MultiSarv",
  tagline: "Master admin panel",
  accent: "#6366f1",
  region: "asia-south1",
  currency: "INR",
  phonePrefix: "+91",
  platformFeePercent: 0,
  firebase: null,
  builtIn: true,
};

export const findTicketProject = (id: string) => (id === MULTISARV_PROJECT.id ? MULTISARV_PROJECT : findProject(id));
