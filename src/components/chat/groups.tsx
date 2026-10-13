import {
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronRight,
  FileText,
  Link2,
  LogOut,
  MessageCircle,
  Pencil,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  attachmentUrl,
  createChatGroup,
  GROUP_DESC_MAX,
  GROUP_MAX_MEMBERS,
  GROUP_NAME_MAX,
  groupPhotoUrl,
  leaveChatGroup,
  notifyModeOf,
  setChatNotify,
  setGroupPhoto,
  updateChatGroup,
  useChatMessages,
  type ChatAttachment,
  type ChatMessage,
  type ChatSummary,
  type ChatUser,
  type GroupPatch,
  type NotifyMode,
} from "@/api/chat";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Input, Label, Segmented, Spinner, Textarea, Toggle } from "@/components/ui/primitives";
import { t } from "@/i18n";
import { dateTime } from "@/lib/format";
import { errorMessage } from "@/lib/firebase";
import { cn } from "@/lib/utils";

import { AttachmentLink, hrefOf, linksIn, MessageText } from "./bubble";
import { openChatWith } from "./ChatDock";
import { jumpToMessage, loadChatUsers, openChatSearch } from "./parts";

/**
 * Internal Chat → Groups (WhatsApp sarkhe): photo / naav / description, members picker,
 * Group info (settings). Sagle niyam (fakt active Core Users, admin-only badal) server tapasto —
 * ithe fakt UI.
 */

const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";
const photoOk = (f: File) => /^image\/(png|jpe?g|webp)$/.test(f.type);
/** Nivadleli mool image (nantar 512px JPEG hote; server pan tapasto). */
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

// ── Avatar ────────────────────────────────────────────────────────────

const AVATAR_SIZE = { sm: "size-7", md: "size-9", xl: "size-24" } as const;

/** Group photo kinva 👥 icon. */
export function GroupAvatar({ photo, seed, size = "md", preview }: { photo: string | null; seed: string; size?: keyof typeof AVATAR_SIZE; preview?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!photo) return;
    let alive = true;
    groupPhotoUrl(photo)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [photo]);
  const src = preview ?? url;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-accent", AVATAR_SIZE[size])} data-seed={seed}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <Users className={size === "xl" ? "size-10" : size === "md" ? "size-4.5" : "size-3.5"} />}
    </span>
  );
}

// ── Member picker ─────────────────────────────────────────────────────

/** Core Users madhun anek nivadne — search, chips; `exclude` (adhich group madhe) nivadta yet nahi. */
function MemberPicker({
  users,
  selected,
  onChange,
  exclude = [],
  max,
}: {
  users: ChatUser[];
  selected: string[];
  onChange: (uids: string[]) => void;
  exclude?: string[];
  max: number;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = term ? users.filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || u.role?.toLowerCase().includes(term)) : users;
  const byId = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);
  const toggle = (uid: string) => onChange(selected.includes(uid) ? selected.filter((x) => x !== uid) : selected.length < max ? [...selected, uid] : selected);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t("group.addPeopleHint")}</p>
      {selected.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {selected.map((uid) => (
            <span key={uid} className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 py-0.5 pr-1 pl-0.5 text-xs font-medium">
              <Avatar name={byId.get(uid)?.name ?? "?"} seed={uid} size="sm" />
              <span className="max-w-32 truncate">{byId.get(uid)?.name}</span>
              <button type="button" onClick={() => toggle(uid)} className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={t("act.cancel")}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input icon={<Search className="size-4" />} placeholder={t("group.searchPeople")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="max-h-[min(22rem,45dvh)] space-y-0.5 overflow-y-auto overscroll-contain">
        {list.length === 0 ? (
          <li className="py-8 text-center text-xs text-muted">{t("group.noMatches")}</li>
        ) : (
          list.map((u) => {
            const already = exclude.includes(u.uid);
            const on = already || selected.includes(u.uid);
            return (
              <li key={u.uid}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => toggle(u.uid)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent")}
                >
                  <Avatar name={u.name || u.email} seed={u.uid} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block truncate text-[11px] text-muted">{already ? t("group.alreadyIn") : (u.role ?? u.email)}</span>
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition",
                      on ? "border-accent bg-accent text-accent-fg" : "border-border",
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

// ── New group ─────────────────────────────────────────────────────────

/** Pahila members, mag photo / naav / description (WhatsApp sarkha). */
export function NewGroupDialog({
  me,
  users,
  onClose,
  onCreated,
}: {
  me: string;
  users: ChatUser[];
  onClose: () => void;
  onCreated: (chatId: string) => void;
}) {
  const [step, setStep] = useState<"members" | "details">("members");
  const [members, setMembers] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = usePreview(photo);
  const photoInput = useRef<HTMLInputElement>(null);

  const create = async () => {
    setBusy(true);
    try {
      const { chatId } = await createChatGroup({ name: name.trim(), description: description.trim(), members });
      if (photo) await setGroupPhoto(me, chatId, photo).catch(() => toast.error(t("group.photoFailed")));
      toast.success(t("group.created"));
      onCreated(chatId);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={step === "members" ? t("group.addPeople") : t("group.details")}
      description={step === "members" ? t("group.selected", { n: members.length }) : t("group.members", { n: members.length + 1 })}
      footer={
        step === "members" ? (
          <>
            <Button onClick={onClose}>{t("act.cancel")}</Button>
            <Button variant="primary" disabled={!members.length} onClick={() => setStep("details")} icon={<ChevronRight className="size-4" />}>
              {t("group.next")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep("members")} disabled={busy}>
              {t("group.back")}
            </Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>
              {t("group.create")}
            </Button>
          </>
        )
      }
    >
      {step === "members" ? (
        <MemberPicker users={users} selected={members} onChange={setMembers} max={GROUP_MAX_MEMBERS - 1} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => photoInput.current?.click()} className="group relative rounded-full" aria-label={t("group.photo")}>
              <GroupAvatar photo={null} preview={preview} seed="new" size="xl" />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100 pointer-coarse:opacity-100">
                <Camera className="size-6" />
              </span>
            </button>
            {photo ? (
              <button type="button" className="text-xs text-muted hover:text-text" onClick={() => setPhoto(null)}>
                {t("group.removePhoto")}
              </button>
            ) : (
              <span className="text-xs text-muted">{t("group.photo")}</span>
            )}
            <PhotoInput inputRef={photoInput} onPick={setPhoto} />
          </div>
          <div>
            <Label hint={`${name.length}/${GROUP_NAME_MAX}`}>{t("group.name")}</Label>
            <Input value={name} maxLength={GROUP_NAME_MAX} placeholder={t("group.namePlaceholder")} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label hint={`${description.length}/${GROUP_DESC_MAX}`}>{t("group.description")}</Label>
            <Textarea value={description} maxLength={GROUP_DESC_MAX} placeholder={t("group.descriptionPlaceholder")} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function PhotoInput({ inputRef, onPick }: { inputRef: React.RefObject<HTMLInputElement | null>; onPick: (f: File) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={PHOTO_ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        if (!photoOk(f)) return void toast.error(t("group.photoType"));
        if (f.size > PHOTO_MAX_BYTES) return void toast.error(t("group.photoTooBig", { max: "10 MB" }));
        onPick(f);
      }}
    />
  );
}

function usePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

// ── Group info ────────────────────────────────────────────────────────

/** Group info / settings — sagle pahu shaktat; badal fakt admin (server pan tapasto). */
export function GroupInfo({ me, chat, onClose }: { me: string; chat: ChatSummary; onClose: () => void }) {
  const g = chat.group!;
  const isAdmin = g.admins.includes(me);
  const [users, setUsers] = useState<ChatUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<"name" | "description" | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [profile, setProfile] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [memberQ, setMemberQ] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  // Nivadlela navin photo — adhi preview, mag "Save".
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const newPreview = usePreview(newPhoto);
  const messages = useChatMessages(chat.id, me);

  useEffect(() => {
    let alive = true;
    loadChatUsers()
      .then((u) => alive && setUsers(u))
      .catch(() => alive && setUsers([]));
    return () => {
      alive = false;
    };
  }, []);
  const byId = useMemo(() => new Map((users ?? []).map((u) => [u.uid, u])), [users]);

  const run = async (key: string, f: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await f();
      if (ok) toast.success(ok);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const patch = (key: string, p: GroupPatch) => run(key, () => updateChatGroup(chat.id, p), t("group.updated"));

  const saveDraft = async () => {
    if (!editing) return;
    if (await patch(editing, editing === "name" ? { name: draft.trim() } : { description: draft.trim() })) setEditing(null);
  };

  const nameOf = (uid: string) => (uid === me ? t("chat.you") : (g.names[uid] ?? byId.get(uid)?.name ?? "—"));
  // "You" adhi, mag admins, mag naav.
  const term = memberQ.trim().toLowerCase();
  const members = [...g.members]
    .filter((u) => !term || nameOf(u).toLowerCase().includes(term) || !!byId.get(u)?.email.toLowerCase().includes(term))
    .sort((a, b) => {
      if (a === me) return -1;
      if (b === me) return 1;
      const x = Number(g.admins.includes(b)) - Number(g.admins.includes(a));
      return x || nameOf(a).localeCompare(nameOf(b));
    });
  const adminNames = g.admins.filter((a) => g.members.includes(a)).map(nameOf);
  const mode = notifyModeOf(g, me);
  const starred = (messages ?? []).filter((m) => m.starred && !m.deleted).reverse();

  /** Drawer band karun conversation madhe. */
  const goTo = (f: () => void) => {
    onClose();
    setTimeout(f, 50);
  };

  return (
    <Drawer open onClose={onClose} title={t("group.info")} width="max-w-md">
      <div className="-m-5 divide-y divide-border">
        {/* Photo, naav, members */}
        <section className="space-y-3 bg-surface px-5 py-6 text-center">
          <div className="relative mx-auto w-fit">
            <GroupAvatar photo={g.photo} seed={chat.id} size="xl" />
            {isAdmin && (
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                disabled={!!busy}
                title={g.photo ? t("group.changePhoto") : t("group.addPhoto")}
                aria-label={g.photo ? t("group.changePhoto") : t("group.addPhoto")}
                className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg shadow-pop ring-4 ring-surface transition hover:brightness-110"
              >
                {busy === "photo" ? <Spinner className="size-4" /> : <Camera className="size-4" />}
              </button>
            )}
            <PhotoInput inputRef={photoInput} onPick={setNewPhoto} />
          </div>
          {isAdmin && g.photo && (
            <button type="button" className="text-xs text-muted hover:text-rose-500" disabled={!!busy} onClick={() => patch("photo", { photo: null })}>
              {t("group.removePhoto")}
            </button>
          )}

          {editing === "name" ? (
            <InlineEdit busy={busy === "name"} onSave={saveDraft} onCancel={() => setEditing(null)} disabled={!draft.trim()}>
              <Input value={draft} maxLength={GROUP_NAME_MAX} onChange={(e) => setDraft(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && draft.trim() && saveDraft()} />
            </InlineEdit>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <h3 className="min-w-0 text-xl font-semibold break-words">{g.name}</h3>
              {isAdmin && <EditButton onClick={() => (setDraft(g.name), setEditing("name"))} />}
            </div>
          )}
          <p className="text-xs text-muted">{t("group.groupMembers", { n: g.members.length })}</p>
          <div className="flex justify-center">
            <Button size="sm" icon={<Search className="size-3.5" />} onClick={() => goTo(() => openChatSearch(chat.id))}>
              {t("group.search")}
            </Button>
          </div>
        </section>

        {/* Description + kuni / kadhi banavla */}
        <section className="space-y-3 bg-surface px-5 py-4">
          {editing === "description" ? (
            <InlineEdit busy={busy === "description"} onSave={saveDraft} onCancel={() => setEditing(null)}>
              <Textarea value={draft} maxLength={GROUP_DESC_MAX} placeholder={t("group.descriptionPlaceholder")} onChange={(e) => setDraft(e.target.value)} autoFocus />
            </InlineEdit>
          ) : g.description ? (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-muted">{t("group.description")}</p>
                <p className="text-sm break-words whitespace-pre-wrap">
                  <MessageText text={g.description} mentions={[]} names={{}} me={me} mine={false} />
                </p>
              </div>
              {isAdmin && <EditButton onClick={() => (setDraft(g.description), setEditing("description"))} />}
            </div>
          ) : isAdmin ? (
            <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => (setDraft(""), setEditing("description"))}>
              {t("group.addDescription")}
            </button>
          ) : (
            <p className="text-xs text-muted">{t("group.noDescription")}</p>
          )}
          <dl className="space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted">{t("group.createdByLabel")}</dt>
              <dd className="min-w-0">{nameOf(g.createdBy)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted">{t("group.createdOn")}</dt>
              <dd>{dateTime(g.createdAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted">{t("group.admins")}</dt>
              <dd className="min-w-0">{adminNames.join(", ") || "—"}</dd>
            </div>
          </dl>
        </section>

        <GroupMedia me={me} chatId={chat.id} messages={messages} />

        {/* Starred */}
        {starred.length > 0 && (
          <section className="space-y-2 bg-surface px-5 py-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Star className="size-3.5" /> {t("group.starred", { n: starred.length })}
            </p>
            <ul className="space-y-1">
              {starred.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => goTo(() => jumpToMessage(chat.id, m.id))} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                    <span className="flex justify-between gap-2 text-[11px] text-muted">
                      <span className="truncate font-medium text-text">{m.by === me ? t("chat.you") : m.byName}</span>
                      <span className="shrink-0">{dateTime(m.at)}</span>
                    </span>
                    <span className="line-clamp-1 text-sm">{m.text || (m.attachment ? `📎 ${m.attachment.name}` : "")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Notifications — fakt majhyasathi */}
        <section className="space-y-2 bg-surface px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {mode === "off" ? <BellOff className="size-4" /> : <Bell className="size-4" />} {t("group.notificationsTitle")}
          </p>
          <Segmented<NotifyMode>
            value={mode}
            onChange={(v) => v !== mode && run("notify", () => setChatNotify(chat.id, v))}
            options={[
              { value: "all", label: t("group.notifyAll") },
              { value: "mentions", label: t("group.notifyMentions") },
              { value: "off", label: t("group.notifyOff") },
            ]}
          />
          <p className="text-xs text-muted">{t(`group.notifyHint.${mode}`)}</p>
        </section>

        {/* Group settings */}
        <section className="space-y-3 bg-surface px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Settings2 className="size-4" /> {t("group.settings")}
          </p>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm">{t("group.onlyAdminsSend")}</p>
              <p className="text-xs text-muted">{g.onlyAdminsSend ? t("group.onlyAdminsSendOn") : t("group.onlyAdminsSendOff")}</p>
            </div>
            <Toggle checked={g.onlyAdminsSend} disabled={!isAdmin || busy === "send"} onChange={(v) => patch("send", { onlyAdminsSend: v })} />
          </div>
          <p className="text-xs text-muted">{isAdmin ? t("group.adminsEditInfo") : t("group.onlyAdminsEdit")}</p>
        </section>

        {/* Members */}
        <section className="bg-surface py-3">
          <div className="flex items-center justify-between gap-3 px-5 pb-2">
            <p className="text-xs font-medium text-muted">{t("group.members", { n: g.members.length })}</p>
          </div>
          <div className="px-5 pb-2">
            <Input icon={<Search className="size-4" />} placeholder={t("group.searchMembers")} value={memberQ} onChange={(e) => setMemberQ(e.target.value)} />
          </div>
          {isAdmin && g.members.length < GROUP_MAX_MEMBERS && !term && (
            <button type="button" onClick={() => (setToAdd([]), setAdding(true))} className="flex w-full items-center gap-3 px-5 py-2 text-left hover:bg-surface-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg">
                <UserPlus className="size-4" />
              </span>
              <span className="text-sm font-medium text-accent">{t("group.addPeople")}</span>
            </button>
          )}
          <ul>
            {members.length === 0 && <li className="px-5 py-4 text-center text-xs text-muted">{t("group.noMatches")}</li>}
            {members.map((uid) => {
              const u = byId.get(uid);
              return (
                <li key={uid}>
                  <button type="button" disabled={uid === me} onClick={() => setProfile(uid)} className="flex w-full items-center gap-3 px-5 py-2 text-left enabled:hover:bg-surface-2">
                    <Avatar name={nameOf(uid)} seed={uid} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{nameOf(uid)}</span>
                      <span className="block truncate text-[11px] text-muted">{u ? (u.role ?? u.email) : ""}</span>
                    </span>
                    {g.admins.includes(uid) && <Badge tone="accent">{t("group.admin")}</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="bg-surface px-5 py-3">
          <button type="button" onClick={() => setLeaving(true)} className="flex w-full items-center gap-3 py-2 text-left text-sm font-medium text-rose-600 hover:text-rose-500">
            <LogOut className="size-4" /> {t("group.leave")}
          </button>
        </section>
      </div>

      {newPhoto && (
        <Modal
          open
          onClose={busy === "photo" ? () => {} : () => setNewPhoto(null)}
          title={t("group.photo")}
          size="sm"
          footer={
            <>
              <Button onClick={() => photoInput.current?.click()} disabled={busy === "photo"}>
                {t("group.changePhoto")}
              </Button>
              <Button
                variant="primary"
                loading={busy === "photo"}
                onClick={async () => {
                  if (await run("photo", () => setGroupPhoto(me, chat.id, newPhoto), t("group.updated"))) setNewPhoto(null);
                }}
              >
                {t("act.save")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col items-center gap-2 py-2">
            {/* Madhla chaukon — group photo asach gol disto. */}
            {newPreview && <img src={newPreview} alt="" className="size-48 rounded-full object-cover shadow-pop" />}
            <p className="max-w-full truncate text-xs text-muted">{newPhoto.name}</p>
          </div>
        </Modal>
      )}

      {profile && (
        <MemberProfile
          uid={profile}
          name={nameOf(profile)}
          user={byId.get(profile) ?? null}
          admin={g.admins.includes(profile)}
          canManage={isAdmin}
          busy={busy}
          onClose={() => setProfile(null)}
          onMessage={() => {
            setProfile(null);
            goTo(() => openChatWith(profile));
          }}
          onToggleAdmin={() => patch(`admin-${profile}`, g.admins.includes(profile) ? { demote: [profile] } : { promote: [profile] }).then((ok) => ok && setProfile(null))}
          onRemove={() => setRemoving(profile)}
        />
      )}

      {adding && (
        <Modal
          open
          onClose={() => setAdding(false)}
          title={t("group.addPeople")}
          description={t("group.selected", { n: toAdd.length })}
          footer={
            <>
              <Button onClick={() => setAdding(false)}>{t("act.cancel")}</Button>
              <Button
                variant="primary"
                disabled={!toAdd.length}
                loading={busy === "add"}
                onClick={async () => {
                  if (await patch("add", { add: toAdd })) setAdding(false);
                }}
              >
                {t("group.add")}
              </Button>
            </>
          }
        >
          {users ? (
            <MemberPicker users={users} selected={toAdd} onChange={setToAdd} exclude={g.members} max={GROUP_MAX_MEMBERS - g.members.length} />
          ) : (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t("group.removeTitle", { name: removing ? nameOf(removing) : "" })}
        description={t("group.removeHint")}
        confirmLabel={t("group.remove")}
        tone="danger"
        loading={busy === "remove"}
        onConfirm={async () => {
          if (removing && (await patch("remove", { remove: [removing] }))) {
            setRemoving(null);
            setProfile(null);
          }
        }}
      />
      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`${t("group.leave")}?`}
        description={t("group.leaveHint")}
        confirmLabel={t("group.leave")}
        tone="danger"
        loading={busy === "leave"}
        onConfirm={async () => {
          if (await run("leave", () => leaveChatGroup(chat.id))) onClose();
        }}
      />
    </Drawer>
  );
}

/** Employee profile (Core User) — message, ani admin asel tar admin / remove. */
function MemberProfile({
  uid,
  name,
  user,
  admin,
  canManage,
  busy,
  onClose,
  onMessage,
  onToggleAdmin,
  onRemove,
}: {
  uid: string;
  name: string;
  user: ChatUser | null;
  admin: boolean;
  canManage: boolean;
  busy: string | null;
  onClose: () => void;
  onMessage: () => void;
  onToggleAdmin: () => void;
  onRemove: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={t("group.profile")} size="sm">
      <div className="space-y-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <Avatar name={name} seed={uid} size="lg" />
          <div>
            <p className="text-base font-semibold">{name}</p>
            {user?.role && <p className="text-xs text-muted">{user.role}</p>}
            {user?.email && (
              <a href={`mailto:${user.email}`} className="text-xs text-accent hover:underline">
                {user.email}
              </a>
            )}
            {!user && <p className="text-xs text-muted">{t("group.inactiveUser")}</p>}
          </div>
          {admin && <Badge tone="accent">{t("group.admin")}</Badge>}
        </div>
        <div className="flex flex-col gap-2">
          {user && (
            <Button variant="primary" className="justify-center" icon={<MessageCircle className="size-4" />} onClick={onMessage}>
              {t("group.messageMember", { name })}
            </Button>
          )}
          {canManage && (
            <>
              <Button className="justify-center" icon={<ShieldCheck className="size-4" />} loading={busy === `admin-${uid}`} disabled={!!busy} onClick={onToggleAdmin}>
                {admin ? t("group.dismissAdmin") : t("group.makeAdmin")}
              </Button>
              <Button variant="ghost" className="justify-center text-rose-600 hover:text-rose-600" icon={<UserMinus className="size-4" />} disabled={!!busy} onClick={onRemove}>
                {t("group.remove")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClick} aria-label={t("group.edit")} title={t("group.edit")}>
      <Pencil className="size-3.5" />
    </Button>
  );
}

function InlineEdit({ children, busy, disabled, onSave, onCancel }: { children: ReactNode; busy: boolean; disabled?: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-2 text-left">
      {children}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel} disabled={busy}>
          {t("act.cancel")}
        </Button>
        <Button size="sm" variant="primary" loading={busy} disabled={disabled} onClick={onSave}>
          {t("act.save")}
        </Button>
      </div>
    </div>
  );
}

// ── Media / files / links ─────────────────────────────────────────────

type MediaTab = "media" | "files" | "links";

/** Group madhe share zalele photos / videos, files ani links (load zalelya messages madhun) — shodh, ughda, message var ja. */
function GroupMedia({ me, chatId, messages }: { me: string; chatId: string; messages: ChatMessage[] | null }) {
  const [tab, setTab] = useState<MediaTab>("media");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const live = useMemo(() => (messages ?? []).filter((m) => !m.deleted && !m.system).reverse(), [messages]);
  const media = live.filter((m) => m.attachment && /^(image|video)\//.test(m.attachment.type));
  const files = live.filter((m) => m.attachment && !/^(image|video)\//.test(m.attachment.type));
  const links = live.flatMap((m) => linksIn(m.text).map((url) => ({ url, m })));

  const term = q.trim().toLowerCase();
  const who = (m: ChatMessage) => (m.by === me ? t("chat.you") : m.byName).toLowerCase();
  const fMedia = term ? media.filter((m) => m.attachment!.name.toLowerCase().includes(term) || who(m).includes(term) || m.text.toLowerCase().includes(term)) : media;
  const fFiles = term ? files.filter((m) => m.attachment!.name.toLowerCase().includes(term) || who(m).includes(term)) : files;
  const fLinks = term ? links.filter((l) => l.url.toLowerCase().includes(term) || who(l.m).includes(term) || l.m.text.toLowerCase().includes(term)) : links;
  const cap = all ? Infinity : tab === "media" ? 9 : 5;

  return (
    <section className="space-y-3 bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <Segmented<MediaTab>
          value={tab}
          onChange={(v) => (setTab(v), setAll(false))}
          options={[
            { value: "media", label: t("group.tabMedia"), count: media.length },
            { value: "files", label: t("group.tabFiles"), count: files.length },
            { value: "links", label: t("group.tabLinks"), count: links.length },
          ]}
        />
      </div>
      {(media.length > 0 || files.length > 0 || links.length > 0) && (
        <Input icon={<Search className="size-4" />} placeholder={t("group.searchShared")} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {!messages ? (
        <Spinner />
      ) : tab === "media" ? (
        fMedia.length === 0 ? (
          <p className="text-xs text-muted">{t("group.mediaEmpty")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {fMedia.slice(0, cap).map((m) => (
              <Thumb key={m.id} a={m.attachment!} />
            ))}
          </div>
        )
      ) : tab === "files" ? (
        fFiles.length === 0 ? (
          <p className="text-xs text-muted">{t("group.filesEmpty")}</p>
        ) : (
          <div className="space-y-1.5">
            {fFiles.slice(0, cap).map((m) => (
              <div key={m.id}>
                <AttachmentLink a={m.attachment!} mine={false} />
                <p className="mt-0.5 px-1 text-[10px] text-muted">
                  {m.by === me ? t("chat.you") : m.byName} · {dateTime(m.at)}
                </p>
              </div>
            ))}
          </div>
        )
      ) : fLinks.length === 0 ? (
        <p className="text-xs text-muted">{t("group.linksEmpty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {fLinks.slice(0, cap).map(({ url, m }, i) => (
            <li key={`${m.id}-${i}`} className="flex items-start gap-2 rounded-lg bg-surface-2/60 px-2.5 py-2">
              <Link2 className="mt-0.5 size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <a href={hrefOf(url)} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-accent hover:underline">
                  {url}
                </a>
                <button type="button" onClick={() => jumpToMessage(chatId, m.id)} className="text-[10px] text-muted hover:text-text">
                  {m.by === me ? t("chat.you") : m.byName} · {dateTime(m.at)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!all && (tab === "media" ? fMedia.length : tab === "files" ? fFiles.length : fLinks.length) > cap && (
        <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setAll(true)}>
          {t("group.showAll", { n: tab === "media" ? fMedia.length : tab === "files" ? fFiles.length : fLinks.length })}
        </button>
      )}
    </section>
  );
}

function Thumb({ a }: { a: ChatAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    attachmentUrl(a.path)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [a.path]);
  const video = a.type.startsWith("video/");
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={a.name}
      className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-2"
    >
      {!url ? (
        <FileText className="size-4 text-muted" />
      ) : video ? (
        <video src={url} preload="metadata" muted className="size-full object-cover" />
      ) : (
        <img src={url} alt={a.name} loading="lazy" className="size-full object-cover" />
      )}
      {video && <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">▶</span>}
    </a>
  );
}
