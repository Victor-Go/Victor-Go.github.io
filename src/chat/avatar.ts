import { toDataUri } from "vicon-avatars";

const cache = new Map<string, string>();

/**
 * A Vicon landscape picture as a data: URI, generated from the user id, so everyone sees the same picture and renaming
 * never changes it. Used through <img>, so the SVG is never inserted into the page as markup.
 */
export function avatarUri(userId: string): string {
  let uri = cache.get(userId);
  if (!uri) {
    uri = toDataUri(userId);
    cache.set(userId, uri);
  }
  return uri;
}
