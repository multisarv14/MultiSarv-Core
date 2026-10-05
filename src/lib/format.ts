import { intlLocale, t } from "@/i18n";

/** Bhasha badalli ki navin formatter — locale pramane cache. */
function memo<T>(make: (locale: string) => T): () => T {
  let key = "";
  let value: T;
  return () => {
    const locale = intlLocale();
    if (locale !== key) {
      key = locale;
      value = make(locale);
    }
    return value;
  };
}

const inrFull = memo(
  (l) =>
    new Intl.NumberFormat(l, {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }),
);

export const money = (n: number | null | undefined, currency = "INR") =>
  currency === "INR"
    ? inrFull().format(n ?? 0)
    : new Intl.NumberFormat(intlLocale(), { style: "currency", currency }).format(n ?? 0);

/** ₹1.2L / ₹3.4Cr — KPI cards sathi. */
export function moneyCompact(n: number | null | undefined): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return `₹${Math.round(v)}`;
}

export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString(intlLocale());

const dateFmt = memo((l) => new Intl.DateTimeFormat(l, { day: "numeric", month: "short", year: "numeric" }));
const dateTimeFmt = memo(
  (l) => new Intl.DateTimeFormat(l, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
);
const dayFmt = memo((l) => new Intl.DateTimeFormat(l, { day: "numeric", month: "short" }));

export const date = (d: Date | null | undefined) => (d ? dateFmt().format(d) : "—");
export const dateTime = (d: Date | null | undefined) => (d ? dateTimeFmt().format(d) : "—");
/** Chart axis — "12 Oct" / "12 ऑक्टो". */
export const dayLabel = (d: Date) => dayFmt().format(d);

const rtf = memo((l) => new Intl.RelativeTimeFormat(l, { numeric: "auto" }));

export function ago(d: Date | null | undefined): string {
  if (!d) return "—";
  const sec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return t("time.justNow");
  if (abs < 3600) return rtf().format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf().format(Math.round(sec / 3600), "hour");
  if (abs < 86400 * 30) return rtf().format(Math.round(sec / 86400), "day");
  return date(d);
}

/** camelCase status → "In Progress" */
export const humanize = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
