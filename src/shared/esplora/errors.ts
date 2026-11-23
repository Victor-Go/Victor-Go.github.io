/** The provider answered, and the answer is "no such thing" (404), "bad request" (400) or "unknown cursor" (422). */
export class NotFoundError extends Error {
  status = 404;
}
/** Every provider tried failed (timeout, 5xx, 429, no connection). Worth retrying later. */
export class NetworkError extends Error {}
/** A provider answered with something that is not the expected shape. */
export class BadResponseError extends Error {}
