import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { corpError, fieldLabel, kindSingular, optionLabel, saveCorpRecord, useCorpOptions, useCorpRefresh, type CorpField, type CorpKind, type CorpRow, type CorpSchema } from "@/api/corporate";
import { Modal } from "@/components/ui/overlay";
import { Button, Input, Label, Select, Textarea, Toggle } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

import { isVisible, patternExample, validate } from "./shared";

type Form = Record<string, unknown>;

/** Record → form (sagle fields, rikame ""). */
function toForm(kind: CorpKind, row: CorpRow | null | undefined, preset?: Form): Form {
  const out: Form = {};
  for (const f of kind.fields) {
    const v = row?.[f.key] ?? preset?.[f.key];
    out[f.key] = f.type === "bool" ? v === true : v == null ? "" : String(v);
  }
  // Navin record — status sarkhya required select la pahila option.
  if (!row) {
    for (const f of kind.fields) if (f.type === "select" && f.required && !out[f.key] && f.options?.length) out[f.key] = f.options[0].value;
  }
  return out;
}

function RefSelect({ field, value, onChange }: { field: CorpField; value: string; onChange: (v: string) => void }) {
  const { data, isLoading } = useCorpOptions(field.ref);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
      <option value="">{isLoading ? t("corp.loading") : t("corp.form.pick")}</option>
      {(data ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.title}
        </option>
      ))}
    </Select>
  );
}

function Control({ field, value, onChange, invalid }: { field: CorpField; value: unknown; onChange: (v: unknown) => void; invalid: boolean }) {
  const ring = invalid ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20" : "";
  const s = String(value ?? "");
  switch (field.type) {
    case "textarea":
      return <Textarea className={cn(ring, field.max && field.max > 5000 && "min-h-40")} value={s} maxLength={field.max ?? 5000} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <Select className={ring} value={s} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {optionLabel(field, o.value)}
            </option>
          ))}
        </Select>
      );
    case "bool":
      return (
        <div className="flex h-9 items-center">
          <Toggle checked={value === true} onChange={onChange} />
        </div>
      );
    case "ref":
      return <RefSelect field={field} value={s} onChange={onChange} />;
    case "date":
      return <Input type="date" className={ring} value={s} onChange={(e) => onChange(e.target.value)} />;
    case "number":
    case "money":
    case "percent":
      return (
        <Input
          inputMode="decimal"
          className={cn("tabular", ring)}
          value={s}
          placeholder={field.type === "money" ? "₹" : field.type === "percent" ? "%" : undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        />
      );
    default:
      return (
        <Input
          type={field.type === "email" ? "email" : "text"}
          inputMode={field.type === "phone" ? "tel" : undefined}
          className={cn(field.pattern && "font-mono uppercase", ring)}
          value={s}
          maxLength={field.max ?? 300}
          placeholder={field.pattern ? patternExample(field.pattern) : undefined}
          onChange={(e) => onChange(field.pattern ? e.target.value.toUpperCase() : e.target.value)}
        />
      );
  }
}

/** Navin / edit — schema varun form; server pan hech tapasto. */
export function RecordForm({
  open,
  onClose,
  kind,
  schema,
  row,
  preset,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  kind: CorpKind;
  schema: CorpSchema;
  row?: CorpRow | null;
  /** Navin record la adhich bharlele (shareholder varun "allotment"). */
  preset?: Form;
  onSaved?: (id: string) => void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(kind, row, preset));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const refresh = useCorpRefresh();

  useEffect(() => {
    if (open) {
      setForm(toForm(kind, row, preset));
      setTouched(false);
    }
  }, [open, kind.kind, row?.id]);

  const visible = kind.fields.filter((f) => isVisible(kind.kind, f, form));
  const errors = useMemo(
    () => Object.fromEntries(visible.map((f) => [f.key, validate(f, form[f.key], schema)]).filter(([, e]) => e)) as Record<string, string>,
    [visible, form, schema],
  );
  const valid = Object.keys(errors).length === 0;

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    try {
      const data: Form = {};
      for (const f of kind.fields) {
        const v = form[f.key];
        if (!isVisible(kind.kind, f, form)) data[f.key] = f.type === "bool" ? false : null;
        else if (["number", "money", "percent"].includes(f.type)) data[f.key] = v === "" ? null : Number(String(v).replace(/,/g, ""));
        else data[f.key] = typeof v === "string" ? v.trim() || null : v;
      }
      const res = await saveCorpRecord(kind.kind, kind.singleton ? null : (row?.id ?? null), data);
      toast.success(res.changed === false ? t("corp.form.noChanges") : t("corp.form.saved"));
      if (res.nextId) toast.info(t("corp.form.nextCreated"));
      await refresh();
      onSaved?.(res.id);
      onClose();
    } catch (err) {
      toast.error(corpError(err, kind));
    } finally {
      setSaving(false);
    }
  };

  const wide = (f: CorpField) => f.type === "textarea";

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      title={row || kind.singleton ? t("corp.form.edit", { name: kindSingular(kind) }) : t("corp.form.new", { name: kindSingular(kind) })}
      description={row?._title}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t("act.cancel")}
          </Button>
          <Button variant="primary" icon={<Check className="size-4" />} loading={saving} onClick={save}>
            {t("act.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {visible.map((f) => {
          const err = touched ? errors[f.key] : null;
          return (
            <div key={f.key} className={cn(wide(f) && "sm:col-span-2")}>
              <Label hint={err ? <span className="text-rose-500">{err}</span> : f.hint}>
                {fieldLabel(f)}
                {f.required && f.type !== "bool" && <span className="ml-0.5 text-rose-500">*</span>}
              </Label>
              <Control field={f} value={form[f.key]} invalid={!!err} onChange={(v) => setForm((x) => ({ ...x, [f.key]: v }))} />
            </div>
          );
        })}
      </div>
      {touched && !valid && <p className="mt-4 text-xs text-rose-500">{t("corp.form.fix")}</p>}
    </Modal>
  );
}
