import { useEffect, useRef, useState } from "react";

import { t, type MsgKey } from "@/i18n";
import { cn } from "@/lib/utils";

/** Common emojis (WhatsApp sarkhe gat) — library nako, halka. */
const GROUPS: { key: MsgKey; icon: string; list: string }[] = [
  {
    key: "emoji.smileys",
    icon: "😀",
    list: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬",
  },
  {
    key: "emoji.gestures",
    icon: "👍",
    list: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫡 🫶 🙋 🙆 🙅 🤷 🤦 💁 🙇",
  },
  {
    key: "emoji.hearts",
    icon: "❤️",
    list: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 ✨ 🔥 ⭐ 🌟 💫 🎉 🎊 🎈 🎁 🏆 🥇",
  },
  {
    key: "emoji.work",
    icon: "💼",
    list: "💼 📁 📂 📄 📝 📌 📎 🔗 📅 📆 ⏰ ⌛ ⏳ 📊 📈 📉 💻 🖥️ 📱 ☎️ 📞 📧 ✉️ 📨 🔒 🔓 🔑 🛠️ 🔧 🐞 🚀 ✅ ☑️ ❌ ⚠️ ❓ ❗ 💡 📣 🔔",
  },
  {
    key: "emoji.food",
    icon: "☕",
    list: "☕ 🍵 🥤 🍺 🍻 🥂 🍕 🍔 🍟 🌭 🥪 🌮 🍜 🍛 🍚 🍱 🍩 🍪 🎂 🍰 🍫 🍬 🍎 🍌 🍉 🍇 🥭 🍓",
  },
];

/** Input chya var popover — click kela ki emoji text madhe. */
export function EmojiPicker({ onPick, onClose, placement = "above" }: { onPick: (emoji: string) => void; onClose: () => void; placement?: "above" | "below" }) {
  const [tab, setTab] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Ughadnara click lagech band karu naye.
    const id = setTimeout(() => document.addEventListener("pointerdown", down), 0);
    document.addEventListener("keydown", esc);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const g = GROUPS[tab];
  return (
    <div
      ref={box}
      className={cn(
        "animate-pop absolute left-0 z-20 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-pop",
        placement === "above" ? "bottom-full mb-2" : "top-full mt-1",
      )}
    >
      <div className="flex border-b border-border px-1">
        {GROUPS.map((x, i) => (
          <button
            key={x.key}
            type="button"
            title={t(x.key)}
            aria-label={t(x.key)}
            onClick={() => setTab(i)}
            className={cn("flex-1 py-2 text-lg transition", i === tab ? "border-b-2 border-accent" : "opacity-60 hover:opacity-100")}
          >
            {x.icon}
          </button>
        ))}
      </div>
      <p className="px-3 pt-2 text-[10px] font-semibold tracking-wide text-muted uppercase">{t(g.key)}</p>
      <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {g.list.split(" ").map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} className="flex aspect-square items-center justify-center rounded-lg text-xl transition hover:bg-surface-2 active:scale-90">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
