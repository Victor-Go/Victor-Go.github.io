// Shared by the source guard and the build guard. Lives in __tests__ (not scanned) so the
// literal patterns below never trip the scan of the shipped sources.
export interface Forbidden {
  label: string;
  re: RegExp;
}

export const FORBIDDEN: Forbidden[] = [
  { label: 'document.cookie', re: /document\s*\.\s*cookie/ },
  { label: 'localStorage', re: /localStorage/ },
  { label: 'sessionStorage', re: /sessionStorage/ },
  { label: 'indexedDB', re: /indexedDB/i },
  { label: 'caches', re: /\bcaches\b/ },
  { label: 'serviceWorker', re: /serviceWorker/ },
  { label: 'window.name', re: /window\s*\.\s*name\b/ },
  { label: 'pushState', re: /pushState/ },
  { label: 'replaceState', re: /replaceState/ },
  { label: 'fetch', re: /\bfetch\b/ },
  { label: 'XMLHttpRequest', re: /XMLHttpRequest/ },
  { label: 'WebSocket', re: /WebSocket/ },
  { label: 'sendBeacon', re: /sendBeacon/ },
  { label: 'EventSource', re: /EventSource/ },
  { label: 'gtag', re: /gtag/ },
  { label: 'console.log', re: /console\s*\.\s*log/ },
  { label: 'Math.random', re: /Math\s*\.\s*random/ },
];

export function findForbidden(text: string): string[] {
  return FORBIDDEN.filter((f) => f.re.test(text)).map((f) => f.label);
}
