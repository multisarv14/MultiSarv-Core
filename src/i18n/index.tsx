import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { LANG_CODES, type Lang } from "./define";
import { access } from "./messages/access";
import { chatGroups } from "./messages/chatGroups";
import { common } from "./messages/common";
import { coreAdmin } from "./messages/coreAdmin";
import { dashboard } from "./messages/dashboard";
import { finance } from "./messages/finance";
import { master } from "./messages/master";
import { notifications } from "./messages/notifications";
import { projectsMsgs } from "./messages/projects";
import { shell } from "./messages/shell";
import { society } from "./messages/society";
import { tasks } from "./messages/tasks";
import { ticketsMsgs } from "./messages/tickets";
import { users } from "./messages/users";

export type { Lang } from "./define";

const messages = { ...common, ...access, ...master, ...ticketsMsgs, ...projectsMsgs, ...shell, ...dashboard, ...users, ...tasks, ...finance, ...notifications, ...coreAdmin, ...society, ...chatGroups };
export type MsgKey = keyof typeof messages;
export type Params = Record<string, string | number>;

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिन्दी", short: "हिं" },
  { code: "mr", label: "मराठी", short: "मरा" },
  { code: "gu", label: "ગુજરાતી", short: "ગુ" },
];

const STORAGE_KEY = "ms-lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANG_CODES as readonly string[]).includes(saved)) return saved as Lang;
  } catch {
    /* private mode */
  }
  const nav = navigator.language?.split("-")[0];
  return (LANG_CODES as readonly string[]).includes(nav) ? (nav as Lang) : "en";
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

export const getLang = () => current;

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode — fakt ya session sathi */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Intl locale — Indian bhashet mahine/divas, pan anka nehmi 0-9 (tables sathi). */
export const intlLocale = () => `${current}-IN-u-nu-latn`;

/**
 * Translate. Hook nahi — components, hooks, toasts kuthehi vapra.
 * Bhasha badalli ki `I18nProvider` sagla tree remount karto, mhanun render
 * madhe vaparlela `t()` nehmi current bhashet.
 */
export function t(key: MsgKey, params?: Params): string {
  const entry = messages[key];
  const raw = entry ? entry[current] || entry.en : key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    params[name] === undefined ? whole : String(params[name]),
  );
}

/** Dynamic key (status, role…) — mahit nasel tar fallback. */
export function tMaybe(key: string, fallback: string, params?: Params): string {
  return key in messages ? t(key as MsgKey, params) : fallback;
}

export function useLang(): [Lang, (l: Lang) => void] {
  return [useSyncExternalStore(subscribe, getLang), setLang];
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang] = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  // Key badalli ki sagla UI navin bhashet punha render (query cache tasach rahto).
  return <Fragment key={lang}>{children}</Fragment>;
}
