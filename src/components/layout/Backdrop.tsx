import { cn } from "@/lib/utils";

/**
 * Halnare rangit dhag + grid — login, gate ani purna panel maage.
 * `fixed` = scroll kela tari jagevar (shell madhe).
 */
export function Backdrop({ fixed }: { fixed?: boolean }) {
  return (
    <div className={cn("pointer-events-none inset-0 overflow-hidden", fixed ? "fixed -z-10" : "absolute")} aria-hidden>
      <div className="bg-grid absolute inset-0" />
      <div className="animate-aurora absolute -top-40 -left-32 size-[560px] rounded-full bg-indigo-500/25 blur-3xl" />
      <div
        className="animate-aurora absolute top-1/3 -right-40 size-[520px] rounded-full bg-cyan-400/20 blur-3xl"
        style={{ animationDelay: "-6s" }}
      />
      <div
        className="animate-aurora absolute -bottom-48 left-1/3 size-[480px] rounded-full bg-violet-500/20 blur-3xl"
        style={{ animationDelay: "-12s" }}
      />
    </div>
  );
}
