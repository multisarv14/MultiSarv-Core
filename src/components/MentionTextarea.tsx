import { useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from "react";

import { Avatar, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** `@` lihila ki yadi — nivadla ki `@Naav ` text madhe. Server pan mentions tapasto. */

export interface MentionPerson {
  uid: string;
  name: string;
}

/** Cursor chya mage `@…` (shabdachya survatila). */
const MENTION_AT = /(?:^|\s)@([^\s@]{0,30})$/;

/** Text madhe `@Naav` asnare (pathavtana). */
export const mentionsIn = (text: string, people: MentionPerson[]) => people.filter((p) => text.includes(`@${p.name}`)).map((p) => p.uid);

export function MentionTextarea({
  value,
  onChange,
  people,
  onKeyDown,
  className,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
  people: MentionPerson[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!at) return [];
    const q = at.query.toLowerCase();
    return people.filter((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))).slice(0, 6);
  }, [at, people]);

  const detect = (v: string, caret: number) => {
    const m = MENTION_AT.exec(v.slice(0, caret));
    setAt(m ? { start: caret - m[1].length - 1, query: m[1] } : null);
    setActive(0);
  };

  const pick = (p: MentionPerson) => {
    if (!at) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const tag = `@${p.name} `;
    onChange(value.slice(0, at.start) + tag + value.slice(caret));
    setAt(null);
    const pos = at.start + tag.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        return setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        return pick(matches[active] ?? matches[0]);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        return setAt(null);
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={ref}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setAt(null)}
        onKeyDown={keys}
      />
      {matches.length > 0 && (
        <ul role="listbox" className="animate-pop absolute top-full left-0 z-20 mt-1 w-[min(18rem,100%)] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-pop">
          {matches.map((p, i) => (
            <li key={p.uid}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm", i === active ? "bg-accent/10" : "hover:bg-surface-2")}
              >
                <Avatar name={p.name} seed={p.uid} size="sm" />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Text — `@Naav` (mention) highlight. */
export function MentionText({ text, people, me }: { text: string; people: MentionPerson[]; me?: string }) {
  const tags = people.map((p) => ({ ...p, tag: `@${p.name}` })).sort((a, b) => b.tag.length - a.tag.length);
  if (!tags.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest) {
    let best: (typeof tags)[number] & { at: number } = null!;
    for (const x of tags) {
      const pos = rest.indexOf(x.tag);
      if (pos >= 0 && (!best || pos < best.at)) best = { ...x, at: pos };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.at) out.push(rest.slice(0, best.at));
    out.push(
      <span key={i++} className={cn("rounded px-0.5 font-semibold text-accent", best.uid === me && "bg-accent/15")}>
        {best.tag}
      </span>,
    );
    rest = rest.slice(best.at + best.tag.length);
  }
  return <>{out}</>;
}
