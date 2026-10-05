import { onIdTokenChanged, signInWithCustomToken, signOut, type User as FbUser } from "firebase/auth";
import { useEffect, useState } from "react";

import type { ProjectDef } from "@/config/projects";
import { callCore, errorMessage, services } from "@/lib/firebase";

import { projectMenus, useSession } from "./session";

export type AuthState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "noAccess" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "admin"; user: FbUser; menus: string[] };

/** Ekach project sathi ekach token request (home cards + gate ekdach mount hotat). */
const inflight = new Map<string, Promise<void>>();

function connect(project: ProjectDef): Promise<void> {
  const hit = inflight.get(project.id);
  if (hit) return hit;
  const run = callCore<{ token: string }>("getProjectToken", { projectId: project.id })
    .then(({ token }) => signInWithCustomToken(services(project).auth, token))
    .then(() => undefined)
    .finally(() => inflight.delete(project.id));
  inflight.set(project.id, run);
  return run;
}

const sameMenus = (a: unknown, b: string[]) =>
  Array.isArray(a) && [...a].sort().join() === [...b].sort().join();

/**
 * Project madhe silent login — core admin la access asel tar `getProjectToken`
 * ne custom token gheun `signInWithCustomToken`. Phone OTP nahi.
 * Super admin ne menus badalle ki token punha gheto (claims nehmi taje).
 */
export function useProjectAuth(project: ProjectDef | undefined): AuthState {
  const session = useSession();
  const profile = session.status === "ready" ? session.profile : null;
  const menus = project ? projectMenus(profile, project.id) : null;
  const menusKey = menus?.join() ?? "";
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!project?.firebase) return setState({ status: "unconfigured" });
    if (!profile) return setState({ status: "loading" });
    const { auth } = services(project);
    const wanted = menusKey ? menusKey.split(",") : null;
    if (!wanted) {
      setState({ status: "noAccess" });
      if (auth.currentUser) signOut(auth).catch(() => {});
      return;
    }

    let tries = 0;
    let alive = true;
    const fail = (err: unknown) =>
      alive && setState({ status: "error", message: errorMessage(err), retry: () => setAttempt((n) => n + 1) });

    const stop = onIdTokenChanged(auth, async (user) => {
      try {
        if (user && user.uid === `ms_${profile.uid}`) {
          const { claims } = await user.getIdTokenResult();
          // Server cha token = khara access; client profile juna asla tari ekdach punha magto.
          if (claims.admin === true && (sameMenus(claims.menus, wanted) || tries > 0)) {
            const granted = Array.isArray(claims.menus) ? (claims.menus as string[]) : ["*"];
            return alive && setState({ status: "admin", user, menus: granted });
          }
        }
        // Session revoke zala (access badalla) tar punha — pan loop nako.
        if (++tries > 3) return fail(new Error("token"));
        if (alive) setState({ status: "loading" });
        await connect(project);
      } catch (err) {
        if ((err as { code?: string })?.code?.includes("permission-denied")) {
          return alive && setState({ status: "noAccess" });
        }
        fail(err);
      }
    });
    return () => {
      alive = false;
      stop();
    };
    // `profile` object pratyek snapshot la navin — uid ani menus purese.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, profile?.uid, menusKey, attempt]);

  return state;
}
