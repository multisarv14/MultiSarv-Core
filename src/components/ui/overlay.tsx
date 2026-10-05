import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { t } from "@/i18n";
import { cn } from "@/lib/utils";

import { Button, Textarea } from "./primitives";

/** Esc ne band + body scroll lock — Modal / Drawer donhi sathi. */
function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-pop relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-pop sm:rounded-2xl",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-md",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-5xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 size-8" onClick={onClose} aria-label={t("act.close")}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-slide-in absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-bg shadow-pop",
          width,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{title}</div>
            {subtitle && <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("act.close")}>
              <X className="size-4" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/** Dhoka asnarya actions (block, payout fail, cancel) sathi confirm. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = t("act.confirm"),
  tone = "primary",
  loading,
  withReason,
  reasonPlaceholder,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger" | "success";
  loading?: boolean;
  withReason?: boolean;
  reasonPlaceholder?: string;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            {t("act.cancel")}
          </Button>
          <Button variant={tone} loading={loading} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
      {withReason && (
        <Textarea
          className="mt-3"
          autoFocus
          value={reason}
          maxLength={300}
          placeholder={reasonPlaceholder ?? t("word.reasonOptional")}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
    </Modal>
  );
}

/** Photo full-screen (KYC / proof). */
export function Lightbox({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  useOverlay(!!src, onClose);
  if (!src) return null;
  return createPortal(
    <div className="animate-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <img src={src} alt={alt ?? ""} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white hover:bg-white/10 hover:text-white"
        onClick={onClose}
        aria-label={t("act.close")}
      >
        <X className="size-5" />
      </Button>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white backdrop-blur hover:bg-white/20"
      >
        Open original
      </a>
    </div>,
    document.body,
  );
}
