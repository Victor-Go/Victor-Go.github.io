import { useResumeStore } from "../stores/useResumeStore";
import { useUIStore } from "../stores/useUIStore";
import { extraTranslations } from "../utils/translations";
import { generateResumePDF } from "../utils/pdf";

export function usePrint() {
  const markdown = useResumeStore((state) => state.markdown);
  const fileName = useResumeStore((state) => state.fileName);
  const avoidPageBreakLevels = useResumeStore((state) => state.avoidPageBreakLevels);
  const lang = useResumeStore((state) => state.lang);

  const pdfGenerating = useUIStore((state) => state.pdfGenerating);
  const setPdfGenerating = useUIStore((state) => state.setPdfGenerating);
  const showToast = useUIStore((state) => state.showToast);

  const handleExportMarkdown = () => {
    const extra = extraTranslations[lang] || extraTranslations["en"];
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(extra.mdSuccess, "success");
    } catch (err) {
      console.error(err);
      showToast(extra.mdError, "error");
    }
  };

  const handleDownloadPdf = async () => {
    const extra = extraTranslations[lang] || extraTranslations["en"];
    setPdfGenerating(true);
    showToast(extra.pdfGeneratingToast, "info");

    try {
      const filename = `${fileName}.pdf`;
      await generateResumePDF("preview-container", filename, avoidPageBreakLevels);
      showToast(extra.pdfSuccess, "success");
    } catch (err: any) {
      console.error(err);
      showToast(extra.pdfError, "error");
    } finally {
      setPdfGenerating(false);
    }
  };

  return {
    pdfGenerating,
    handleExportMarkdown,
    handleDownloadPdf,
  };
}
