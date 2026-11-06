/** The three addresses of the one-page app. Which page the browser loaded decides the first view. */
export const PATH_ACCOUNT = "/chat/account/";
export const PATH_HOME = "/chat/";
export const PATH_MANAGEMENT = "/chat/management/";

export const wantsManagement = (pathname: string): boolean => /^\/chat\/management\/?$/.test(pathname);

/**
 * Keeps the address bar honest without reloading (the session lives only in memory, so a reload would sign
 * the user out). Nothing is written to history state, only the path changes.
 */
export function showPath(path: string): void {
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
}
