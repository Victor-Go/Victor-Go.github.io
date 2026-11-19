import type { Frame } from "./net/socket";
import { MicError, type IceServer, type Peer, type PeerEvents } from "./net/call";
import type { CallOutcome, CallReason, CallView } from "./store";

/**
 * The life of one voice call (docs/protocol.md section 9b of the chat server). The audio is WebRTC between the two browsers; this decides what
 * to send and what a frame means. Everything it touches is handed in, so a test can drive it with a fake peer and no network.
 *
 *   caller:  invite -> (answer) -> ice both ways -> connected -> end
 *   callee:  rings on invite -> answer (or decline) -> ice both ways -> connected -> end
 *
 * One call at a time. A frame whose call id is not the current one is ignored (the server relays blindly).
 *
 * **Presence is never revealed passively** (protocol section 9b): a callee who is already on a call, or whose browser cannot call, sends nothing; the
 * caller keeps hearing the ringback until the ring time is up and the call ends as "no answer", exactly as for somebody who is not there. There is no
 * "offline" or "busy" on the caller's screen. The one exception is the callee's own decision to decline: it is sent at once and ends the caller's call.
 *
 * Every call that rang leaves one message in the chat, written by the caller (`record`).
 */
export interface CallDeps {
  /** Sends a frame on the chat socket; false when it is not open. */
  send: (frame: Frame) => boolean;
  iceServers: () => Promise<IceServer[]>;
  microphone: () => Promise<MediaStream>;
  makePeer: (ice: IceServer[], mic: MediaStream, ev: PeerEvents) => Peer;
  /** Shows (or, with null, clears) the call on screen. */
  show: (view: CallView | null) => void;
  /** Keeps the session alive (a `ping` is not activity, and a call must not be cut by the idle timer). */
  touch: () => void;
  /** Rings (true) and stops ringing (false) for an incoming call. */
  ring: (on: boolean) => void;
  /** The ringback tone the caller hears while the other end rings (and the same while nobody answers). */
  ringback: (on: boolean) => void;
  /** Leaves the call record in the chat with this person: the caller's client does it once, when a call that rang has ended. */
  record: (userId: string, outcome: CallOutcome, sec: number) => void;
  /** Tells the person about an incoming call when the page is not being looked at. */
  notify: (userId: string) => void;
  /** Is this person one of my contacts? Calls from anybody else are ignored. */
  isContact: (userId: string) => boolean;
  newId: () => string;
  now: () => number;
  /** Can this browser make and take calls at all? When it cannot, an invite is ignored without a sound or a word (the caller sees "no answer"). */
  supported: () => boolean;
  /** My own user id: it decides which of two calls that cross is kept (the smaller id wins). Empty when not known, and then nothing is resolved. */
  myId: () => string;
}

/** How long a call rings before the caller gives up and the callee stops ringing. */
export const RING_MS = 45_000;
/** How long the end of a call stays on screen. */
export const ENDED_MS = 3000;
/** How often the session is kept alive during a call. */
export const KEEPALIVE_MS = 30_000;
/** How often the media path is looked at for the small status line of the call screen. */
export const NET_POLL_MS = 2000;

/** The server's reasons for refusing an invite, as the screen says them. */
const FAILED: Record<string, CallReason> = {
  not_allowed: "not_allowed",
  rate: "rate",
  not_found: "unavailable",
  not_contact: "unavailable",
  bad_request: "failed",
};

interface Current {
  view: CallView;
  /** Bumped by every new call and by finishing: an await that returns after that is dropped. */
  token: number;
  peer: Peer | null;
  mic: MediaStream | null;
  /** The caller's offer, kept while the callee decides. */
  offer: string;
  /** Candidates that came before the peer existed (the callee has not answered yet). */
  early: string[];
  /** Local candidates wait here until the invite or the answer is out: the other side cannot use them before. */
  outbox: string[] | null;
  ringTimer: ReturnType<typeof setTimeout> | undefined;
  keepTimer: ReturnType<typeof setInterval> | undefined;
  /** Polls the media path while the call is being made or on (diagnose); lastBytes tells whether audio is still arriving. */
  netTimer: ReturnType<typeof setInterval> | undefined;
  lastBytes: number;
  /** The invite went out: the call rang, so it leaves a record. */
  invited: boolean;
}

export function createCallFlow(d: CallDeps) {
  let cur: Current | null = null;
  let counter = 0;
  let endedTimer: ReturnType<typeof setTimeout> | undefined;

  const show = () => cur && d.show({ ...cur.view });
  const patchView = (p: Partial<CallView>) => {
    if (!cur) return;
    cur.view = { ...cur.view, ...p };
    show();
  };

  /**
   * Releases everything of the current call. `reason` shows how it ended for a moment; without one the screen clears at once. For a call I made that
   * rang, the record is written here: answered (with the seconds from the moment the audio came up), or what `opts.record` says it was while nobody had
   * answered, or failed (answered but the audio never came up). `opts.silent` writes none (signing out; the server refused the invite).
   */
  function finish(reason?: CallReason, opts: { record?: "noanswer" | "cancelled" | "declined"; silent?: boolean } = {}): void {
    const c = cur;
    if (!c) return;
    cur = null;
    counter++;
    clearTimeout(c.ringTimer);
    clearInterval(c.keepTimer);
    clearInterval(c.netTimer);
    d.ring(false);
    d.ringback(false);
    if (c.view.dir === "out" && c.invited && !opts.silent) {
      const up = c.view.startedAt;
      if (up !== null) d.record(c.view.userId, "answered", Math.max(0, Math.floor((d.now() - up) / 1000)));
      else if (opts.record) d.record(c.view.userId, opts.record, 0);
      else if (c.view.phase === "connecting") d.record(c.view.userId, "failed", 0);
    }
    c.peer?.close();
    for (const t of c.mic?.getTracks() ?? []) t.stop();
    clearTimeout(endedTimer);
    if (reason) {
      d.show({ ...c.view, phase: "ended", reason, remote: null });
      endedTimer = setTimeout(() => d.show(null), ENDED_MS);
    } else d.show(null);
  }

  function send(frame: Record<string, unknown>): boolean {
    return d.send({ t: "call", ...frame });
  }

  /** Local candidates go out once the invite / answer has, in order. */
  function sendCandidate(c: Current, json: string): void {
    if (c.outbox) c.outbox.push(json);
    else send({ id: c.view.id, to: c.view.userId, op: "ice", data: json });
  }
  function flushOutbox(c: Current): void {
    const queued = c.outbox ?? [];
    c.outbox = null;
    for (const json of queued) send({ id: c.view.id, to: c.view.userId, op: "ice", data: json });
  }

  /** Starts polling how the media path is doing (a peer that cannot say is not polled). */
  function watchNet(c: Current): void {
    const peer = c.peer;
    if (!peer?.diagnose) return;
    clearInterval(c.netTimer);
    c.netTimer = setInterval(() => {
      peer
        .diagnose?.()
        .then((n) => {
          if (cur !== c) return;
          const flowing = n.bytesIn > c.lastBytes;
          c.lastBytes = n.bytesIn;
          patchView({ net: { conn: n.conn, ice: n.ice, path: n.path, flowing } });
        })
        .catch(() => {});
    }, NET_POLL_MS);
  }

  function events(c: Current): PeerEvents {
    const live = () => cur === c;
    return {
      onCandidate: (json) => live() && sendCandidate(c, json),
      onRemoteStream: (stream) => live() && patchView({ remote: stream }),
      onConnected: () => {
        if (!live()) return;
        clearTimeout(c.ringTimer);
        d.ringback(false);
        patchView({ phase: "active", startedAt: d.now() });
        d.touch();
        clearInterval(c.keepTimer);
        c.keepTimer = setInterval(d.touch, KEEPALIVE_MS);
      },
      onFailed: () => {
        if (!live()) return;
        send({ id: c.view.id, to: c.view.userId, op: "end" });
        finish("failed");
      },
    };
  }

  /** The microphone and the ICE servers, for a call that is being made or answered. Null when the call was ended meanwhile (the microphone is released). */
  async function prepare(c: Current): Promise<{ ice: IceServer[]; mic: MediaStream } | null> {
    const token = c.token;
    let mic: MediaStream;
    try {
      mic = await d.microphone();
    } catch (e) {
      if (cur === c && c.token === token) finish(e instanceof MicError ? e.reason : "mic_failed");
      return null;
    }
    // Without the ICE answer the call still tries direct paths with what the browser knows.
    const ice = await d.iceServers().catch((): IceServer[] => []);
    if (cur !== c || c.token !== token) {
      for (const t of mic.getTracks()) t.stop();
      return null;
    }
    c.mic = mic;
    return { ice, mic };
  }

  function newCurrent(userId: string, dir: "out" | "in", id: string): Current {
    clearTimeout(endedTimer);
    return {
      view: { id, userId, dir, phase: dir === "out" ? "calling" : "ringing", muted: false, startedAt: null, remote: null },
      token: ++counter,
      peer: null,
      mic: null,
      offer: "",
      early: [],
      outbox: [],
      ringTimer: undefined,
      keepTimer: undefined,
      netTimer: undefined,
      lastBytes: 0,
      invited: false,
    };
  }

  const api = {
    /** Is there a call going on (ringing, connecting or active)? */
    busy: (): boolean => cur !== null,

    /** Starts a call to a contact. Resolves when the invite is out (or the call has failed and says so). */
    async start(userId: string): Promise<void> {
      if (cur) return;
      const c = (cur = newCurrent(userId, "out", d.newId()));
      show();
      const got = await prepare(c);
      if (!got) return;
      try {
        c.peer = d.makePeer(got.ice, got.mic, events(c));
        watchNet(c);
        const offer = await c.peer.offer();
        if (cur !== c) return;
        if (!send({ id: c.view.id, to: userId, op: "invite", data: offer })) return finish("unreachable");
        c.invited = true;
        d.ringback(true);
        flushOutbox(c);
        c.ringTimer = setTimeout(() => {
          if (cur !== c || c.view.phase !== "calling") return;
          send({ id: c.view.id, to: userId, op: "end" });
          finish("no_answer", { record: "noanswer" });
        }, RING_MS);
      } catch {
        if (cur === c) finish("failed");
      }
    },

    /** The callee accepts. */
    async answer(): Promise<void> {
      const c = cur;
      if (!c || c.view.dir !== "in" || c.view.phase !== "ringing") return;
      clearTimeout(c.ringTimer);
      d.ring(false);
      patchView({ phase: "connecting" });
      const got = await prepare(c);
      if (!got) {
        // The microphone failed after answering: the call ends (the person did answer, so this tells the caller nothing new).
        send({ id: c.view.id, to: c.view.userId, op: "end" });
        return;
      }
      try {
        c.peer = d.makePeer(got.ice, got.mic, events(c));
        watchNet(c);
        const answer = await c.peer.accept(c.offer);
        if (cur !== c) return;
        send({ id: c.view.id, to: c.view.userId, op: "answer", data: answer });
        flushOutbox(c);
        for (const json of c.early.splice(0)) await c.peer.addCandidate(json);
      } catch {
        if (cur === c) {
          send({ id: c.view.id, to: c.view.userId, op: "end" });
          finish("failed");
        }
      }
    },

    /** The callee refuses: the caller is told at once (their call ends), the ring stops and the screen clears. */
    decline(): void {
      const c = cur;
      if (!c || c.view.dir !== "in" || c.view.phase !== "ringing") return;
      send({ id: c.view.id, to: c.view.userId, op: "decline" });
      finish();
    },

    /** Hang up, or cancel a call that is still ringing. */
    hangUp(): void {
      const c = cur;
      if (!c) return;
      if (c.view.phase === "ended") return;
      send({ id: c.view.id, to: c.view.userId, op: "end" });
      finish(undefined, { record: "cancelled" });
    },

    setMuted(muted: boolean): void {
      if (!cur) return;
      cur.peer?.setMuted(muted);
      for (const t of cur.mic?.getAudioTracks() ?? []) t.enabled = !muted;
      patchView({ muted });
    },

    /** Drops the call without telling anybody (the person signed out, the socket is gone). */
    reset(): void {
      finish(undefined, { silent: true });
      clearTimeout(endedTimer);
    },

    /** A `call` frame from the server. */
    onFrame(f: Frame): void {
      const op = String(f.op ?? "");
      const id = String(f.id ?? "");
      const from = typeof f.from === "string" ? f.from : "";
      const data = typeof f.data === "string" ? f.data : "";

      if (op === "invite") {
        if (!from || !id || !data || !d.isContact(from)) return;
        // A browser that cannot take a call does not ring: the person could not answer it, and the caller must not learn why (or that anybody is here).
        if (!d.supported()) return;
        // Already on a call: nothing is sent back (the caller must not learn that I am here and busy); it shows up as a missed call from their record.
        // One case is not "busy": we are ringing each other at the same moment. Both would ring out for nothing, so both sides apply the same rule: the call
        // of the person with the smaller user id stays. The other side gives up its own call (no record: it was never meant to be one) and answers that call at
        // once, as the person was trying to talk to them anyway. The side that stays ignores the other's invite, so only one call ever connects.
        let crossed = false;
        if (cur) {
          const mine = cur;
          const me = d.myId();
          const crossing = mine.view.dir === "out" && mine.view.phase === "calling" && mine.view.userId === from && mine.view.id !== id;
          if (!crossing || !me || me < from) return;
          finish(undefined, { silent: true });
          crossed = true;
        }
        const c = (cur = newCurrent(from, "in", id));
        c.offer = data;
        c.outbox = []; // candidates made while answering wait until the answer is out
        show();
        if (crossed) {
          void api.answer();
          return;
        }
        d.ring(true);
        d.notify(from);
        c.ringTimer = setTimeout(() => {
          if (cur !== c || c.view.phase !== "ringing") return;
          finish("missed");
        }, RING_MS);
        return;
      }

      const c = cur;
      if (!c || c.view.id !== id) return;
      if (from && from !== c.view.userId) return;

      if (op === "failed") {
        // The server did not relay my invite (or a later frame): only the invite's refusal ends the call.
        if (c.view.dir === "out" && c.view.phase === "calling") finish(FAILED[String(f.reason ?? "")] ?? "failed", { silent: true });
      } else if (op === "answer") {
        if (c.view.dir === "out" && c.view.phase === "calling" && c.peer && data) {
          clearTimeout(c.ringTimer);
          d.ringback(false); // somebody answered: the tone stops
          patchView({ phase: "connecting" });
          c.peer.setAnswer(data).catch(() => {
            if (cur === c) {
              send({ id: c.view.id, to: c.view.userId, op: "end" });
              finish("failed");
            }
          });
        }
      } else if (op === "ice") {
        if (!data) return;
        if (c.peer) void c.peer.addCandidate(data);
        else c.early.push(data);
      } else if (op === "decline") {
        // The callee refused while it rang: my call ends now and the record says it was declined.
        if (c.view.dir === "out" && c.view.phase === "calling") finish("declined", { record: "declined" });
      } else if (op === "end") {
        // An `end` before I answered (or before the audio came up for the caller) is a call that was not taken up.
        const unanswered = c.view.dir === "out" && c.view.phase === "calling";
        finish(c.view.phase === "ringing" ? "missed" : unanswered ? "no_answer" : "ended", unanswered ? { record: "noanswer" } : {});
      }
    },
  };
  return api;
}

export type CallFlow = ReturnType<typeof createCallFlow>;
