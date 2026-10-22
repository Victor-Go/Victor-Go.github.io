import { messages as cipherMessages, type Lang } from "../cipher/i18n";

export type { Lang };

/** This page always starts in Chinese; the language toggle is never persisted. */
export const getDefaultLang = (): Lang => "zh";

const zh = {
  hashTitle: "哈希计算",
  hashTagline: "在本地计算文本或文件的哈希值,支持常见算法。页面不联网、不存储,关闭即清空。",
  hashNotice: "哈希不是加密,无法还原原文。MD5、SHA-1 已不安全,只适合校验完整性或对照旧系统;存密码请用专门的口令哈希,不要直接用这里的算法。",
  algoLabel: "哈希算法",
  weakWarn: (name: string) => `${name} 的碰撞可被轻易构造,不要用于签名或安全场景。`,
  tabText: "文本",
  tabFile: "文件",
  textLabel: "要计算的文本(按 UTF-8 编码)",
  fileLabel: "选择文件",
  noFile: "未选择文件",
  fileTooBig: (mb: number) => `文件超过 ${mb} MB,已拒绝读取。`,
  fileFailed: "文件读取失败。",
  hashLower: "哈希值(小写)",
  hashUpper: "哈希值(大写)",
  fileInfo: (name: string, size: number) => `${name}(${size} 字节)`,
};

const en: typeof zh = {
  hashTitle: "Hash calculator",
  hashTagline: "Computes common hashes of text or a file locally. No network, no storage; closing the page clears everything.",
  hashNotice:
    "A hash is not encryption and cannot be reversed. MD5 and SHA-1 are broken: use them only for integrity checks or legacy comparison. For storing passwords use a dedicated password hash, not these algorithms directly.",
  algoLabel: "Hash algorithm",
  weakWarn: (name: string) => `Collisions in ${name} are easy to forge; do not use it for signatures or security.`,
  tabText: "Text",
  tabFile: "File",
  textLabel: "Text to hash (UTF-8)",
  fileLabel: "Choose a file",
  noFile: "No file chosen",
  fileTooBig: (mb: number) => `The file is larger than ${mb} MB, so it was not read.`,
  fileFailed: "Could not read the file.",
  hashLower: "Hash (lowercase)",
  hashUpper: "Hash (uppercase)",
  fileInfo: (name: string, size: number) => `${name} (${size} bytes)`,
};

const own: Record<Lang, typeof zh> = { zh, en };

export const messages = {
  zh: { ...cipherMessages.zh, ...own.zh, title: own.zh.hashTitle, tagline: own.zh.hashTagline, notice: own.zh.hashNotice },
  en: { ...cipherMessages.en, ...own.en, title: own.en.hashTitle, tagline: own.en.hashTagline, notice: own.en.hashNotice },
};
export type Messages = (typeof messages)["zh"];
