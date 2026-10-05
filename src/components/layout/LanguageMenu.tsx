import { Check, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LANGUAGES, t, useLang } from "@/i18n";
import { cn } from "@/lib/utils";

/** Header madhla bhasha dropdown — EN / हिं / मरा / ગુ. */
export function LanguageMenu() {
  const [lang, setLang] = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === lang)!;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t("shell.language")}
        aria-label={t("shell.language")}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-text"
      >
        <Languages className="size-4" />
        {current.short}
      </button>
      {open && (
        <div className="animate-pop absolute top-full right-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-pop">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setOpen(false);
                setLang(l.code);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface-2",
                l.code === lang && "text-accent",
              )}
            >
              <span className="w-8 text-[11px] font-semibold text-muted">{l.short}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <Check className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
