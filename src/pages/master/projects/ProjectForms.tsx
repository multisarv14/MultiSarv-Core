import { AlertTriangle, Check, CheckCircle2, FileJson, KeyRound, Link2, Plug, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { Drawer } from "@/components/ui/overlay";
import { Button, Input, Label, Textarea } from "@/components/ui/primitives";
import type { ProjectDef } from "@/config/projects";
import { t } from "@/i18n";
import { callCore, errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

// ── Connect ──────────────────────────────────────────────────────────

/** `const firebaseConfig = { apiKey: "…", … }` kinva JSON — donhi chaltat. */
function parseWebConfig(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/["']?(\w+)["']?\s*:\s*["'`]([^"'`]+)["'`]/g)) out[m[1]] = m[2].trim();
  return out.apiKey && out.projectId ? out : null;
}

interface KeyInfo {
  raw: string;
  projectId: string;
  email: string;
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="animate-rise relative pl-10" style={{ ["--i" as string]: n }}>
      <span
        className={cn(
          "absolute top-0 left-0 flex size-7 items-center justify-center rounded-full text-xs font-bold transition",
          done ? "bg-emerald-500 text-white" : "bg-accent/15 text-accent",
        )}
      >
        {done ? <Check className="size-4" /> : n}
      </span>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {children}
    </section>
  );
}

/** Firebase web config + service account JSON — NOAI sarkhach project jodne. */
export function ConnectDrawer({ project, onClose }: { project: ProjectDef | null; onClose: () => void }) {
  const [configText, setConfigText] = useState("");
  const [key, setKey] = useState<KeyInfo | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [databaseId, setDatabaseId] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Key memory madhe jast vel nako — drawer band zala ki visra.
    setConfigText("");
    setKey(null);
    setKeyError(null);
    // SocietySarv cha data named DB madhe; NOAI sarkhe `(default)` (rikama).
    setDatabaseId(project?.databaseId ?? (project?.template === "society" ? "societysarv-app-db" : ""));
  }, [project?.id, project?.databaseId, project?.template]);

  const dbValid = !databaseId.trim() || databaseId.trim() === "(default)" || /^[a-z][a-z0-9-]{3,62}$/.test(databaseId.trim());

  const config = parseWebConfig(configText);
  const mismatch = !!config && !!key && config.projectId !== key.projectId;
  const ready = !!config && !!key && !mismatch && dbValid;

  const readKey = async (f: File | undefined) => {
    setKeyError(null);
    setKey(null);
    if (!f) return;
    try {
      const raw = await f.text();
      const j = JSON.parse(raw);
      if (j.type !== "service_account" || !j.private_key || !j.project_id) throw new Error();
      setKey({ raw, projectId: j.project_id, email: j.client_email });
    } catch {
      setKeyError(t("projects.connect.badKeyFile"));
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const connect = async () => {
    if (!project || !config || !key) return;
    setBusy(true);
    try {
      await callCore("connectProject", { id: project.id, firebase: config, serviceAccount: key.raw, databaseId: databaseId.trim() });
      toast.success(t("projects.toast.connected", { name: project.name }));
      setKey(null);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!project}
      onClose={busy ? () => {} : onClose}
      width="max-w-2xl"
      title={
        <span className="inline-flex items-center gap-2" style={{ ["--accent" as string]: project?.accent }}>
          {project && <ProjectMark project={project} size="sm" />}
          {t("projects.connect.title", { name: project?.name ?? "" })}
        </span>
      }
      subtitle={t("projects.connect.subtitle")}
    >
      <div className="space-y-7 pb-24">
        <Step n={1} title={t("projects.connect.step1")} done={!!config}>
          <p className="mb-2 text-xs leading-relaxed text-muted">{t("projects.connect.step1Hint")}</p>
          <Textarea
            className="min-h-40 font-mono text-xs"
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            placeholder={'const firebaseConfig = {\n  apiKey: "AIza…",\n  authDomain: "…firebaseapp.com",\n  projectId: "…",\n  storageBucket: "…",\n  messagingSenderId: "…",\n  appId: "1:…:web:…"\n};'}
          />
          {configText && !config && <p className="mt-1.5 text-xs text-rose-500">{t("projects.connect.badConfig")}</p>}
          {config && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> {t("projects.connect.configOk", { id: config.projectId })}
            </p>
          )}
          <div className="mt-4">
            <Label hint={dbValid ? t("projects.connect.databaseHint") : <span className="text-rose-500">{t("core.err.badDatabaseId")}</span>}>
              {t("projects.connect.database")}
            </Label>
            <Input className="font-mono" value={databaseId} placeholder="(default)" onChange={(e) => setDatabaseId(e.target.value)} />
          </div>
        </Step>

        <Step n={2} title={t("projects.connect.step2")} done={!!key && !mismatch}>
          <p className="mb-2 text-xs leading-relaxed text-muted">{t("projects.connect.step2Hint")}</p>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => readKey(e.target.files?.[0])} />
          {key ? (
            <div className={cn("flex items-center gap-3 rounded-xl border p-3", mismatch ? "border-rose-500/40 bg-rose-500/5" : "border-emerald-500/40 bg-emerald-500/5")}>
              <FileJson className={cn("size-5 shrink-0", mismatch ? "text-rose-500" : "text-emerald-500")} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold">{key.projectId}</p>
                <p className="truncate text-[11px] text-muted">{key.email}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
                {t("projects.connect.change")}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="group flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2/40 px-4 py-6 text-sm text-muted transition hover:border-accent/50 hover:text-text"
            >
              <Upload className="size-6 transition group-hover:-translate-y-0.5 group-hover:text-accent" />
              {t("projects.connect.pickKey")}
            </button>
          )}
          {keyError && <p className="mt-1.5 text-xs text-rose-500">{keyError}</p>}
          {mismatch && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-rose-500">
              <AlertTriangle className="size-3.5" /> {t("projects.connect.mismatch", { a: config!.projectId, b: key!.projectId })}
            </p>
          )}
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted">
            <KeyRound className="size-3" /> {t("projects.connect.keySafe")}
          </p>
        </Step>

        <Step n={3} title={t("projects.connect.step3")} done={false}>
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
            <li>• {t("projects.connect.check1")}</li>
            <li>• {t("projects.connect.check2")}</li>
            <li>• {t("projects.connect.check3")}</li>
          </ul>
        </Step>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 border-t border-border bg-surface/90 px-5 py-3 backdrop-blur">
        <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-muted">
          <Link2 className="size-3.5" /> {t("projects.connect.footer")}
        </span>
        <Button onClick={onClose} disabled={busy}>
          {t("act.cancel")}
        </Button>
        <Button variant="primary" loading={busy} disabled={!ready} onClick={connect} icon={<Plug className="size-4" />}>
          {t("projects.connect.submit")}
        </Button>
      </div>
    </Drawer>
  );
}
