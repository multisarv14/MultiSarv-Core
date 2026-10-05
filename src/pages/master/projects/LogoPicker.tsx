import { Camera, ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { Button } from "@/components/ui/primitives";
import type { ProjectDef } from "@/config/projects";
import { t } from "@/i18n";
import { ImageError, shrinkImage } from "@/lib/image";
import { cn } from "@/lib/utils";

/** Mobile / touch var camera paryay (`capture`) — desktop var fakt file. */
const touch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Project logo — sadhyacha logo, Upload / Change, mobile var Camera, Remove,
 * ani save aadhi preview. `value` = data URL kinva null; `original` = saved logo.
 */
export function LogoPicker({
  project,
  value,
  original,
  onChange,
  disabled,
}: {
  project: ProjectDef;
  value: string | null;
  original: string | null;
  onChange: (logo: string | null) => void;
  disabled?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = value !== original;

  const pick = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    setBusy(true);
    try {
      onChange(await shrinkImage(f));
    } catch (err) {
      const reason = err instanceof ImageError ? err.reason : "read";
      setError(t(`projects.logo.err.${reason}`));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => file.current?.click()}
        className="group relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-2/50 transition hover:border-accent/50"
        style={{ ["--accent" as string]: project.accent }}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-muted" />
        ) : value ? (
          <img src={value} alt="" className="size-full bg-white object-contain p-2" />
        ) : (
          <ProjectMark project={{ ...project, logo: null }} size="xl" />
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
          {value ? t("projects.logo.change") : t("projects.logo.upload")}
        </span>
        {changed && <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-semibold text-white">{t("projects.logo.preview")}</span>}
      </button>

      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p className="text-sm font-semibold">{t("projects.logo.title")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("projects.logo.hint")}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button size="sm" icon={<ImagePlus className="size-3.5" />} disabled={disabled || busy} onClick={() => file.current?.click()}>
            {value ? t("projects.logo.change") : t("projects.logo.upload")}
          </Button>
          {touch() && (
            <Button size="sm" icon={<Camera className="size-3.5" />} disabled={disabled || busy} onClick={() => camera.current?.click()}>
              {t("projects.logo.camera")}
            </Button>
          )}
          {changed && (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={disabled || busy} onClick={() => onChange(original)}>
              {t("projects.logo.undo")}
            </Button>
          )}
          {value && (
            <Button size="sm" variant="ghost" className="text-rose-500" icon={<Trash2 className="size-3.5" />} disabled={disabled || busy} onClick={() => onChange(null)}>
              {t("projects.logo.remove")}
            </Button>
          )}
        </div>
        {error && <p className={cn("mt-2 text-xs text-rose-500")}>{error}</p>}
      </div>

      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
