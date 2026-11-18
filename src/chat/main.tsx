import { createRoot } from "react-dom/client";
import "./chat.css";
import "./app.css";
import "./ios.css";
import { App } from "./App";
import { refreshEndpoints } from "./net/endpoints";

/** How long the page waits for the signed address list before it is drawn with the build's own addresses. */
const ENDPOINTS_WAIT_MS = 2500;

// The pools are read when the app is built, so the signed list (if the build has a key for it) has to be in before that. It is a small file
// from the page's own host, so this is normally instant; a source that does not answer holds the page up for the wait above at most.
void Promise.race([refreshEndpoints(), new Promise<void>((resolve) => setTimeout(resolve, ENDPOINTS_WAIT_MS))])
  .catch(() => undefined)
  .then(() => createRoot(document.getElementById("root")!).render(<App />));
