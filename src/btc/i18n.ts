import { messages as cipherMessages, getDefaultLang, type Lang } from "../cipher/i18n";

export { getDefaultLang, type Lang };

const zh = {
  btcTitle: "比特币钱包生成器",
  btcTagline: "离线生成 24 词助记词和收款地址。页面不联网、不存储,关闭即清空。",
  btcNotice:
    "本页面只生成,不转账、不查余额。大额资产请使用硬件钱包,或把本页面保存后在断网的干净设备上使用。剪贴板历史、浏览器扩展、录屏等不在本页面的控制范围内。",
  tabNew: "生成钱包",
  tabRestore: "恢复 / 校验",
  extraLabel: "额外随机输入(可选)",
  extraHint:
    "浏览器的随机数已经足够安全。这里可随意敲一些字符或掷骰子的结果,它会和系统随机数一起哈希,仅作为额外保险,不会降低安全性。",
  generateWallet: "生成 24 词钱包",
  randomFailed: "系统随机数源异常,已拒绝生成。请换一个浏览器或设备。",
  mnemonic: "助记词(24 词,务必保密)",
  mnemonicInput: "输入你的 24 词助记词",
  mnemonicWarn:
    "请用笔抄写在纸上,离线保管;不要拍照、截图、存入云端或聊天软件。助记词丢失,资金永远无法找回;任何人拿到它,就能转走全部资金。",
  addrWarn:
    "生成后,任何人都可以向下面的地址转账。请先备份助记词,并用“恢复 / 校验”页确认能还原出同一地址,再小额转账测试,最后再放入大额资金。",
  addresses: "收款地址(BIP-84 原生 SegWit,bc1q…)",
  addrPath: "派生路径:m/84'/0'/0'/0/0 起,依次递增。",
  privKeys: "各地址私钥(WIF,仅在需要导入其他钱包时查看)",
  restoreBtn: "校验并显示地址",
  invalidMnemonic: "助记词无效:需要 24 个英文单词且校验和正确。",
  validMnemonic: "助记词有效。请对照下面的地址与你记录的是否一致。",
};

const en: typeof zh = {
  btcTitle: "Bitcoin wallet generator",
  btcTagline: "Generates a 24-word seed and receive addresses offline. No network, no storage; closing the page clears everything.",
  btcNotice:
    "This page only generates keys: it cannot send or check balances. For large amounts use a hardware wallet, or save this page and use it on a clean, offline device. Clipboard history, extensions and screen recorders are outside this page's control.",
  tabNew: "New wallet",
  tabRestore: "Restore / verify",
  extraLabel: "Extra randomness (optional)",
  extraHint:
    "Your browser's random source is already strong. Mash the keyboard or type dice rolls here; it is hashed together with the system randomness as a safety margin and can never weaken it.",
  generateWallet: "Generate 24-word wallet",
  randomFailed: "The system random source looks broken, so generation was refused. Try another browser or device.",
  mnemonic: "Seed phrase (24 words, keep secret)",
  mnemonicInput: "Enter your 24-word seed phrase",
  mnemonicWarn:
    "Write it on paper and store it offline. Never photograph it or keep it in the cloud or chat apps. If you lose it the funds are gone forever; anyone who gets it can take all funds.",
  addrWarn:
    "Once generated, anyone can send coins to the addresses below. Back up the seed first, confirm on the Restore / verify tab that it reproduces the same addresses, test with a small amount, and only then deposit larger sums.",
  addresses: "Receive addresses (BIP-84 native SegWit, bc1q…)",
  addrPath: "Derivation path: m/84'/0'/0'/0/0, then incrementing.",
  privKeys: "Per-address private keys (WIF; only needed to import into another wallet)",
  restoreBtn: "Verify and show addresses",
  invalidMnemonic: "Invalid seed phrase: 24 English words with a correct checksum are required.",
  validMnemonic: "Seed phrase is valid. Compare the addresses below with the ones you recorded.",
};

const own: Record<Lang, typeof zh> = { zh, en };

export const messages = {
  zh: { ...cipherMessages.zh, ...own.zh, title: own.zh.btcTitle, tagline: own.zh.btcTagline, notice: own.zh.btcNotice },
  en: { ...cipherMessages.en, ...own.en, title: own.en.btcTitle, tagline: own.en.btcTagline, notice: own.en.btcNotice },
};
export type Messages = (typeof messages)["zh"];
