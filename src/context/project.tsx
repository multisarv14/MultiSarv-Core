import type { User as FbUser } from "firebase/auth";
import { createContext, useContext } from "react";

import type { MenuKey } from "@/components/layout/nav";
import type { ProjectDef } from "@/config/projects";

interface ProjectCtx {
  project: ProjectDef;
  /** Project madhla signed-in panel user (`ms_<core uid>`). */
  admin: FbUser;
  /** Token madhle menus (`*` = sagle). */
  menus: string[];
}

export const ProjectContext = createContext<ProjectCtx | null>(null);

/** Current project (URL `/p/:projectId`) ani signed-in admin. */
export function useProject(): ProjectCtx {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject outside ProjectContext");
  return ctx;
}

export const allows = (menus: string[], menu: MenuKey) => menus.includes("*") || menus.includes(menu);

/** Ya admin la ha menu (ani tyatli actions) aahe ka. */
export function useCan(): (menu: MenuKey) => boolean {
  const { menus } = useProject();
  return (menu) => allows(menus, menu);
}
