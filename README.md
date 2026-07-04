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
- 🌐 **12-Language Multilingual UI:** Fully localized in English, Simplified Chinese, Traditional Chinese (`zh-tw`), French, German, Italian, Spanish, Portuguese, Japanese, Korean, Russian, and Ukrainian.
- 🚫 **Privacy First:** Zero trackers, zero analytical cookies, and zero server-side uploads. Your resume remains strictly yours.

---

## 🛠️ Technology Stack

- **Framework:** React 19 + TypeScript 6
- **Build Tool:** Vite 8 (Ultra-fast Hot Module Replacement)
- **Markdown Compiler:** Marked.js (Speed-oriented parser)
- **Icons:** Lucide React
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

### 4. Build Production Bundle
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

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
Created with 💜 by [Victor-Go](https://github.com/Victor-Go).