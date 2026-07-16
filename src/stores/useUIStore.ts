import { create } from "zustand";

export interface ToastInfo {
  message: string;
  type: "success" | "error" | "info";
}

export interface UIState {
  toast: ToastInfo | null;
  isModalOpen: boolean;
  pdfGenerating: boolean;
  activeTab: "styles" | "editor" | "preview";

  showToast: (message: string, type?: "success" | "error" | "info") => void;
  clearToast: () => void;
  setIsModalOpen: (open: boolean) => void;
  setPdfGenerating: (generating: boolean) => void;
  setActiveTab: (tab: "styles" | "editor" | "preview") => void;
}

export const useUIStore = create<UIState>((set) => ({
  toast: null,
  isModalOpen: false,
  pdfGenerating: false,
  activeTab: "editor",

  showToast: (message, type = "success") => set({ toast: { message, type } }),
  clearToast: () => set({ toast: null }),
  setIsModalOpen: (isModalOpen) => set({ isModalOpen }),
  setPdfGenerating: (pdfGenerating) => set({ pdfGenerating }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
