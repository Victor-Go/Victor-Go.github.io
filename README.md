# 📝 Markdown to PDF Resume Generator

A premium, high-fidelity, client-side Markdown resume generator. Design and write your resume using simple Markdown and customize its layout, typography, and color schemes in real-time. Export vector-perfect, ATS-friendly A4 PDFs with zero server-side dependencies.

🚀 **Live Site:** [victor-go.github.io](https://victor-go.github.io/)

---

## ✨ Features

- 🖋️ **Interactive Markdown Editor:** Real-time side-by-side editing and rendering using split panel resizers.
- 🎨 **Deep Customization Sidebar:**
  - Font choices (Outfit, Roboto, Lora, Merriweather, Open Sans, JetBrains Mono, Source Code Pro, and system defaults).
  - Component-specific sizing sliders (H1, H2, H3, H4, H5, H6, Body/Paragraph).
  - Tri-state toggle controllers for font weights (Bold) and styles (Italic).
  - Pre-selected color theme swatches (Royal Sapphire, Emerald Forest, Sunset Bronze, Slate Steel, etc.) plus custom hex overrides.
- 🖨️ **100% Vector Native Printing (`window.print()`):**
  - Fully ATS-friendly selectable text rendering.
  - Absolute CJK character rendering accuracy on all system decoders.
- 💾 **Local Storage Backup & Auto-Save:**
  - Configuration settings and resume markups save automatically as you type.
  - Infinite slot backups using `localStorage` API, with name overwrite checking and recovery controls.
  - Custom filename exports for Markdown (`.md`).
- ☁️ **Google Drive Sync:**
  - Optional, user-authorized backups of saved resume slots to Google Drive's private `appDataFolder`.
  - Saving, overwriting, or deleting a resume automatically synchronizes changes, including deletion tombstones, across connected devices.
  - OAuth tokens are cached locally with an expiry timestamp and silently refreshed five minutes before Google expiry when possible.
- 🌐 **12-Language Multilingual UI:** Fully localized in English, Simplified Chinese, Traditional Chinese (`zh-tw`), French, German, Italian, Spanish, Portuguese, Japanese, Korean, Russian, and Ukrainian.
- 🔒 **Privacy First:** No advertising trackers or proprietary backend. Resume data remains in browser storage by default; Google Drive backup is optional, user-authorized, and stored only in the user's private Drive application-data area. We use Google Analytics for aggregate usage measurement; see the privacy policy for details.

---

- **Framework:** React 19 + TypeScript 6
- **State Management:** Zustand (decoupled stores and persistence layers)
- **Build Tool:** Vite 8 (Ultra-fast Hot Module Replacement)
- **Markdown Compiler:** Marked.js (Speed-oriented parser)
- **PDF Engine:** Browser-native print engine (100% vector, ATS-friendly A4 PDFs)
- **Icons:** Lucide React
- **Testing:** Vitest + React Testing Library (30+ automated tests verifying editor find/replace, custom styles, language fallback logic, and happy-path integration)
- **Formatting & Verification:** Husky + Lint-staged + Oxlint (extremely fast static analyzer)

---

## 💻 Local Setup & Development

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (LTS version recommended).

### 2. Installation
Clone the repository and install all required packages:
```bash
git clone https://github.com/Victor-Go/Victor-Go.github.io.git
cd Victor-Go.github.io
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Running Tests
Run tests in watch mode:
```bash
npm run test
```
Or run the full test suite once:
```bash
npm run test:run
```

### 5. Build Production Bundle
```bash
npm run build
```
Vite will compile and compress static assets into the `dist/` directory.

---

## 🖨️ PDF Printing Guide

To export the cleanest A4 PDF from your browser:
1. Click the **Print PDF** action button.
2. In the browser print dialog:
   - **Destination:** Set to **Save as PDF** or **Microsoft Print to PDF**.
   - **Layout:** **Portrait**.
   - **Paper Size:** **A4** (highly recommended).
   - **Margins:** Set to **None** (the page's print media queries automatically inject custom 12mm bounds).
   - **Options:** Enable **Background graphics** to preserve the custom theme colors.
3. Click **Save**.

---

## ☁️ Google Drive Sync

1. Open **Manage Saved Resumes** and select **Connect Google Drive**.
2. Complete the Google authorization flow. Resume backups are stored in Google Drive's private application-data area and are not visible as ordinary Drive files.
3. Save, overwrite, or delete a resume slot to synchronize the change automatically. The app reuses a valid cached token or attempts a silent refresh before Google expiry; you can also select **Sync** to run a manual backup.
4. Select **Disconnect** to remove the local connection and cached authorization token.

The app is local-first: local backups remain available offline and Google Drive sync is optional. If Google cannot renew authorization silently, the app does not open a popup automatically; use **Sync** to authorize again.

---

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
Created with 💜 by [Victor-Go](https://github.com/Victor-Go).
