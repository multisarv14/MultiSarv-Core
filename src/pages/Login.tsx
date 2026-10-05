import {
  ArrowLeft,
  Banknote,
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  Mail,
  MailCheck,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
} from "lucide-react";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Backdrop } from "@/components/layout/Backdrop";
import { ProjectMark } from "@/components/layout/ProjectSwitcher";
import { rise } from "@/components/ui/motion";
import { Button, Input, Label } from "@/components/ui/primitives";
import { BUILT_IN_PROJECTS } from "@/config/projects";
import { resetPassword, signIn, signOutAll, useSession } from "@/context/session";
import { useTheme } from "@/context/theme";
import { LANGUAGES, t, useLang } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

/** Login aadhi bhasha nivdaychi — chhota segmented picker (Login + MasterHome). */
export function LanguagePicker({ className }: { className?: string }) {
  const [lang, setLang] = useLang();
  return (
    <div
      role="group"
      aria-label={t("shell.language")}
      className={cn("inline-flex gap-0.5 rounded-lg bg-surface-2 p-0.5", className)}
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          title={l.label}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium transition",
            lang === l.code ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

/** Madhe Multisarv, bhovti projects ani modules firtat. */
function Orbit() {
  const inner = BUILT_IN_PROJECTS.map((p) => <ProjectMark key={p.id} project={p} />);
  const outer: ReactNode[] = [Users, BadgeCheck, Banknote, ShieldCheck, Layers, UserCog].map((Icon, i) => (
    <span key={i} className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface/80 shadow-card backdrop-blur">
      <Icon className="size-4 text-accent" />
    </span>
  ));

  const ring = (items: ReactNode[], radius: number, speed: string, reverse = false) => (
    <div
      className={cn("absolute inset-0", reverse ? "animate-orbit-reverse" : "animate-orbit")}
      style={{ ["--orbit-speed" as string]: speed }}
    >
      {items.map((item, i) => {
        const angle = (360 / items.length) * i;
        return (
          <div
            key={i}
            className="absolute top-1/2 left-1/2"
            style={{ transform: `rotate(${angle}deg) translateX(${radius}px) rotate(-${angle}deg) translate(-50%, -50%)` }}
          >
            <div
              className={reverse ? "animate-orbit" : "animate-orbit-reverse"}
              style={{ ["--orbit-speed" as string]: speed }}
            >
              {item}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="relative mx-auto size-[300px]">
      <div className="absolute inset-[60px] rounded-full border border-dashed border-accent/30" />
      <div className="absolute inset-0 rounded-full border border-border" />
      {ring(inner.length ? inner : outer.slice(0, 2), 90, "22s")}
      {ring(outer, 150, "40s", true)}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="animate-pulse-ring absolute inset-0 rounded-2xl bg-accent/30" />
        <span className="relative flex size-16 items-center justify-center rounded-2xl bg-surface shadow-pop">
          <img src="/favicon.svg" alt="" className="size-9" />
        </span>
      </div>
    </div>
  );
}

function Hero() {
  const points = [
    { icon: KeyRound, text: t("access.hero.point1") },
    { icon: Layers, text: t("access.hero.point2") },
    { icon: ShieldCheck, text: t("access.hero.point3") },
  ];
  return (
    <div className="hidden flex-col justify-center gap-10 lg:flex">
      <div className="animate-rise">
        <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">
          <span className="text-shine">{t("access.hero.title")}</span>
        </h2>
        <p className="mt-3 max-w-md text-muted">{t("access.hero.subtitle")}</p>
      </div>
      <Orbit />
      <ul className="space-y-3">
        {points.map((p, i) => (
          <li key={i} className="animate-rise flex items-center gap-3 text-sm" style={rise(i + 2)}>
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <p.icon className="size-4" />
            </span>
            {p.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface-2 px-1">{children}</code>;
const fill = (text: string, nodes: Record<string, ReactNode>) =>
  text.split(/\{(\w+)\}/).map((part, i) => <Fragment key={i}>{i % 2 ? nodes[part] : part}</Fragment>);

/** Multisarv admin login — email + password (core). Ekda login, sagle projects. */
export function Login() {
  const session = useSession();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<"signIn" | "reset" | "sent">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);

  if (session.status === "ready") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  const oops = (err: unknown) => {
    setError(errorMessage(err));
    setShakes((n) => n + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "reset") {
        await resetPassword(email);
        setMode("sent");
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      oops(err);
    } finally {
      setBusy(false);
    }
  };

  const card = (() => {
    if (session.status === "unconfigured") {
      return (
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
            <Settings2 className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">{t("access.setup.title")}</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {fill(t("access.setup.desc"), { key: <Code>VITE_CORE_API_KEY</Code>, env: <Code>.env.local</Code> })}
          </p>
        </div>
      );
    }
    if (session.status === "noProfile") {
      return (
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">{t("access.noProfile.title")}</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t("access.noProfile.desc", { email: session.user.email ?? "" })}
          </p>
          <Button className="mt-5" size="sm" onClick={() => signOutAll()}>
            {t("shell.signOut")}
          </Button>
        </div>
      );
    }
    if (mode === "sent") {
      return (
        <div className="animate-pop text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <MailCheck className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">{t("access.reset.sentTitle")}</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t("access.reset.sentDesc", { email })}</p>
          <Button className="mt-5" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={() => setMode("signIn")}>
            {t("access.reset.back")}
          </Button>
        </div>
      );
    }
    return (
      <>
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === "reset" ? t("access.reset.title") : t("access.login.title")}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {mode === "reset" ? t("access.reset.subtitle") : t("access.login.subtitle")}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>{t("access.login.email")}</Label>
            <Input
              autoFocus
              type="email"
              required
              autoComplete="username"
              placeholder="you@company.com"
              icon={<Mail className="size-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </div>
          {mode === "signIn" && (
            <div>
              <Label
                hint={
                  <button type="button" className="text-accent hover:underline" onClick={() => setMode("reset")}>
                    {t("access.login.forgot")}
                  </button>
                }
              >
                {t("access.login.password")}
              </Label>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  icon={<Lock className="size-4" />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-text"
                  aria-label={show ? t("access.login.hide") : t("access.login.show")}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          )}
          <Button
            variant="primary"
            size="lg"
            className="group w-full justify-center bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 bg-[length:200%_auto] transition-[background-position] duration-500 hover:bg-right"
            loading={busy}
            icon={mode === "reset" ? <Mail className="size-4" /> : <LogIn className="size-4" />}
          >
            {mode === "reset" ? t("access.reset.send") : t("access.login.submit")}
          </Button>
          {mode === "reset" && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 text-xs text-muted hover:text-text"
              onClick={() => setMode("signIn")}
            >
              <ArrowLeft className="size-3.5" /> {t("access.reset.back")}
            </button>
          )}
        </form>
        {error && (
          <p key={shakes} className="animate-shake mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </>
    );
  })();

  return (
    <div className="relative min-h-full overflow-hidden">
      <Backdrop />
      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="text-sm font-semibold tracking-tight">Multisarv</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguagePicker />
            <Button variant="ghost" size="icon" onClick={toggle} title={t("shell.theme")}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-2">
          <Hero />
          <div className="mx-auto w-full max-w-sm">
            <div
              className={cn(
                "animate-pop relative overflow-hidden rounded-3xl border border-border bg-surface/80 p-7 shadow-pop backdrop-blur-xl",
                shakes > 0 && error && "ring-1 ring-rose-500/30",
              )}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
              {card}
            </div>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted">
              <ShieldCheck className="size-3.5" /> {t("access.login.footer")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
