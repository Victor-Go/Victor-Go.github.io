import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENDED_MS, RING_MS, createCallFlow, type CallDeps } from "../callFlow";
import { MicError, type IceServer, type Peer, type PeerEvents } from "../net/call";
import type { Frame } from "../net/socket";
import type { CallOutcome, CallView } from "../store";

class FakePeer implements Peer {
  closed = false;
  muted = false;
  candidates: string[] = [];
  answerSet = "";
  accepted = "";
  ev: PeerEvents;
  constructor(ev: PeerEvents) {
    this.ev = ev;
  }
  async offer() {
    return "OFFER";
  }
  async accept(offer: string) {
    this.accepted = offer;
    return "ANSWER";
  }
  async setAnswer(a: string) {
    this.answerSet = a;
  }
  async addCandidate(json: string) {
    this.candidates.push(json);
  }
  setMuted(m: boolean) {
    this.muted = m;
  }
  close() {
    this.closed = true;
  }
}

const track = () => ({
  stopped: false,
  enabled: true,
  stop() {
    this.stopped = true;
  },
});

function setup(over: Partial<CallDeps> = {}) {
  const sent: Frame[] = [];
  const views: (CallView | null)[] = [];
  const rings: boolean[] = [];
  const backs: boolean[] = [];
  const records: [string, CallOutcome, number][] = [];
  const peers: FakePeer[] = [];
  const mics: { t: ReturnType<typeof track> }[] = [];
  const touches = { n: 0 };
  const clock = { now: 1000 };
  let n = 0;
  const deps: CallDeps = {
    send: (f) => (sent.push(f), true),
    iceServers: async (): Promise<IceServer[]> => [{ urls: "stun:x" }],
    microphone: async () => {
      const t = track();
      mics.push({ t });
      return { getTracks: () => [t], getAudioTracks: () => [t] } as unknown as MediaStream;
    },
    makePeer: (_ice, _mic, ev) => {
      const p = new FakePeer(ev);
      peers.push(p);
      return p;
    },
    show: (v) => views.push(v),
    touch: () => void touches.n++,
    ring: (on) => rings.push(on),
    ringback: (on) => backs.push(on),
    record: (userId, outcome, sec) => records.push([userId, outcome, sec]),
    notify: () => {},
    isContact: (id) => id === "bob",
    newId: () => `call${++n}`,
    now: () => clock.now,
    ...over,
  };
  const flow = createCallFlow(deps);
  return { flow, sent, views, rings, backs, records, peers, mics, touches, clock, last: () => views[views.length - 1] };
}
const calls = (sent: Frame[], op: string) => sent.filter((f) => f.t === "call" && f.op === op);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("calling out", () => {
  it("sends the offer as an invite, then the candidates, and plays the ringback from the moment the invite is out", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.peers[0].ev.onCandidate("c1");
    expect(t.sent.map((f) => `${f.op}:${f.data ?? ""}`)).toEqual(["invite:OFFER", "ice:c1"]);
    expect(t.sent[0]).toMatchObject({ t: "call", id: "call1", to: "bob" });
    expect(t.last()).toMatchObject({ phase: "calling", dir: "out", userId: "bob" });
    expect(t.backs).toEqual([true]);
  });

  it("holds candidates that are gathered before the invite is out", async () => {
    let release!: () => void;
    const t = setup({
      makePeer: (_i, _m, ev) => {
        const p = new FakePeer(ev);
        p.offer = async () => {
          ev.onCandidate("early");
          await new Promise<void>((r) => (release = r));
          return "OFFER";
        };
        return p;
      },
    });
    const started = t.flow.start("bob");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sent).toEqual([]);
    expect(t.backs).toEqual([]); // nothing rings before the invite is out
    release();
    await started;
    expect(t.sent.map((f) => f.op)).toEqual(["invite", "ice"]);
  });

  it("goes to connecting on the answer (the ringback stops), then active when the media is up, and keeps the session alive", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "answer", data: "ANS" });
    expect(t.peers[0].answerSet).toBe("ANS");
    expect(t.last()?.phase).toBe("connecting");
    expect(t.backs).toEqual([true, false]);
    t.peers[0].ev.onConnected();
    expect(t.last()).toMatchObject({ phase: "active", startedAt: 1000 });
    expect(t.touches.n).toBe(1);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(t.touches.n).toBe(2);
  });

  it("hanging up tells the other side, releases the microphone and the peer, and clears the screen", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.hangUp();
    expect(calls(t.sent, "end")).toHaveLength(1);
    expect(t.peers[0].closed).toBe(true);
    expect(t.mics[0].t.stopped).toBe(true);
    expect(t.last()).toBeNull();
    expect(t.flow.busy()).toBe(false);
    expect(t.backs.at(-1)).toBe(false);
  });

  it("gives up after the ring time with `end`, says nobody answered, and clears after a moment", async () => {
    const t = setup();
    await t.flow.start("bob");
    await vi.advanceTimersByTimeAsync(RING_MS + 1);
    expect(calls(t.sent, "end")).toHaveLength(1);
    expect(t.last()).toMatchObject({ phase: "ended", reason: "no_answer" });
    await vi.advanceTimersByTimeAsync(ENDED_MS + 1);
    expect(t.last()).toBeNull();
  });

  it("shows why the server refused the invite, and records nothing (the call never rang)", async () => {
    for (const [reason, shown] of [["not_allowed", "not_allowed"], ["rate", "rate"], ["not_contact", "unavailable"], ["not_found", "unavailable"], ["weird", "failed"]] as const) {
      const t = setup();
      await t.flow.start("bob");
      t.flow.onFrame({ t: "call", id: "call1", op: "failed", reason });
      expect(t.last()).toMatchObject({ phase: "ended", reason: shown });
      expect(t.peers[0].closed).toBe(true);
      expect(t.records).toEqual([]);
    }
  });

  it("a microphone that cannot be used ends the call before anything is sent, with no record", async () => {
    const t = setup({
      microphone: async () => {
        throw new MicError("mic_denied");
      },
    });
    await t.flow.start("bob");
    expect(t.sent).toEqual([]);
    expect(t.backs).not.toContain(true);
    expect(t.records).toEqual([]);
    expect(t.last()).toMatchObject({ phase: "ended", reason: "mic_denied" });
  });

  it("a socket that is not open ends it as unreachable, with no record", async () => {
    const t = setup({ send: () => false });
    await t.flow.start("bob");
    expect(t.last()).toMatchObject({ phase: "ended", reason: "unreachable" });
    expect(t.records).toEqual([]);
  });

  it("is one call at a time, and mute reaches the track and the screen", async () => {
    const t = setup();
    await t.flow.start("bob");
    await t.flow.start("bob");
    expect(t.peers).toHaveLength(1);
    t.flow.setMuted(true);
    expect(t.peers[0].muted).toBe(true);
    expect(t.mics[0].t.enabled).toBe(false);
    expect(t.last()?.muted).toBe(true);
  });
});

describe("presence is never revealed to the caller", () => {
  it("a decline frame (there is none any more) changes nothing: the call rings out and ends as no answer", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "decline", data: "busy" });
    expect(t.last()).toMatchObject({ phase: "calling" });
    await vi.advanceTimersByTimeAsync(RING_MS + 1);
    expect(t.last()).toMatchObject({ reason: "no_answer" });
    expect(t.records).toEqual([["bob", "noanswer", 0]]);
  });

  it("the caller of a person who is not there sees exactly what the caller of one who ignores the ring sees: the frames sent and the screens are the same", async () => {
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const t = setup();
      await t.flow.start("bob");
      if (i === 1) t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "ice", data: "x" }); // somebody was there and rang, ignored it
      await vi.advanceTimersByTimeAsync(RING_MS + 1);
      runs.push({ views: t.views.map((v) => v && [v.phase, v.reason]), records: t.records, ends: calls(t.sent, "end").length });
    }
    expect(runs[1]).toEqual(runs[0]);
  });
});

describe("the call record (written by the caller, once, when a call that rang ends)", () => {
  it("answered: the seconds from the moment the audio came up to the hang-up", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "answer", data: "ANS" });
    t.clock.now = 5000;
    t.peers[0].ev.onConnected();
    t.clock.now = 5000 + 187_400;
    t.flow.hangUp();
    expect(t.records).toEqual([["bob", "answered", 187]]);
  });

  it("answered, and the other side hangs up", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "answer", data: "ANS" });
    t.peers[0].ev.onConnected();
    t.clock.now += 61_000;
    t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "end" });
    expect(t.records).toEqual([["bob", "answered", 61]]);
    expect(t.last()).toMatchObject({ reason: "ended" });
  });

  it("cancelled: hung up before anybody answered", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.hangUp();
    expect(t.records).toEqual([["bob", "cancelled", 0]]);
  });

  it("no answer: rang out", async () => {
    const t = setup();
    await t.flow.start("bob");
    await vi.advanceTimersByTimeAsync(RING_MS + 1);
    expect(t.records).toEqual([["bob", "noanswer", 0]]);
  });

  it("failed: answered, but the audio never came up", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "answer", data: "ANS" });
    t.peers[0].ev.onFailed();
    expect(calls(t.sent, "end")).toHaveLength(1);
    expect(t.records).toEqual([["bob", "failed", 0]]);
    expect(t.last()).toMatchObject({ reason: "failed" });
  });

  it("a callee that ends before answering reads as no answer", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.onFrame({ t: "call", id: "call1", from: "bob", op: "end" });
    expect(t.last()).toMatchObject({ reason: "no_answer" });
    expect(t.records).toEqual([["bob", "noanswer", 0]]);
  });

  it("signing out leaves no record, and the callee never writes one", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.flow.reset();
    expect(t.records).toEqual([]);
    const u = setup();
    u.flow.onFrame({ t: "call", id: "in1", from: "bob", op: "invite", data: "O" });
    await u.flow.answer();
    u.peers[0].ev.onConnected();
    u.flow.hangUp();
    expect(u.records).toEqual([]);
  });
});

describe("being called", () => {
  const invite = (id = "in1", from = "bob") => ({ t: "call", id, from, op: "invite", data: "THEIR-OFFER" });

  it("rings; answering sends the answer, then the candidates; candidates that came early are applied", async () => {
    const t = setup();
    t.flow.onFrame(invite());
    expect(t.rings).toEqual([true]);
    expect(t.backs).toEqual([]); // the ringback is the caller's
    expect(t.last()).toMatchObject({ phase: "ringing", dir: "in", userId: "bob" });
    t.flow.onFrame({ t: "call", id: "in1", from: "bob", op: "ice", data: "theirs-1" });
    await t.flow.answer();
    expect(t.rings).toEqual([true, false]);
    expect(t.peers[0].accepted).toBe("THEIR-OFFER");
    expect(t.sent.map((f) => f.op)).toEqual(["answer"]);
    expect(t.sent[0]).toMatchObject({ id: "in1", to: "bob", data: "ANSWER" });
    expect(t.peers[0].candidates).toEqual(["theirs-1"]);
    t.peers[0].ev.onCandidate("mine");
    t.flow.onFrame({ t: "call", id: "in1", from: "bob", op: "ice", data: "theirs-2" });
    expect(t.sent.map((f) => f.op)).toEqual(["answer", "ice"]);
    expect(t.peers[0].candidates).toEqual(["theirs-1", "theirs-2"]);
  });

  it("declining sends NOTHING (the caller must not tell it from nobody being there), stops the ring and clears the screen", () => {
    const t = setup();
    t.flow.onFrame(invite());
    t.flow.decline();
    expect(t.sent).toEqual([]);
    expect(t.rings.at(-1)).toBe(false);
    expect(t.last()).toBeNull();
  });

  it("the caller gives up while it rings: a missed call", () => {
    const t = setup();
    t.flow.onFrame(invite());
    t.flow.onFrame({ t: "call", id: "in1", from: "bob", op: "end" });
    expect(t.last()).toMatchObject({ phase: "ended", reason: "missed" });
    expect(t.rings.at(-1)).toBe(false);
  });

  it("an unanswered invite stops ringing by itself", async () => {
    const t = setup();
    t.flow.onFrame(invite());
    await vi.advanceTimersByTimeAsync(RING_MS + 1);
    expect(t.last()).toMatchObject({ reason: "missed" });
  });

  it("an invite during a call is ignored without a word back; so are strangers and frames of other calls", () => {
    const t = setup();
    t.flow.onFrame(invite("first"));
    t.flow.onFrame(invite("second"));
    expect(t.sent).toEqual([]);
    t.flow.onFrame({ t: "call", id: "other", from: "bob", op: "end" });
    expect(t.last()?.phase).toBe("ringing");
    const u = setup();
    u.flow.onFrame(invite("x", "stranger"));
    expect(u.views).toEqual([]);
    expect(u.rings).toEqual([]);
  });

  it("a microphone that fails when answering ends the call with an `end`", async () => {
    const t = setup({
      microphone: async () => {
        throw new MicError("mic_missing");
      },
    });
    t.flow.onFrame(invite());
    await t.flow.answer();
    expect(calls(t.sent, "end")).toHaveLength(1);
    expect(t.last()).toMatchObject({ reason: "mic_missing" });
  });

  it("reset (signing out) drops the call without telling anybody", async () => {
    const t = setup();
    await t.flow.start("bob");
    t.sent.length = 0;
    t.flow.reset();
    expect(t.sent).toEqual([]);
    expect(t.peers[0].closed).toBe(true);
    expect(t.mics[0].t.stopped).toBe(true);
    expect(t.last()).toBeNull();
  });
});
