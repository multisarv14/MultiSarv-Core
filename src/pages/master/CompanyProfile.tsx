import { Building2, Check, Globe, ImagePlus, Mail, MapPin, Phone, ReceiptText, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { rise } from "@/components/ui/motion";
import { PageHeader } from "@/components/ui/data";
import { Button, Card, CardHeader, Input, Label, Skeleton, Textarea } from "@/components/ui/primitives";
import { EMPTY_COMPANY, saveCompany, useCompany, type CompanyProfile as Company } from "@/context/company";
import { useAdmin } from "@/context/session";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";
import { shrinkImage } from "@/lib/image";

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <Label hint={error ? <span className="text-rose-500">{error}</span> : hint}>{label}</Label>
      {children}
    </div>
  );
}

/** Settings → Company Profile: naav, logo, patta, samparka, GST / PAN. */
export function CompanyProfile() {
  const me = useAdmin();
  const saved = useCompany();
  const [form, setForm] = useState<Company>(EMPTY_COMPANY);
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  const set = <K extends keyof Company>(k: K, v: Company[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = !!saved && JSON.stringify(form) !== JSON.stringify(saved);

  const errors = {
    gstin: form.gstin && !GSTIN.test(form.gstin) ? t("master.company.badGstin") : null,
    pan: form.pan && !PAN.test(form.pan) ? t("master.company.badPan") : null,
    email: form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? t("core.err.badEmail") : null,
  };
  const valid = form.name.trim().length >= 2 && !errors.gstin && !errors.pan && !errors.email;

  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    try {
      set("logo", await shrinkImage(f));
    } catch {
      toast.error(t("master.company.logoType"));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as Company;
      await saveCompany(clean, me.uid);
      toast.success(t("master.company.saved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!saved) {
    return (
      <>
        <PageHeader title={t("master.nav.company")} description={t("master.company.subtitle")} />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("master.nav.company")}
        description={t("master.company.subtitle")}
        actions={
          <Button variant="primary" icon={<Check className="size-4" />} loading={saving} disabled={!dirty || !valid} onClick={save}>
            {t("act.save")}
          </Button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="animate-rise p-5 text-center lg:sticky lg:top-20">
          <button
            type="button"
            onClick={() => file.current?.click()}
            className="group relative mx-auto flex size-32 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-2/50 transition hover:border-accent/50"
          >
            {form.logo ? (
              <img src={form.logo} alt="" className="size-full object-contain p-2" />
            ) : (
              <ImagePlus className="size-8 text-muted transition group-hover:scale-110 group-hover:text-accent" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
              {t("master.company.changeLogo")}
            </span>
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
          <p className="mt-4 truncate text-base font-semibold">{form.name || t("master.company.namePlaceholder")}</p>
          <p className="truncate text-xs text-muted">{[form.city, form.state].filter(Boolean).join(", ") || "—"}</p>
          <p className="mt-3 text-[11px] text-muted">{t("master.company.logoHint")}</p>
          {form.logo && (
            <Button size="sm" variant="ghost" className="mt-2 text-rose-500" icon={<Trash2 className="size-3.5" />} onClick={() => set("logo", "")}>
              {t("master.company.removeLogo")}
            </Button>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="animate-rise" style={rise(1)}>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Building2 className="size-4" /> {t("master.company.basic")}</span>} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={t("master.company.name")}>
                  <Input value={form.name} maxLength={120} placeholder={t("master.company.namePlaceholder")} onChange={(e) => set("name", e.target.value)} />
                </Field>
              </div>
              <Field label={t("access.login.email")} error={errors.email}>
                <Input type="email" icon={<Mail className="size-4" />} value={form.email} maxLength={120} onChange={(e) => set("email", e.target.value)} placeholder="info@company.com" />
              </Field>
              <Field label={t("master.company.phone")}>
                <Input inputMode="tel" icon={<Phone className="size-4" />} value={form.phone} maxLength={20} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98XXXXXXXX" />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("master.company.website")}>
                  <Input icon={<Globe className="size-4" />} value={form.website} maxLength={200} onChange={(e) => set("website", e.target.value)} placeholder="https://company.com" />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="animate-rise" style={rise(2)}>
            <CardHeader title={<span className="inline-flex items-center gap-2"><MapPin className="size-4" /> {t("master.company.address")}</span>} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={t("master.company.street")}>
                  <Textarea className="min-h-20" value={form.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />
                </Field>
              </div>
              <Field label={t("master.company.city")}>
                <Input value={form.city} maxLength={60} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label={t("master.company.state")}>
                <Input value={form.state} maxLength={60} onChange={(e) => set("state", e.target.value)} />
              </Field>
              <Field label={t("master.company.pincode")}>
                <Input inputMode="numeric" value={form.pincode} maxLength={10} onChange={(e) => set("pincode", e.target.value.replace(/[^\d]/g, ""))} />
              </Field>
              <Field label={t("master.company.country")}>
                <Input value={form.country} maxLength={60} onChange={(e) => set("country", e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card className="animate-rise" style={rise(3)}>
            <CardHeader
              title={<span className="inline-flex items-center gap-2"><ReceiptText className="size-4" /> {t("master.company.tax")}</span>}
              subtitle={t("master.company.taxHint")}
            />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="GSTIN" error={errors.gstin}>
                <Input className="font-mono uppercase" value={form.gstin} maxLength={15} placeholder="27AAAAA0000A1Z5" onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
              </Field>
              <Field label="PAN" error={errors.pan}>
                <Input className="font-mono uppercase" value={form.pan} maxLength={10} placeholder="AAAAA0000A" onChange={(e) => set("pan", e.target.value.toUpperCase())} />
              </Field>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
