# Architecture Design and Data Flow

This document details the new architectural design, state management layer, custom hooks, and layout flows introduced in the refactoring of the Markdown Resume Generator.

## 🏛️ State Management Architecture

To resolve the complexity of the previous `App.tsx` (which housed multiple independent React state hooks and side-effects), we migrated state to **Zustand** stores located under `src/stores/`. This decouples the core domain state from the visual layout rendering.

```mermaid
graph TD
  App[App.tsx]
  style App fill:#f9f,stroke:#333,stroke-width:2px

  subgraph Zustand Stores
    RS[useResumeStore]
    LS[useLayoutStore]
    US[useUIStore]
  end

  subgraph Custom Side-Effect Hooks
    UL[useLanguage]
    UP[useResumePersistence]
    UPr[usePrint]
  end

  App --> UL
  App --> UP
  App --> UPr
  App --> RS
  App --> LS
  App --> US

  UL -.-> |syncs| RS
  UP -.-> |saves to| localStorage
  UPr -.-> |calls| generateResumePDF
```

### 1. `useResumeStore`
Housed in `src/stores/useResumeStore.ts`, it is the master store containing active CV configurations:
- **Markdown Content**: The active resume draft string.
- **Visual Styles**: Typography, spacing, weights, margins, and custom element styles (`AppStyles`).
- **Layout Templates**: Active CSS layouts (`classic`, `creative`, `minimalist`, etc.).
- **Avoid Page Breaks**: Avoid page split checks and targeting heading levels.
- **Active Language**: Active system and editor language selection (`SupportedLang`).

### 2. `useLayoutStore`
Housed in `src/stores/useLayoutStore.ts`, it manages interface pane sizes and visibility constraints:
- **Sidebar visibility**: Toggles Style configuration panel.
- **Split widths**: Manages left and right pane sizes in pixels dynamically updated by mouse drag resize event listeners.

### 3. `useUIStore`
Housed in `src/stores/useUIStore.ts`, it governs temporal modal status, action loaders, feedback loops:
- **Toasts**: success, error, info notifications.
- **Modals**: Saved CV cookie slots control modal.
- **Tabs**: Active viewport mode (`styles`, `editor`, `preview`) under smaller responsive devices.

---

## 🔗 Custom Side-Effect Hooks

To keep `App.tsx` clean and dedicated solely to rendering layout components, state mutations and background operations are delegated to custom React hooks located under `src/hooks/`:

### 1. `useLanguage`
- Automatically detects user browser local languages and fallback preferences.
- Silent query string URL parameter syncing (`?lang=ja`).
- Modifies dynamic SEO headers (html `lang` attribute, meta descriptions, page title suffixes).
- Resolves default CV boilerplate markups during language switching.

### 2. `useResumePersistence`
- Automatically intercepts store actions and triggers local storage sync operations.
- Preserves the **exact same key schema** (`markdown_resume_content`, `markdown_resume_template`, etc.) to maintain complete backward compatibility for returning users.

### 3. `usePrint`
- Manages exports to Markdown files (`.md`).
- Triggers browser-native print layouts (`window.print()`) that preserve vector structures and full ATS compliance.

---

## 📱 Responsive Layout Stacking Flow

When viewport width falls below `1125px`, the layout transitions from a multi-pane side-by-side view to a **mobile-tabbed single-pane view**:
1. Side-by-side pane split width controls and resizing handles are disabled.
2. A sticky mobile navigation tab-bar appears below the header (Tabs: **Styles**, **Editor**, **Preview**).
3. The header action buttons collapse and hide text contents, transforming gracefully into compact icon-only actions on screen sizes under `768px`.
