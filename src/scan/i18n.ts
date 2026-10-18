import { messages as cipherMessages, type Lang } from "../cipher/i18n";

export type { Lang };

/** This page always starts in Chinese; the language toggle is never persisted. */
export const getDefaultLang = (): Lang => "zh";

const zh = {
  scanTitle: "比特币区块查询",
  scanTagline: "用交易哈希、公钥或地址查询链上数据。本站不记录、不存储,关闭页面即清空。",
  scanNotice:
    "查询必然要问区块链数据源:你输入的交易哈希(或由公钥推导出的地址)会发给第三方接口 mempool.space(失败时改用 blockstream.info),对方能看到查询内容和你的 IP。本站不会收到、记录或保存任何内容。若要隐藏 IP,请使用 Tor Browser 或可信 VPN;若要完全不外泄,只能自己运行全节点。结果由第三方提供,请自行核实。",
  inputLabel: "交易哈希 / 公钥 / 地址",
  inputHint:
    "交易哈希:64 位十六进制。公钥:33 字节压缩(02/03 开头,66 位)或 65 字节未压缩(04 开头,130 位)十六进制。也可直接输入 1…、3…、bc1… 主网地址。",
  detected: "识别为:",
  kindTx: "交易哈希",
  kindAddress: "比特币地址",
  kindPubkey: "公钥(将推导出下列地址并逐个查询)",
  search: "查询",
  searching: "查询中……",
  errEmpty: "请输入交易哈希、公钥或地址。",
  errFormat: "无法识别:请检查是否完整粘贴,且为主网地址。",
  errPubkey: "公钥无效(不在椭圆曲线上)。",
  errNotFound: "没有找到。请检查输入,或该交易尚未广播。",
  errNetwork: "无法连接数据源(mempool.space / blockstream.info)。请检查网络后重试。",
  errBad: "数据源返回了无法解析的内容,已拒绝显示。",
  errRetry: "请求失败,请重试。",
  txTitle: "交易",
  txid: "交易哈希",
  status: "状态",
  statusUnconfirmed: "未确认(在内存池中)",
  statusConfirmed: (n: number) => `已确认,${n} 个确认`,
  block: "区块高度",
  time: "区块时间",
  fee: "手续费",
  feeRate: (r: string) => `${r} sat/vB`,
  size: "大小",
  sizeValue: (size: number, weight: number) => `${size} 字节 / ${weight} 权重`,
  inputs: (n: number) => `输入(${n})`,
  outputs: (n: number) => `输出(${n})`,
  coinbase: "新生成的币(coinbase)",
  noAddress: "无地址(脚本)",
  moreRows: (n: number) => `……另有 ${n} 项未显示`,
  addrTitle: "地址",
  balance: "余额",
  pending: "未确认变动",
  received: "累计收到",
  txCount: "交易数",
  recentTxs: (shown: number, total: number) => (shown < total ? `最近 ${shown} 笔交易(共 ${total} 笔)` : `交易(${total})`),
  noTxs: "该地址还没有任何交易。",
  lookupThis: "查询",
  typeLabel: (t: string) =>
    ({ p2pkh: "P2PKH(1…)", "p2sh-p2wpkh": "P2SH-P2WPKH(3…)", p2wpkh: "P2WPKH(bc1q…)", p2tr: "Taproot(bc1p…)" })[t] ?? t,
  pubkeyNote:
    "公钥推导出的是该公钥可能使用的全部标准地址类型;Taproot 按单密钥路径(无脚本树)推导。未压缩公钥只可能是旧式 P2PKH。",
  unconfirmedMark: "未确认",
};

const en: typeof zh = {
  scanTitle: "Bitcoin scan",
  scanTagline: "Look up on-chain data by transaction hash, public key or address. This site logs and stores nothing; closing the page clears everything.",
  scanNotice:
    "A lookup has to ask a blockchain data source: the transaction hash you enter (or the addresses derived from a public key) is sent to the third-party API mempool.space (blockstream.info if it fails), which can see the query and your IP. This site never receives, logs or stores anything. To hide your IP use Tor Browser or a trusted VPN; to leak nothing at all you must run your own full node. Results come from a third party; verify them yourself.",
  inputLabel: "Transaction hash / public key / address",
  inputHint:
    "Transaction hash: 64 hex characters. Public key: 33-byte compressed (starts 02/03, 66 hex) or 65-byte uncompressed (starts 04, 130 hex). You can also enter a mainnet 1…, 3… or bc1… address.",
  detected: "Detected: ",
  kindTx: "transaction hash",
  kindAddress: "Bitcoin address",
  kindPubkey: "public key (the addresses below are derived and each is looked up)",
  search: "Look up",
  searching: "Looking up…",
  errEmpty: "Enter a transaction hash, public key or address.",
  errFormat: "Not recognised: check that it is pasted in full and is a mainnet address.",
  errPubkey: "Invalid public key (not on the curve).",
  errNotFound: "Not found. Check the input, or the transaction has not been broadcast yet.",
  errNetwork: "Cannot reach the data sources (mempool.space / blockstream.info). Check your network and try again.",
  errBad: "The data source returned something unreadable, so it was rejected.",
  errRetry: "The request failed, please try again.",
  txTitle: "Transaction",
  txid: "Transaction hash",
  status: "Status",
  statusUnconfirmed: "Unconfirmed (in the mempool)",
  statusConfirmed: (n: number) => `Confirmed, ${n} confirmation${n === 1 ? "" : "s"}`,
  block: "Block height",
  time: "Block time",
  fee: "Fee",
  feeRate: (r: string) => `${r} sat/vB`,
  size: "Size",
  sizeValue: (size: number, weight: number) => `${size} bytes / ${weight} weight`,
  inputs: (n: number) => `Inputs (${n})`,
  outputs: (n: number) => `Outputs (${n})`,
  coinbase: "Newly minted coins (coinbase)",
  noAddress: "No address (script)",
  moreRows: (n: number) => `…and ${n} more not shown`,
  addrTitle: "Address",
  balance: "Balance",
  pending: "Unconfirmed change",
  received: "Total received",
  txCount: "Transactions",
  recentTxs: (shown: number, total: number) => (shown < total ? `Latest ${shown} transactions (of ${total})` : `Transactions (${total})`),
  noTxs: "This address has no transactions yet.",
  lookupThis: "Look up",
  typeLabel: zh.typeLabel,
  pubkeyNote:
    "These are all standard address types the public key can use; Taproot is derived as key-path only (no script tree). An uncompressed key can only be legacy P2PKH.",
  unconfirmedMark: "unconfirmed",
};

const own: Record<Lang, typeof zh> = { zh, en };

export const messages = {
  zh: { ...cipherMessages.zh, ...own.zh, title: own.zh.scanTitle, tagline: own.zh.scanTagline, notice: own.zh.scanNotice },
  en: { ...cipherMessages.en, ...own.en, title: own.en.scanTitle, tagline: own.en.scanTagline, notice: own.en.scanNotice },
};
export type Messages = (typeof messages)["zh"];
