export type Delivery = "sending" | "failed" | "sent" | "read";

/**
 * What to show next to one of my messages: sending, failed, a check (the server has it) or an eye (the other person has read it).
 * Only 1:1 chats have read receipts; in a group the best a message gets is the check.
 */
export function deliveryOf(msg: { status: "sending" | "sent" | "failed"; seq: number }, peerRead: number, oneToOne: boolean): Delivery {
  if (msg.status !== "sent") return msg.status;
  return oneToOne && msg.seq > 0 && msg.seq <= peerRead ? "read" : "sent";
}
