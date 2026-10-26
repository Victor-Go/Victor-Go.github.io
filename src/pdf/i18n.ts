import { messages as cipherMessages, type Lang } from "../cipher/i18n";

export type { Lang };

/** This page always starts in Chinese; the language toggle is never persisted. */
export const getDefaultLang = (): Lang => "zh";

const zh = {
  pdfTitle: "PDF 工具",
  pdfTagline: "在本地处理 PDF 文件。页面不联网、不上传、不存储,关闭即清空。",
  pdfNotice: "文件只在你的浏览器内存中处理,不会发送到任何服务器。生成的图片或压缩包保存后会留在你的磁盘上。",
  toolsLabel: "工具",
  toolImages: "PDF 转图片",
  imagesIntro: "把 PDF 的每一页渲染成图片。只有一张时直接下载图片,多张时打包成 zip。",
  pickPdf: "选择 PDF",
  noPdf: "未选择 PDF",
  pdfInfo: (name: string, size: string, pages: number) => `${name}(${size},共 ${pages} 页)`,
  fileTooBig: (mb: number) => `文件超过 ${mb} MB,已拒绝读取。`,
  notPdf: "这不是有效的 PDF 文件,或文件已损坏。",
  needPassword: "该 PDF 已加密,请输入打开密码。",
  wrongPassword: "密码不正确,请重试。",
  passwordLabel: "PDF 打开密码",
  unlock: "解锁",
  formatLabel: "图片格式",
  scaleLabel: "清晰度",
  scale1: "标准(1×,约 72 DPI)",
  scale2: "高清(2×,约 144 DPI)",
  scale3: "超清(3×,约 216 DPI)",
  qualityLabel: (q: number) => `JPG 质量:${q}%`,
  pagesLabel: "页码范围",
  pagesHint: "留空表示全部。示例:1-3, 5, 8-",
  pagesInvalid: (total: number) => `页码范围无效,应在 1 到 ${total} 之间。`,
  convert: "转换",
  converting: (done: number, total: number) => `正在转换… ${done} / ${total}`,
  scaleReduced: "部分页面尺寸过大,已自动降低清晰度以免浏览器画布溢出。",
  convertFailed: "转换失败,可能是页面过大或内存不足。请降低清晰度或缩小页码范围。",
  done: (n: number, size: string) => `已生成 ${n} 张图片(${size})。`,
  downloadImage: "下载图片",
  downloadZip: "下载 zip 压缩包",
};

const en: typeof zh = {
  pdfTitle: "PDF tools",
  pdfTagline: "Works on PDF files locally. No network, no upload, no storage; closing the page clears everything.",
  pdfNotice: "Files are processed in your browser's memory and never sent to a server. Images or archives you save stay on your disk.",
  toolsLabel: "Tools",
  toolImages: "PDF to images",
  imagesIntro: "Renders every page of a PDF as an image. A single image downloads directly; several are bundled into a zip.",
  pickPdf: "Choose a PDF",
  noPdf: "No PDF chosen",
  pdfInfo: (name: string, size: string, pages: number) => `${name} (${size}, ${pages} pages)`,
  fileTooBig: (mb: number) => `The file is larger than ${mb} MB, so it was not read.`,
  notPdf: "This is not a valid PDF, or it is corrupted.",
  needPassword: "This PDF is encrypted. Enter its open password.",
  wrongPassword: "Wrong password, try again.",
  passwordLabel: "PDF open password",
  unlock: "Unlock",
  formatLabel: "Image format",
  scaleLabel: "Resolution",
  scale1: "Standard (1×, ~72 DPI)",
  scale2: "High (2×, ~144 DPI)",
  scale3: "Very high (3×, ~216 DPI)",
  qualityLabel: (q: number) => `JPG quality: ${q}%`,
  pagesLabel: "Page range",
  pagesHint: "Leave empty for all pages. Example: 1-3, 5, 8-",
  pagesInvalid: (total: number) => `Invalid page range; use pages 1 to ${total}.`,
  convert: "Convert",
  converting: (done: number, total: number) => `Converting… ${done} / ${total}`,
  scaleReduced: "Some pages were too large, so their resolution was lowered to fit the browser's canvas limit.",
  convertFailed: "Conversion failed, probably because a page is too large or memory ran out. Lower the resolution or the page range.",
  done: (n: number, size: string) => `Generated ${n} image${n === 1 ? "" : "s"} (${size}).`,
  downloadImage: "Download image",
  downloadZip: "Download zip",
};

const own: Record<Lang, typeof zh> = { zh, en };

export const messages = {
  zh: { ...cipherMessages.zh, ...own.zh, title: own.zh.pdfTitle, tagline: own.zh.pdfTagline, notice: own.zh.pdfNotice },
  en: { ...cipherMessages.en, ...own.en, title: own.en.pdfTitle, tagline: own.en.pdfTagline, notice: own.en.pdfNotice },
};
export type Messages = (typeof messages)["zh"];
