import { createRoot } from "react-dom/client";
import "../cipher/cipher.css";
import "./hash.css";
import { App } from "./App";

// iOS Safari ignores user-scalable=no; cancelling its gesture events blocks pinch zoom.
document.addEventListener("gesturestart", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(<App />);
