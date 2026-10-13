import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import type { Society } from "@/api/society";
import type { ProjectDef } from "@/config/projects";
import { useProject } from "@/context/project";

/**
 * SocietySarv madhe anek societies (`societies/{code}`) — panel ek nivadlelya society var kaam karto.
 * Nivad browser madhe lakshat (fakt soy sathi), shell `SocietyContext` deto.
 */
interface SocietyCtx {
  societies: Society[];
  current: Society | null;
  select: (code: string) => void;
}

export const SocietyContext = createContext<SocietyCtx | null>(null);

export function useSociety(): SocietyCtx {
  const ctx = useContext(SocietyContext);
  if (!ctx) throw new Error("useSociety outside SocietyShell");
  return ctx;
}

const storeKey = (projectId: string) => `ms-society-${projectId}`;

export function savedSociety(projectId: string): string | null {
  try {
    return localStorage.getItem(storeKey(projectId));
  } catch {
    return null;
  }
}

export function saveSociety(projectId: string, code: string) {
  try {
    localStorage.setItem(storeKey(projectId), code);
  } catch {
    /* private mode — fakt ya session sathi */
  }
}

/**
 * Nivadlelya society chi query. Key `[project.id, "soc", code, name]` — header cha Refresh
 * (`[project.id]`) sagla punha load karto.
 */
export function useSocietyQuery<T>(name: string, fn: (p: ProjectDef, code: string) => Promise<T>) {
  const { project } = useProject();
  const { current } = useSociety();
  const code = current?.code ?? "";
  return useQuery({
    queryKey: [project.id, "soc", code, name],
    queryFn: () => fn(project, code),
    enabled: !!code,
    staleTime: 30_000,
  });
}

/** `IN_PROGRESS` → "In progress" (app enum strings). */
export const enumLabel = (s: string) => {
  const x = s.toLowerCase().replace(/_/g, " ").trim();
  return x ? x[0].toUpperCase() + x.slice(1) : "—";
};
