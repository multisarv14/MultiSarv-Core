import { ImageOff, ZoomIn } from "lucide-react";
import { useState } from "react";

import { useKycImages } from "@/hooks/queries";
import { t } from "@/i18n";

import { Lightbox } from "./ui/overlay";
import { Skeleton } from "./ui/primitives";

/** KYC front / back — admin la storage.rules madhe read access aahe. */
export function KycImages({ uid }: { uid: string }) {
  const { data, isLoading } = useKycImages(uid);
  const [zoom, setZoom] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 gap-3">
      {(["front", "back"] as const).map((side) => {
        const src = data?.[side];
        const label = side === "front" ? t("users.kyc.front") : t("users.kyc.back");
        return (
          <div key={side}>
            <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
            {isLoading ? (
              <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            ) : src ? (
              <button
                onClick={() => setZoom(src)}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-surface-2"
              >
                <img
                  src={src}
                  alt={t("users.kyc.imageAlt", { side: label })}
                  loading="lazy"
                  className="size-full object-cover transition group-hover:scale-105"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                  <ZoomIn className="size-5" />
                </span>
              </button>
            ) : (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted">
                <ImageOff className="size-4" />
                {t("users.kyc.notUploaded")}
              </div>
            )}
          </div>
        );
      })}
      <Lightbox src={zoom} onClose={() => setZoom(null)} alt={t("users.kyc.documentAlt")} />
    </div>
  );
}
