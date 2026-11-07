import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, Info, Send, ShieldAlert, ShieldOff, Smile, Star } from "lucide-react";
import { PATH, go } from "../route";
import { ApiError, addFavorite, loadOlder, removeFavorite, sendText } from "../client";
import { errorText } from "../i18nApp";
import { MESSAGE_MAX_CHARS } from "../crypto/message";
import { deliveryOf } from "../delivery";
import { dayKey, formatClock, formatDay, isExpired } from "../format";
import { applyMention, mentionQuery, splitMentions, suggest } from "../mentions";
import { useChat, type Msg } from "../store";
import { useLang } from "../useChat";
import { GroupInfo } from "./GroupInfo";
import { splitLinks } from "../links";
import { Avatar, Modal } from "./ui";
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

export function Conversation() {
  const { lang, a } = useLang();
  const { activeConv, contacts, groups, messages, me, retentionDays, favorites, reads, olderMore } = useChat();
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
  // Scroll position to restore after older messages were put above: [scrollHeight, scrollTop] from before the load.
  const keepAt = useRef<[number, number] | null>(null);
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
  const list = (activeConv ? messages[activeConv] : undefined) ?? [];
  const now = Date.now();
  const visible = list.filter((msg) => !isExpired(msg.time, now, retentionDays));

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (keepAt.current) {
      // Older messages arrived above: stay on the message that was being read.
      el.scrollTop = el.scrollHeight - keepAt.current[0] + keepAt.current[1];
      keepAt.current = null;
    } else el.scrollTop = el.scrollHeight;
  }, [visible.length, activeConv]);
  // Scrolling to the top loads the next 20 older messages. A chat too short to scroll loads on its own until it fills the screen or runs out.
  const more = activeConv ? !!olderMore[activeConv] : false;
  const pageOlder = () => {
    const el = listRef.current;
    if (!activeConv || !more || loadingOlder || !el) return;
    keepAt.current = [el.scrollHeight, el.scrollTop];
    setLoadingOlder(true);
    void loadOlder(activeConv)
      .catch(() => {})
      .finally(() => {
        keepAt.current = null;
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

  if (!activeConv || (!contact && !group) || !me) {
    return (
      <div className="ch-empty">
        <p>{a.pickChat}</p>
      </div>
    );
  }
  const title = contact ? `@${contact.handle}` : group!.name;
  const canSend = contact ? contact.key !== null && !contact.deleted : (group?.keys.get(group.gen) ?? null) !== null;
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
        <Avatar userId={contact?.userId ?? group!.id} size={36} admin={contact?.role === "admin"} />
        <div className="ch-row-text">
          <div className="ch-row-title">
            {title} {contact?.role === "admin" && <span className="ch-admin">{a.adminBadge}</span>}
          </div>
          <div className="ch-hint">{group ? a.memberCount(group.members.length) : a.encryptedNote}</div>
        </div>
        {group && (
          <button type="button" className="ch-icon" aria-label={a.groupInfo} onClick={() => setInfo(true)}>
            <Info size={20} />
          </button>
        )}
      </header>

      <div className="ch-messages" ref={listRef} onScroll={(e) => e.currentTarget.scrollTop < 60 && pageOlder()}>
        <div className="ch-retention">{a.retentionTop(retentionDays)}</div>
        {more && (
          <div className="ch-more-spin" role="status" aria-label={a.working}>
            {loadingOlder ? <span className="ch-spinner" /> : <button type="button" className="ch-more" onClick={pageOlder}>{a.loadOlder}</button>}
          </div>
        )}
        {favError && <div className="ch-notice">{favError}</div>}
        {contact?.deleted && <div className="ch-notice">{a.contactDeleted}</div>}
        {!canSend && !contact?.deleted && <div className="ch-notice">{contact ? a.keyMissingHint : a.keyMissing}</div>}
        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const newDay = !prev || dayKey(prev.time) !== dayKey(m.time);
          const fav = favorites.some((f) => f.id === favId(m));
          return (
            <Fragment key={`${m.senderId}.${m.id}`}>
              {newDay && <div className="ch-day">{formatDay(m.time, now, lang, { today: a.today, yesterday: a.yesterday })}</div>}
              {!m.payload ? (
                // A destroyed or unverifiable message is a full-width system card with an icon, which no message text can imitate (text only ever appears in a bubble).
                <div className="ch-system" role="note" data-lost={m.lost ?? "unverified"}>
                  {m.lost === "destroyed" ? <ShieldOff size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}
                  <strong>{m.lost === "destroyed" ? a.undecryptable : a.unverified}</strong>
                  <span>
                    @{nameOf(m)} · {formatClock(m.time, lang)}
                  </span>
                </div>
              ) : (
              <div className={"ch-msgrow" + (m.mine ? " ch-mine" : "")}>
                {group && !m.mine ? (
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
                            .catch((e) => setFavError(errorText(a, e instanceof ApiError ? e.code : "internal")))
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
      {info && group && <GroupInfo group={group} onClose={() => setInfo(false)} />}
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
