import { useEffect } from "react";
import { useResumeStore } from "../stores/useResumeStore";
import { useLayoutStore } from "../stores/useLayoutStore";
import { saveStylesToStorage } from "../utils/storage";

export function useResumePersistence() {
  const template = useResumeStore((state) => state.template);
  const styles = useResumeStore((state) => state.styles);
  const markdown = useResumeStore((state) => state.markdown);
  const fileName = useResumeStore((state) => state.fileName);
  const avoidPageBreak = useResumeStore((state) => state.avoidPageBreak);
  const avoidPageBreakLevels = useResumeStore((state) => state.avoidPageBreakLevels);

  const showSidebar = useLayoutStore((state) => state.showSidebar);
  const leftWidth = useLayoutStore((state) => state.leftWidth);
  const sidebarWidth = useLayoutStore((state) => state.sidebarWidth);

  // Auto-save template selection
  useEffect(() => {
    localStorage.setItem("markdown_resume_template", template);
  }, [template]);

  // Auto-save styles configuration
  useEffect(() => {
    saveStylesToStorage(styles);
  }, [styles]);

  // Auto-save markdown content (if not empty)
  useEffect(() => {
    if (markdown) {
      localStorage.setItem("markdown_resume_content", markdown);
    }
  }, [markdown]);

  // Auto-save download file name
  useEffect(() => {
    localStorage.setItem("markdown_resume_file_name", fileName);
  }, [fileName]);

  // Auto-save avoid page break settings
  useEffect(() => {
    try {
      localStorage.setItem("markdown_resume_avoid_page_break", String(avoidPageBreak));
    } catch (e) {
      console.error("Failed to save avoidPageBreak to localStorage", e);
    }
  }, [avoidPageBreak]);

  useEffect(() => {
    try {
      localStorage.setItem("markdown_resume_avoid_page_break_levels", JSON.stringify(avoidPageBreakLevels));
    } catch (e) {
      console.error("Failed to save avoidPageBreakLevels to localStorage", e);
    }
  }, [avoidPageBreakLevels]);

  // Auto-save layout settings
  useEffect(() => {
    localStorage.setItem("markdown_resume_show_sidebar", String(showSidebar));
  }, [showSidebar]);

  useEffect(() => {
    localStorage.setItem("markdown_resume_left_width", String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem("markdown_resume_sidebar_width", String(sidebarWidth));
  }, [sidebarWidth]);
}
