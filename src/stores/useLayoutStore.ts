import { create } from "zustand";

export interface LayoutState {
  showSidebar: boolean;
  leftWidth: number;
  sidebarWidth: number;

  setShowSidebar: (show: boolean) => void;
  setLeftWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
}

const getInitialShowSidebar = (): boolean => {
  const saved = localStorage.getItem("markdown_resume_show_sidebar");
  return saved === null ? true : saved === "true";
};

const getInitialLeftWidth = (): number => {
  const saved = localStorage.getItem("markdown_resume_left_width");
  return saved ? parseInt(saved, 10) : 820;
};

const getInitialSidebarWidth = (): number => {
  const saved = localStorage.getItem("markdown_resume_sidebar_width");
  return saved ? Math.max(280, parseInt(saved, 10)) : 340;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  showSidebar: getInitialShowSidebar(),
  leftWidth: getInitialLeftWidth(),
  sidebarWidth: getInitialSidebarWidth(),

  setShowSidebar: (showSidebar) => set({ showSidebar }),
  setLeftWidth: (leftWidth) => set({ leftWidth }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
}));
