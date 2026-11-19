/**
 * One WebRTC peer connection for a voice call (protocol section 9b of the chat server). The audio goes between the two browsers (DTLS-SRTP, which
 * the browser enforces), through the TURN relay only when no direct path exists; nothing here touches the chat socket: the descriptions and
 * candidates are handed out as strings and the caller sends them as `call` frames. It lives in net/ because it is a network connection.
 */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** What a call's owner wants to hear about. */
export interface PeerEvents {
  /** One local ICE candidate, as a JSON string to send as an `ice` frame. */
  onCandidate: (json: string) => void;
  /** The other person's audio. */
  onRemoteStream: (stream: MediaStream) => void;
  /** The media path is up (a direct one or through the relay). */
  onConnected: () => void;
  /** The media path failed or was lost for good. */
  onFailed: () => void;
}

/** What the call flow needs of a peer; `CallPeer` is the real one and tests use a fake. */
export interface Peer {
  /** The offer to send as the `invite`. */
  offer(): Promise<string>;
  /** Takes the caller's offer and returns the answer to send. */
  accept(offer: string): Promise<string>;
  setAnswer(answer: string): Promise<void>;
  addCandidate(json: string): Promise<void>;
  setMuted(muted: boolean): void;
  close(): void;
  /** Where the media path stands (optional: a fake peer has none). */
  diagnose?(): Promise<PeerNet>;
}

/** The state of the media path: the browser's own states, whether it runs direct or through the relay, and the audio bytes received so far. */
export interface PeerNet {
  conn: string;
  ice: string;
  path: "direct" | "relay" | "none";
  bytesIn: number;
}

export type PeerFactory = (config: RTCConfiguration) => RTCPeerConnection;

/** A short loss of the path ("disconnected") often heals by itself; only a loss that lasts is a failure. */
export const DISCONNECT_GRACE_MS = 8000;

/** The most one description or candidate may be (the server refuses a frame's `data` above 12 KiB). */
export const SIGNAL_MAX = 12 * 1024;

export class CallPeer implements Peer {
  private readonly pc: RTCPeerConnection;
  private readonly pending: string[] = [];
  private haveRemote = false;
  private closed = false;
  private graceTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly local: MediaStream;
  private readonly ev: PeerEvents;

  constructor(iceServers: IceServer[], local: MediaStream, ev: PeerEvents, make: PeerFactory = (config) => new RTCPeerConnection(config)) {
    this.local = local;
    this.ev = ev;
    this.pc = make({ iceServers });
    for (const track of local.getAudioTracks()) this.pc.addTrack(track, local);
    this.pc.onicecandidate = (e) => {
      if (this.closed || !e.candidate) return;
      const json = JSON.stringify(e.candidate.toJSON());
      if (json.length <= SIGNAL_MAX) this.ev.onCandidate(json);
    };
    this.pc.ontrack = (e) => {
      if (!this.closed) this.ev.onRemoteStream(e.streams[0] ?? new MediaStream([e.track]));
    };
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const st = this.pc.connectionState;
      clearTimeout(this.graceTimer);
      if (st === "connected") this.ev.onConnected();
      else if (st === "failed") this.ev.onFailed();
      else if (st === "disconnected") {
        this.graceTimer = setTimeout(() => {
          if (!this.closed && this.pc.connectionState === "disconnected") this.ev.onFailed();
        }, DISCONNECT_GRACE_MS);
      }
    };
  }

  private async describe(kind: "offer" | "answer"): Promise<string> {
    const d = kind === "offer" ? await this.pc.createOffer() : await this.pc.createAnswer();
    await this.pc.setLocalDescription(d);
    const text = JSON.stringify({ type: d.type, sdp: d.sdp });
    if (text.length > SIGNAL_MAX) throw new Error("description too large");
    return text;
  }

  private async setRemote(text: string, type: "offer" | "answer"): Promise<void> {
    const d = JSON.parse(text) as RTCSessionDescriptionInit;
    if (d?.type !== type || typeof d.sdp !== "string") throw new Error("bad description");
    await this.pc.setRemoteDescription({ type, sdp: d.sdp });
    this.haveRemote = true;
    // Candidates that came before the description are added now.
    for (const c of this.pending.splice(0)) await this.addCandidate(c);
  }

  offer(): Promise<string> {
    return this.describe("offer");
  }

  async accept(offer: string): Promise<string> {
    await this.setRemote(offer, "offer");
    return this.describe("answer");
  }

  setAnswer(answer: string): Promise<void> {
    return this.setRemote(answer, "answer");
  }

  async addCandidate(json: string): Promise<void> {
    if (this.closed) return;
    if (!this.haveRemote) {
      this.pending.push(json);
      return;
    }
    try {
      await this.pc.addIceCandidate(JSON.parse(json) as RTCIceCandidateInit);
    } catch {
      /* one bad candidate does not end a call */
    }
  }

  setMuted(muted: boolean): void {
    for (const t of this.local.getAudioTracks()) t.enabled = !muted;
  }

  async diagnose(): Promise<PeerNet> {
    const byId = new Map<string, Record<string, unknown>>();
    let pairId = "";
    let bytesIn = 0;
    (await this.pc.getStats()).forEach((r: Record<string, unknown>) => {
      byId.set(String(r.id), r);
      if (r.type === "transport" && typeof r.selectedCandidatePairId === "string") pairId = r.selectedCandidatePairId;
      if (r.type === "inbound-rtp" && r.kind === "audio") bytesIn += Number(r.bytesReceived ?? 0);
    });
    const pair = byId.get(pairId) ?? [...byId.values()].find((r) => r.type === "candidate-pair" && r.nominated === true && r.state === "succeeded");
    let path: PeerNet["path"] = "none";
    if (pair) {
      const kinds = [byId.get(String(pair.localCandidateId)), byId.get(String(pair.remoteCandidateId))].map((c) => c?.candidateType);
      path = kinds.includes("relay") ? "relay" : "direct";
    }
    return { conn: this.pc.connectionState, ice: this.pc.iceConnectionState, path, bytesIn };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.graceTimer);
    this.pc.onicecandidate = this.pc.ontrack = this.pc.onconnectionstatechange = null;
    for (const t of this.local.getTracks()) t.stop(); // the microphone is released with the call
    try {
      this.pc.close();
    } catch {
      /* already closed */
    }
  }
}

/** Why the microphone could not be used, in the words of the call screen. */
export type MicFailure = "mic_denied" | "mic_missing" | "mic_failed" | "unsupported";

export class MicError extends Error {
  readonly reason: MicFailure;
  constructor(reason: MicFailure) {
    super(reason);
    this.reason = reason;
  }
}

/** Is a call possible in this browser at all? (A secure page and the media and peer APIs.) */
export function callsSupported(): boolean {
  return typeof RTCPeerConnection !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Asks for the microphone, only now. Throws MicError. */
export async function openMicrophone(): Promise<MediaStream> {
  if (!callsSupported()) throw new MicError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("mic_denied");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("mic_missing");
    throw new MicError("mic_failed");
  }
}
