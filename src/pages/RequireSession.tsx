import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Spinner } from "@/components/ui/primitives";
import { useCompanyFavicon } from "@/context/company";
import { useProjectsLoaded } from "@/context/projects";
import { canModule, isSuper, useSession, type ModuleKey } from "@/context/session";

/** Core login nasel tar `/login` (parat yayla `from`). */
export function RequireSession() {
  const session = useSession();
  const location = useLocation();
  const projectsLoaded = useProjectsLoaded();
  if (session.status === "loading" || (session.status === "ready" && !projectsLoaded)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (session.status !== "ready") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <>
      <FaviconSync />
      <Outlet />
    </>
  );
}

/** Login nantarch — company profile vachayla auth lagto. */
function FaviconSync() {
  useCompanyFavicon();
  return null;
}

/** Fakt super admin (finance menus, Settings). */
export function RequireSuper() {
  const session = useSession();
  if (session.status !== "ready" || !isSuper(session.profile)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Master module (Client / Dev Tickets) — Module Access madhe "view" asel tar. */
export function RequireModule({ module }: { module: ModuleKey }) {
  const session = useSession();
  if (session.status !== "ready" || !canModule(session.profile, module, "view")) return <Navigate to="/" replace />;
  return <Outlet />;
}
