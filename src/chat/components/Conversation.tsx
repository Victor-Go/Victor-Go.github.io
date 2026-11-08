import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, Info, Send, ShieldAlert, ShieldOff, Smile, Star, Trash2 } from "lucide-react";
import { PATH, go } from "../route";
import { addFavorite, deleteMessages, favoritesAmong, loadOlder, removeFavorite, sendText } from "../client";
import { errorOf } from "../i18nApp";
import { MESSAGE_MAX_CHARS } from "../crypto/message";
import { deliveryOf } from "../delivery";
import { dayKey, formatClock, formatDay, isExpired } from "../format";
import { applyMention, mentionQuery, splitMentions, suggest } from "../mentions";
import { useChat, type Msg } from "../store";
import { useLang } from "../useChat";
import { ContactInfo } from "./ContactInfo";
import { GroupInfo } from "./GroupInfo";
import { splitLinks } from "../links";
import { DELETE_MAX, canDelete } from "../selection";
import { Avatar, Modal } from "./ui";
import { OfficialMessage } from "./OfficialMessage";
import { VoiceBubble } from "./VoiceBubble";
import { VoiceComposer } from "./VoiceComposer";

const EMOJIS = ["👌", "👍", "🤝", "❤️", "😄", "😁", "😆", "😅", "🤣", "😂", "😉", "😊", "😇", "🥲", "😛", "😝", "🫢", "🫣", "🤫", "🤐", "🥺", "🥹", "😭", "😱", "😖", "😣", "😞", "😓", "😫"];

/** A message's text with @mentions of group members highlighted (as spans, never as markup). */
function MessageText({ text, handles, me, onLink }: { text: string; handles: string[]; me: string; onLink: (href: string) => void }) {
  return (
    <>
      {splitLinks(text).map((piece, i) => {
        // A link is a button without an address, so it can only be opened through the confirmation.
        if (piece.href) {
          const href = piece.href;
          return (
            <button key={i} type="button" className="ch-url" onClick={() => onLink(href)}>
              {piece.text}
            </button>
          );
        }
        if (handles.length === 0) return <Fragment key={i}>{piece.text}</Fragment>;
        return (
          <Fragment key={i}>
            {splitMentions(piece.text, handles).map((seg, j) =>
              seg.mention ? (
                <span key={j} className={seg.mention.toLowerCase() === me.toLowerCase() ? "ch-at-me" : "ch-at-other"}>
                  {seg.text}
                </span>
              ) : (
                <Fragment key={j}>{seg.text}</Fragment>
              ),
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** Holding a message this long on a phone starts selecting. */
const HOLD_MS = 1000;
/** The side-by-side layout (a mouse is the main pointer there); below it is the phone layout. */
const isWide = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 900px)").matches;

export function Conversation() {
  const { lang, a } = useLang();
  const { activeConv, contacts, groups, messages, me, retentionDays, favorites, reads, olderMore, official } = useChat();
  // Drafts live in memory only, one per conversation, so switching chats keeps what was typed.
  const draft = useChat((s) => (s.activeConv ? (s.drafts[s.activeConv] ?? "") : ""));
  const setDraft = (text: string) => {
    const conv = useChat.getState().activeConv;
    if (!conv) return;
    const drafts = { ...useChat.getState().drafts };
    if (text) drafts[conv] = text;
    else delete drafts[conv];
    useChat.setState({ drafts });
  };
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [info, setInfo] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [favError, setFavError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  // Messages whose favourite star is being saved or removed; the star ignores taps until that finishes.
  const [favBusy, setFavBusy] = useState<ReadonlySet<string>>(new Set());
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextCaret = useRef<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  // The emoji panel closes on a tap elsewhere, on Escape, and when the chat changes.
  useEffect(() => setEmojiOpen(false), [activeConv]);
  useEffect(() => {
    if (!emojiOpen) return;
    const away = (e: PointerEvent) => {
      if (!emojiRef.current?.contains(e.target as Node)) setEmojiOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setEmojiOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [emojiOpen]);
  const contact = contacts.find((c) => c.convId === activeConv);
  const group = groups.find((g) => g.id === activeConv);
  // The official conversation: the system's messages to me, plain and read-only. No composer, no key, nothing is ever opened.
  const isOfficial = activeConv !== null && activeConv === official;
  const list = (activeConv ? messages[activeConv] : undefined) ?? [];
  const now = Date.now();
  const visible = list.filter((msg) => !isExpired(msg.time, now, retentionDays));

  // Selecting messages to delete. Only my own sent messages can be picked; the picked set holds sequence numbers.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  const deletable = new Set(visible.filter(canDelete).map((m) => m.seq));
  // A message that was deleted meanwhile (by the push, by a reload) drops out of the selection by itself.
  const chosen = visible.filter((m) => picked.has(m.seq) && canDelete(m));
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
    setConfirming(false);
    setBox(null);
    drag.current = null;
    pointer.current = null;
  };
  useEffect(stopSelecting, [activeConv]);
  useEffect(() => {
    if (!selecting) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !confirming && stopSelecting();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [selecting, confirming]);
  const toggle = (seq: number) => {
    if (!deletable.has(seq)) return;
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(seq)) next.delete(seq);
      else if (next.size < DELETE_MAX) next.add(seq);
      return next;
    });
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    // The click that ends a long press is swallowed; if the browser sends none (a cancelled touch), do not keep swallowing the next real one.
    if (swallowClick.current) setTimeout(() => (swallowClick.current = false), 50);
  };
  // Phone layout: holding one of my messages for a second starts selecting, with that message picked.
  const beginPress = (e: React.PointerEvent, seq: number) => {
    if (selecting || isWide() || !deletable.has(seq) || (e.target as HTMLElement).closest("a, button")) return;
    cancelPress();
    const timer = setTimeout(() => {
      press.current = null;
      swallowClick.current = true;
      window.getSelection()?.removeAllRanges();
      setSelecting(true);
      setPicked(new Set([seq]));
      try {
        navigator.vibrate?.(15);
      } catch {
        /* not every browser has it */
      }
    }, HOLD_MS);
    press.current = { timer, x: e.clientX, y: e.clientY };
  };
  const movePress = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  };
  // Wide layout: dragging from the empty background draws a box; the messages of mine it touches are picked.
  const contentPoint = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop };
  };
  const dragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Only bare background: the list itself, or the empty part of a message row (a long message makes its row as wide as the list), never a
    // bubble, an avatar or the scrollbar; with the primary button.
    const bare = e.target === el || (e.target as HTMLElement).classList.contains("ch-msgrow");
    if (!bare || e.button !== 0 || !isWide() || e.clientX >= el.getBoundingClientRect().left + el.clientWidth) return;
    drag.current = { ...contentPoint(e), active: false };
    pointer.current = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  };
  // Recomputes the box and the picked messages from the pointer's last position and the list's current scroll.
  const updateDrag = () => {
    const d = drag.current;
    const el = listRef.current;
    const ptr = pointer.current;
    if (!d || !el || !ptr) return;
    const base = el.getBoundingClientRect();
    // The box stays inside the list: dragging past its edge never widens it (no horizontal scrolling).
    const p = {
      x: Math.min(Math.max(ptr.x - base.left + el.scrollLeft, 0), el.clientWidth),
      y: Math.min(Math.max(ptr.y - base.top + el.scrollTop, 0), el.scrollHeight),
    };
    if (!d.active && Math.hypot(p.x - d.x, p.y - d.y) < 6) return;
    d.active = true;
    const rect = { x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) };
    setBox(rect);
    setSelecting(true);
    const hit = new Set<number>();
    for (const row of el.querySelectorAll<HTMLElement>("[data-seq]")) {
      const seq = Number(row.dataset.seq);
      if (!deletable.has(seq) || hit.size >= DELETE_MAX) continue;
      const r = row.getBoundingClientRect();
      const left = r.left - base.left + el.scrollLeft;
      const top = r.top - base.top + el.scrollTop;
      if (left < rect.x + rect.w && left + r.width > rect.x && top < rect.y + rect.h && top + r.height > rect.y) hit.add(seq);
    }
    setPicked(hit);
  };
  const updateRef = useRef(updateDrag);
  updateRef.current = updateDrag;
  // While the pointer is held near the top or bottom edge the list keeps scrolling, faster the closer to (or past) the edge.
  const autoScroll = () => {
    raf.current = 0;
    const el = listRef.current;
    const ptr = pointer.current;
    if (!drag.current?.active || !el || !ptr) return;
    const r = el.getBoundingClientRect();
    const zone = 56;
    const dy = ptr.y < r.top + zone ? -Math.min(24, 2 + (r.top + zone - ptr.y) / 3) : ptr.y > r.bottom - zone ? Math.min(24, 2 + (ptr.y - (r.bottom - zone)) / 3) : 0;
    if (dy !== 0) {
      el.scrollTop += dy;
      updateRef.current();
    }
    raf.current = requestAnimationFrame(autoScroll);
  };
  const dragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    updateDrag();
    if (drag.current.active && !raf.current) raf.current = requestAnimationFrame(autoScroll);
  };
  const dragEnd = () => {
    drag.current = null;
    pointer.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    setBox(null);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const confirmDelete = () => {
    if (!activeConv || deleting || chosen.length === 0) return;
    setDeleting(true);
    void deleteMessages(activeConv, chosen.map((m) => m.seq))
      .then((r) => {
        setFavError(r.error ? errorOf(a, r.error) : null);
        stopSelecting();
      })
      .finally(() => setDeleting(false));
  };

  // Where the list was after the last change: which messages were first and last, and how tall it was.
  const drawn = useRef<{ conv: string | null; first: string; last: string; height: number } | null>(null);
  const firstKey = visible.length > 0 ? String(visible[0].seq || visible[0].id) : "";
  const lastKey = visible.length > 0 ? String(visible[visible.length - 1].seq || visible[visible.length - 1].id) : "";
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) {
      // No list on screen (no chat open): the next one drawn is a fresh start, never a continuation of what was drawn before.
      drawn.current = null;
      return;
    }
    const was = drawn.current;
    if (was && was.conv === activeConv && was.first !== "" && was.first !== firstKey && was.last === lastKey) {
      // Older messages were put above: the reader stays on the message they were reading, whatever scrolling or loading happened meanwhile.
      el.scrollTop += el.scrollHeight - was.height;
    } else if (!was || was.conv !== activeConv || was.last !== lastKey) {
      // A new chat, or a new message at the bottom: go to the bottom.
      el.scrollTop = el.scrollHeight;
    }
    drawn.current = { conv: activeConv, first: firstKey, last: lastKey, height: el.scrollHeight };
  }, [visible.length, activeConv, firstKey, lastKey]);
  // Scrolling to the top loads the next 20 older messages. A chat too short to scroll loads on its own until it fills the screen or runs out.
  const more = activeConv ? !!olderMore[activeConv] : false;
  const paging = useRef(false);
  const pageOlder = () => {
    const el = listRef.current;
    if (!activeConv || !more || loadingOlder || paging.current || !el) return;
    paging.current = true;
    setLoadingOlder(true);
    void loadOlder(activeConv)
      .catch(() => {})
      .finally(() => {
        paging.current = false;
        setLoadingOlder(false);
      });
  };
  useEffect(() => {
    const el = listRef.current;
    if (el && more && !loadingOlder && el.scrollHeight <= el.clientHeight + 40) pageOlder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [more, loadingOlder, visible.length, activeConv]);
  useEffect(() => {
    setCaret(inputRef.current?.value.length ?? 0);
    setDismissed(false);
  }, [activeConv]);
  // After picking a suggestion the caret goes right behind the inserted "@name ".
  useLayoutEffect(() => {
    if (nextCaret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(nextCaret.current, nextCaret.current);
      nextCaret.current = null;
    }
  });

  if (!activeConv || (!contact && !group && !isOfficial) || !me) {
    return (
      <div className="ch-empty">
        <p>{a.pickChat}</p>
      </div>
    );
  }
  const title = isOfficial ? a.officialTitle : contact ? `@${contact.handle}` : group!.name;
  const canSend = isOfficial ? false : contact ? contact.key !== null && !contact.deleted : (group?.keys.get(group!.gen) ?? null) !== null;
  const nameOf = (m: Msg): string => (m.mine ? me.handle : group ? (group.members.find((x) => x.userId === m.senderId)?.handle ?? "?") : (contact?.handle ?? "?"));
  const length = Array.from(draft).length;
  const memberHandles = group ? group.members.map((x) => x.handle) : [];

  // Typing "@" in a group offers the members; Enter, Tab or a tap inserts "@name " (name plus the one space the rule needs).
  const query = group && !dismissed ? mentionQuery(draft, caret) : null;
  const options = query ? suggest(memberHandles.filter((h) => h.toLowerCase() !== me.handle.toLowerCase()), query.query) : [];
  const open = options.length > 0;
  const choose = (handle: string) => {
    if (!query) return;
    const r = applyMention(draft, caret, query.start, handle);
    setDraft(r.text);
    setCaret(r.caret);
    nextCaret.current = r.caret;
    setPick(0);
    inputRef.current?.focus();
  };

  // Clicking someone's avatar in a group puts "@name " into the composer at the caret.
  const mentionSender = (handle: string) => {
    if (!group || !canSend || handle.toLowerCase() === me.handle.toLowerCase()) return;
    const at = Math.min(inputRef.current?.selectionStart ?? draft.length, draft.length);
    const before = draft.slice(0, at);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const insert = `${lead}@${handle} `;
    const after = draft.slice(at).replace(/^ /, "");
    setDraft(before + insert + after);
    nextCaret.current = at + insert.length;
    setCaret(at + insert.length);
    setPick(0);
    inputRef.current?.focus();
  };

  // Inserts at the caret (replacing a selection). The textarea keeps or lacks focus as it was, so the phone keyboard neither opens nor closes.
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = Math.min(el.selectionStart, draft.length);
    const end = Math.min(el.selectionEnd, draft.length);
    const text = draft.slice(0, start) + emoji + draft.slice(end);
    if (Array.from(text).length > MESSAGE_MAX_CHARS) return;
    setDraft(text);
    nextCaret.current = start + emoji.length;
    setCaret(start + emoji.length);
  };

  const submit = () => {
    if (!draft.trim() || length > MESSAGE_MAX_CHARS || !canSend) return;
    void sendText(activeConv, draft);
    setDraft("");
    setCaret(0);
  };
  const favId = (m: Msg) => `${activeConv}.${m.id}`.slice(0, 70);

  return (
    <section className="ch-conv" aria-label={title}>
      <header className="ch-conv-head">
        <button type="button" className="ch-icon ch-only-mobile" aria-label={a.back} onClick={() => go(PATH.home)}>
          <ArrowLeft size={22} />
        </button>
        <Avatar userId={isOfficial ? "official" : (contact?.userId ?? group!.id)} size={36} admin={contact?.role === "admin"} />
        <div className="ch-row-text">
          <div className="ch-row-title">
            {title} {contact?.role === "admin" && <span className="ch-admin">{a.adminBadge}</span>}
          </div>
          <div className="ch-hint">{isOfficial ? a.officialNote : group ? a.memberCount(group.members.length) : a.encryptedNote}</div>
        </div>
        {!isOfficial && (group || (contact && !contact.deleted)) && (
          <button type="button" className="ch-icon" aria-label={group ? a.groupInfo : a.contactInfo} onClick={() => setInfo(true)}>
            <Info size={20} />
          </button>
        )}
      </header>

      <div
        className={"ch-messages" + (selecting ? " ch-selecting" : "") + (box ? " ch-dragging" : "")}
        ref={listRef}
        onScroll={(e) => e.currentTarget.scrollTop < 60 && pageOlder()}
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onPointerUp={dragEnd}
        onPointerCancel={dragEnd}
      >
        {box && <div className="ch-marquee" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true" />}
        <div className="ch-retention">{a.retentionTop(retentionDays)}</div>
        {more && (
          <div className="ch-more-spin" role="status" aria-label={a.working}>
            {loadingOlder ? <span className="ch-spinner" /> : <button type="button" className="ch-more" onClick={pageOlder}>{a.loadOlder}</button>}
          </div>
        )}
        {favError && <div className="ch-notice">{favError}</div>}
        {contact?.deleted && <div className="ch-notice">{a.contactDeleted}</div>}
        {!canSend && !isOfficial && !contact?.deleted && <div className="ch-notice">{contact ? a.keyMissingHint : a.keyMissing}</div>}
        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const newDay = !prev || dayKey(prev.time) !== dayKey(m.time);
          const fav = favorites.some((f) => f.id === favId(m));
          return (
            <Fragment key={`${m.senderId}.${m.id}`}>
              {newDay && <div className="ch-day">{formatDay(m.time, now, lang, { today: a.today, yesterday: a.yesterday })}</div>}
              {m.deleted ? (
                <div className="ch-system" role="note" data-lost="deleted">
                  <Trash2 size={16} aria-hidden="true" />
                  <strong>{a.messageDeleted}</strong>
                  <span>
                    @{nameOf(m)} · {formatClock(m.time, lang)}
                  </span>
                </div>
              ) : m.kind !== undefined ? (
                // An official message is never decrypted. It can be selected and deleted like any other, and a card can be tapped.
                <div
                  className={"ch-msgrow ch-official" + (selecting && deletable.has(m.seq) ? " ch-pickable" : "") + (picked.has(m.seq) && deletable.has(m.seq) ? " ch-picked" : "")}
                  data-seq={m.seq > 0 ? m.seq : undefined}
                  onPointerDown={(e) => beginPress(e, m.seq)}
                  onPointerMove={movePress}
                  onPointerUp={cancelPress}
                  onPointerCancel={cancelPress}
                  onPointerLeave={cancelPress}
                  onContextMenu={(e) => {
                    if (!isWide() && deletable.has(m.seq)) e.preventDefault();
                  }}
                  onClick={() => {
                    if (swallowClick.current) swallowClick.current = false;
                    else if (selecting) toggle(m.seq);
                  }}
                >
                  {selecting && deletable.has(m.seq) && (
                    <button type="button" role="checkbox" aria-checked={picked.has(m.seq)} aria-label={`${formatClock(m.time, lang)}`} className="ch-check">
                      {picked.has(m.seq) && <Check size={16} aria-hidden="true" />}
                    </button>
                  )}
                  <OfficialMessage m={m} selecting={selecting} />
                </div>
              ) : !m.payload ? (
                // A destroyed or unverifiable message is a full-width system card with an icon, which no message text can imitate (text only ever appears in a bubble).
                <div className="ch-system" role="note" data-lost={m.lost ?? "unverified"}>
                  {m.lost === "destroyed" ? <ShieldOff size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}
                  <strong>{m.lost === "destroyed" ? a.undecryptable : a.unverified}</strong>
                  <span>
                    @{nameOf(m)} · {formatClock(m.time, lang)}
                  </span>
                </div>
              ) : (
              <div
                className={"ch-msgrow" + (m.mine ? " ch-mine" : "") + (selecting && deletable.has(m.seq) ? " ch-pickable" : "") + (picked.has(m.seq) && deletable.has(m.seq) ? " ch-picked" : "")}
                data-seq={m.seq > 0 ? m.seq : undefined}
                onPointerDown={(e) => beginPress(e, m.seq)}
                onPointerMove={movePress}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onPointerLeave={cancelPress}
                onContextMenu={(e) => {
                  if (!isWide() && deletable.has(m.seq)) e.preventDefault();
                }}
                onClick={() => {
                  if (swallowClick.current) swallowClick.current = false;
                  else if (selecting) toggle(m.seq);
                }}
              >
                {selecting && deletable.has(m.seq) ? (
                  <button type="button" role="checkbox" aria-checked={picked.has(m.seq)} aria-label={`${formatClock(m.time, lang)}`} className="ch-check">
                    {picked.has(m.seq) && <Check size={16} aria-hidden="true" />}
                  </button>
                ) : group && !m.mine ? (
                  <button type="button" className="ch-avatar-btn" aria-label={`@${nameOf(m)}`} onClick={() => mentionSender(nameOf(m))}>
                    <Avatar userId={m.senderId} size={32} admin={m.role === "admin"} />
                  </button>
                ) : (
                  <Avatar userId={m.senderId} size={32} admin={m.role === "admin"} />
                )}
                <div className={"ch-msg" + (m.mine ? " ch-mine" : "") + (m.payload ? "" : " ch-gone")}>
                  {!m.mine && group && (
                    <div className="ch-sender">
                      @{nameOf(m)} {m.role === "admin" && <span className="ch-admin">{a.adminBadge}</span>}
                    </div>
                  )}
                  {m.payload?.k === "text" ? (
                    <div className="ch-text">
                      <MessageText text={m.payload.text} handles={memberHandles} me={me.handle} onLink={setLink} />
                    </div>
                  ) : m.payload?.k === "voice" ? (
                    <VoiceBubble conv={activeConv} m={m} />
                  ) : (
                    <div className="ch-text ch-gone-text">{a.undecryptable}</div>
                  )}
                  <div className="ch-meta">
                    {m.status === "sending" && <span>{a.sending}</span>}
                    {m.status === "failed" && <span className="ch-bad">{a.failed}</span>}
                    <span>{formatClock(m.time, lang)}</span>
                    {m.mine && deliveryOf(m, reads[activeConv] ?? 0, !!contact) === "sent" && <Check size={14} aria-label={a.sentLabel} />}
                    {m.mine && deliveryOf(m, reads[activeConv] ?? 0, !!contact) === "read" && <Eye size={14} aria-label={a.readLabel} />}
                    {m.payload?.k === "text" && (
                      <button
                        type="button"
                        className={"ch-star" + (fav ? " ch-on" : "")}
                        aria-pressed={fav}
                        aria-busy={favBusy.has(favId(m))}
                        disabled={favBusy.has(favId(m))}
                        aria-label={fav ? a.unfavorite : a.favorite}
                        onClick={() => {
                          const id = favId(m);
                          if (favBusy.has(id)) return;
                          setFavError(null);
                          setFavBusy((b) => new Set(b).add(id));
                          void (fav ? removeFavorite(id) : addFavorite(activeConv, m, nameOf(m)))
                            .catch((e) => setFavError(errorOf(a, e)))
                            .finally(() =>
                              setFavBusy((b) => {
                                const next = new Set(b);
                                next.delete(id);
                                return next;
                              }),
                            );
                        }}
                      >
                        {favBusy.has(favId(m)) ? <span className="ch-spinner ch-spinner-sm" aria-hidden="true" /> : <Star size={14} fill={fav ? "currentColor" : "none"} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {selecting ? (
        <footer className="ch-composer ch-selectbar">
          <button type="button" className="ch-secondary" onClick={stopSelecting}>
            {a.cancel}
          </button>
          <span className="ch-hint ch-select-count" role="status">
            {a.selectedCount(chosen.length)}
          </span>
          <button type="button" className="ch-danger ch-btn-icon" disabled={chosen.length === 0 || deleting} onClick={() => setConfirming(true)}>
            <Trash2 size={18} aria-hidden="true" />
            {a.deleteSelected}
          </button>
        </footer>
      ) : isOfficial ? (
        <footer className="ch-composer ch-readonly">
          <span className="ch-hint">{a.officialReadonly}</span>
        </footer>
      ) : (
      <footer className="ch-composer">
        {open && (
          <ul className="ch-suggest" role="listbox" aria-label={a.mentionSuggestions}>
            {options.map((h, i) => (
              <li key={h} role="option" aria-selected={i === pick}>
                <button
                  type="button"
                  className={"ch-suggest-item" + (i === pick ? " ch-active" : "")}
                  // pointerdown, not click: the textarea must not lose focus (and the list must not vanish) before the pick lands
                  onPointerDown={(e) => {
                    e.preventDefault();
                    choose(h);
                  }}
                >
                  <Avatar userId={group!.members.find((x) => x.handle === h)?.userId ?? h} size={24} admin={group!.members.find((x) => x.handle === h)?.role === "admin"} />@{h}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!recording && (
        <textarea
          ref={inputRef}
          className="ch-input"
          rows={1}
          value={draft}
          disabled={!canSend}
          placeholder={a.placeholder}
          aria-label={a.placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart);
            setDismissed(false);
            setPick(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (open) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setPick((p) => (p + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                choose(options[pick] ?? options[0]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDismissed(true);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        )}
        <VoiceComposer key={activeConv} conv={activeConv} disabled={!canSend} onBusy={setRecording} onError={setFavError} />
        {!recording && (
        <div className="ch-composer-side">
          {length > MESSAGE_MAX_CHARS * 0.8 && <span className={length > MESSAGE_MAX_CHARS ? "ch-bad ch-hint" : "ch-hint"}>{a.charCount(length, MESSAGE_MAX_CHARS)}</span>}
          <div className="ch-emoji-wrap" ref={emojiRef}>
            {emojiOpen && (
              <div className="ch-emoji-panel" role="group" aria-label={a.emoji}>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="ch-emoji-item"
                    // pointerdown + preventDefault: the textarea keeps its focus, so the keyboard does not flicker
                    onPointerDown={(ev) => {
                      ev.preventDefault();
                      insertEmoji(e);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        insertEmoji(e);
                      }
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="ch-icon"
              aria-label={a.emoji}
              aria-expanded={emojiOpen}
              disabled={!canSend}
              onPointerDown={(ev) => ev.preventDefault()}
              onClick={() => setEmojiOpen((o) => !o)}
            >
              <Smile size={24} />
            </button>
          </div>
          <button type="button" className="ch-send" aria-label={a.send} disabled={!draft.trim() || length > MESSAGE_MAX_CHARS || !canSend} onClick={submit}>
            <Send size={20} />
          </button>
        </div>
        )}
      </footer>
      )}
      {confirming && (
        <Modal title={a.deleteTitle} onClose={() => !deleting && setConfirming(false)} closeLabel={a.close}>
          <p>{a.deleteBody(chosen.length, favoritesAmong(activeConv, chosen))}</p>
          <p className="ch-hint">{a.deleteWarn}</p>
          <button type="button" className="ch-danger ch-btn-icon" disabled={deleting} aria-busy={deleting} onClick={confirmDelete}>
            {deleting ? <span className="ch-spinner" aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
            {a.deleteConfirm}
          </button>
          <button type="button" className="ch-secondary" disabled={deleting} onClick={() => setConfirming(false)}>
            {a.cancel}
          </button>
        </Modal>
      )}
      {info && group && <GroupInfo group={group} onClose={() => setInfo(false)} />}
      {info && contact && !contact.deleted && <ContactInfo contact={contact} onClose={() => setInfo(false)} />}
      {link && (
        <Modal title={a.linkTitle} onClose={() => setLink(null)} closeLabel={a.close}>
          <p className="ch-hint">{a.linkWarn}</p>
          <p className="ch-link-target">{link}</p>
          <button
            type="button"
            className="ch-primary"
            onClick={() => {
              window.open(link, "_blank", "noopener,noreferrer");
              setLink(null);
            }}
          >
            {a.linkOpen}
          </button>
          <button type="button" className="ch-secondary" onClick={() => setLink(null)}>
            {a.cancel}
          </button>
        </Modal>
      )}
    </section>
  );
}
