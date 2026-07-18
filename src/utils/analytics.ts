const MEASUREMENT_ID = "G-K1S7YJTBEE";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;
let lastTrackedPath: string | undefined;

function gtag(...args: unknown[]) {
  window.dataLayer ??= [];
  window.dataLayer.push(args);
}

/** Loads GA4 only in production and disables its automatic page-view event. */
export function initializeAnalytics() {
  if (initialized || !import.meta.env.PROD) return;

  initialized = true;
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.append(script);
}

/** Records an SPA page view once for each distinct URL. */
export function trackPageView() {
  if (!initialized) return;

  const pagePath = `${window.location.pathname}${window.location.search}`;
  if (pagePath === lastTrackedPath) return;

  lastTrackedPath = pagePath;
  gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: pagePath,
    page_title: document.title,
  });
}
