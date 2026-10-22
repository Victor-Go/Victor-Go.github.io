import { messages as cipherMessages, type Lang } from "../cipher/i18n";

export type { Lang };

/** This page always starts in Chinese; the language toggle is never persisted. */
export const getDefaultLang = (): Lang => "zh";

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
  addresses: "地址与私钥(BIP-84 原生 SegWit,bc1q…)",
  addrPath: "以下 5 组由同一个助记词依次派生。每组有各自的收款地址和独立私钥,互不相通。",
  cardTitle: (i: number) => `钱包 #${i + 1}`,
  receiveAddress: "收款地址(可公开)",
  keyLabel: "此地址的私钥 WIF(保密,只能花这一个地址)",
  restoreBtn: "校验并显示地址",
  invalidMnemonic: "助记词无效:需要 24 个英文单词且校验和正确。",
  validMnemonic: "助记词有效。请对照下面的地址与你记录的是否一致。",
  passphraseLabel: "密码短语(可选,即“第 25 个词”)",
  passphraseHint:
    "可输入任意字符:中文、符号、空格、emoji 都行,大小写和空格都算数(不能换行)。它和助记词一起决定地址:只拿到助记词、不知道密码短语的人,只会得到另一个空钱包。密码短语不会被保存,忘了就无法找回资金,请和助记词分开保管。不需要就留空。",
  passphraseConfirmLabel: "再输入一次密码短语",
  passphraseMismatch: "两次输入的密码短语不一致,已拒绝生成。",
  passphraseUsed: "这个钱包使用了密码短语:恢复时必须同时输入助记词和这个密码短语,缺一不可。请把密码短语和助记词分开记录。",
  restorePassphraseHint: "如果创建时设置了密码短语,请在这里填入。填错不会报错,只会得到另一组全新的、没有资金的地址。",
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
  addresses: "Addresses and private keys (BIP-84 native SegWit, bc1q…)",
  addrPath: "The 5 sets below come from the same seed phrase. Each set has its own receive address and its own private key, independent of the others.",
  cardTitle: (i: number) => `Wallet #${i + 1}`,
  receiveAddress: "Receive address (public)",
  keyLabel: "Private key of this address, WIF (secret; spends only this address)",
  restoreBtn: "Verify and show addresses",
  invalidMnemonic: "Invalid seed phrase: 24 English words with a correct checksum are required.",
  validMnemonic: "Seed phrase is valid. Compare the addresses below with the ones you recorded.",
  passphraseLabel: "Passphrase (optional, the \"25th word\")",
  passphraseHint:
    "Any characters work: letters, symbols, spaces, emoji; case and spaces both count (no line breaks). Together with the seed phrase it decides the addresses: someone who has the seed phrase but not the passphrase only gets a different, empty wallet. The passphrase is never stored; if you forget it the funds cannot be recovered, so keep it apart from the seed phrase. Leave empty if you do not want one.",
  passphraseConfirmLabel: "Enter the passphrase again",
  passphraseMismatch: "The two passphrases do not match, so nothing was generated.",
  passphraseUsed:
    "This wallet uses a passphrase: restoring it needs both the seed phrase and this passphrase, neither alone. Record the passphrase separately from the seed phrase.",
  restorePassphraseHint:
    "If a passphrase was set when the wallet was created, enter it here. A wrong one gives no error, only a different set of new, empty addresses.",
};

const own: Record<Lang, typeof zh> = { zh, en };

export const messages = {
  zh: { ...cipherMessages.zh, ...own.zh, title: own.zh.btcTitle, tagline: own.zh.btcTagline, notice: own.zh.btcNotice },
  en: { ...cipherMessages.en, ...own.en, title: own.en.btcTitle, tagline: own.en.btcTagline, notice: own.en.btcNotice },
};
export type Messages = (typeof messages)["zh"];
