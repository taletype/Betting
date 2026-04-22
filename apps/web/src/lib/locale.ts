export const supportedLocales = ["en", "zh-CN"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en";
export const chineseLocale: AppLocale = "zh-CN";
export const localeHeaderName = "x-bet-locale";
export const localeTimeZone = "Asia/Hong_Kong";

export const isSupportedLocale = (value: string | null | undefined): value is AppLocale =>
  typeof value === "string" && supportedLocales.includes(value as AppLocale);

export const resolveLocale = (value: string | null | undefined): AppLocale =>
  isSupportedLocale(value) ? value : defaultLocale;

export const getLocaleHref = (locale: AppLocale, pathname: string): string => {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (locale === defaultLocale) {
    return normalizedPath;
  }

  if (normalizedPath === "/") {
    return `/${locale}`;
  }

  return `/${locale}${normalizedPath}`;
};

export const formatDateTime = (locale: AppLocale, value: string, timeZone = localeTimeZone): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));

export interface LocaleCopy {
  shell: {
    brand: string;
    nav: {
      markets: string;
      portfolio: string;
      referrals: string;
      claims: string;
      research: string;
      admin: string;
    };
  };
  markets: {
    title: string;
    subtitle: string;
    totalMarkets: string;
    totalMarketsHint: string;
    activeNow: string;
    activeNowHint: string;
    resolved: string;
    resolvedHint: string;
    noMarketsTitle: string;
    noMarketsBody: string;
    outcomes: string;
    none: string;
    status: string;
    bestBid: string;
    bestAsk: string;
    lastTrade: string;
    volume: string;
    statuses: Record<string, string>;
  };
  portfolio: {
    title: string;
    subtitle: string;
    unavailable: string;
    availableBalance: string;
    availableBalanceHint: string;
    reservedBalance: string;
    reservedBalanceHint: string;
    linkedWalletRecord: string;
    walletAddress: string;
    verifiedAt: string;
    positions: string;
    noPositions: string;
    openOrders: string;
    noOpenOrders: string;
    claims: string;
    noClaims: string;
    claimAction: string;
    unavailableAction: string;
    creditDeposit: string;
    creditDepositHint: string;
    treasuryLabel: string;
    usdcTokenLabel: string;
    depositVerificationHint: string;
    txHashPlaceholder: string;
    creditDepositButton: string;
    requestWithdrawal: string;
    requestWithdrawalHint: string;
    amountPlaceholder: string;
    destinationPlaceholder: string;
    requestWithdrawalButton: string;
    depositHistory: string;
    noDeposits: string;
    withdrawalHistory: string;
    noWithdrawals: string;
    market: string;
    outcome: string;
    shares: string;
    avgPrice: string;
    realizedPnl: string;
    side: string;
    price: string;
    remaining: string;
    status: string;
    claimable: string;
    claimed: string;
    action: string;
    txHash: string;
    amount: string;
    verifiedAtColumn: string;
    destination: string;
    timeline: string;
    requestedAt: string;
    processedAt: string;
    transaction: string;
    orderStatuses: Record<string, string>;
    claimStatuses: Record<string, string>;
    withdrawalStatuses: Record<string, string>;
    depositStatuses: Record<string, string>;
    sides: Record<string, string>;
  };
  wallet: {
    title: string;
    subtitle: string;
    connectedWallet: string;
    notConnected: string;
    walletNetwork: string;
    unknown: string;
    wrongNetwork: string;
    linkedWallet: string;
    notLinked: string;
    disconnectedBadge: string;
    connectedBadge: string;
    wrongNetworkBadge: string;
    connectWallet: string;
    reconnectWallet: string;
    connecting: string;
    switchToNetwork: string;
    linkWallet: string;
    relinkWallet: string;
    noWalletDetected: string;
    walletConnectionCancelled: string;
    failedToConnectWallet: string;
    failedToSwitchNetwork: string;
    switchBeforeLink: string;
    invalidSignature: string;
    signatureMismatch: string;
    failedToLinkWallet: string;
    walletLinkedNotice: string;
  };
  claims: {
    title: string;
    subtitle: string;
    unavailable: string;
    claimableNow: string;
    claimableNowHint: string;
    claimedLifetime: string;
    claimedLifetimeHint: string;
    historyTitle: string;
    noClaims: string;
    market: string;
    status: string;
    claimable: string;
    claimed: string;
    updated: string;
    statuses: Record<string, string>;
  };
  referrals: {
    title: string;
    subtitle: string;
    inviteCode: string;
    lifetimeCommission: string;
    last30Days: string;
    downline: string;
    directReferrals: string;
    sponsor: string;
    joined: string;
    noCode: string;
    noSponsor: string;
    joinWithCode: string;
    referralCode: string;
    referralCodePlaceholder: string;
    attachSponsor: string;
    directReferralsTitle: string;
    noDirectReferrals: string;
    commissionHistory: string;
    noCommissions: string;
    member: string;
    source: string;
    level: string;
    amount: string;
    status: string;
    created: string;
    levelPrefix: string;
  };
  research: {
    title: string;
    subtitle: string;
    empty: string;
    externalId: string;
    bestBid: string;
    bestAsk: string;
    lastTrade: string;
    outcomes: string;
    outcomesUnavailable: string;
    volume24h: string;
    totalVolume: string;
    lastSynced: string;
    never: string;
    tradeTime: string;
    side: string;
    price: string;
    size: string;
    noRecentTrades: string;
    statuses: Record<string, string>;
    sides: Record<string, string>;
  };
}

const en: LocaleCopy = {
  shell: {
    brand: "Bet",
    nav: {
      markets: "Markets",
      portfolio: "Portfolio",
      referrals: "Referrals",
      claims: "Claims",
      research: "Research",
      admin: "Admin",
    },
  },
  markets: {
    title: "Markets",
    subtitle: "Live and settled prediction markets with depth, recent activity, and resolution state in one view.",
    totalMarkets: "Total markets",
    totalMarketsHint: "Includes active and resolved listings.",
    activeNow: "Active now",
    activeNowHint: "Open for order placement and matching.",
    resolved: "Resolved",
    resolvedHint: "Settled markets with payout history.",
    noMarketsTitle: "No markets yet",
    noMarketsBody: "No markets are published yet. Run seed/reset and the staging drill harness, then refresh this page.",
    outcomes: "Outcomes",
    none: "None",
    status: "Status",
    bestBid: "Best bid",
    bestAsk: "Best ask",
    lastTrade: "Last trade",
    volume: "Volume",
    statuses: {
      open: "Active",
      resolved: "Resolved",
      halted: "Halted",
      cancelled: "Cancelled",
    },
  },
  portfolio: {
    title: "Portfolio",
    subtitle: "Review balances and transfer history, then verify deposits or request withdrawals.",
    unavailable: "Sign in to load portfolio balances, orders, claims, deposits, and withdrawals.",
    availableBalance: "Available Balance",
    availableBalanceHint: "available to trade.",
    reservedBalance: "Reserved Balance",
    reservedBalanceHint: "Locked for open orders and pending fills.",
    linkedWalletRecord: "Linked Wallet Record",
    walletAddress: "Wallet address",
    verifiedAt: "Verified",
    positions: "Positions",
    noPositions: "No open positions.",
    openOrders: "Open Orders",
    noOpenOrders: "No open orders.",
    claims: "Claims",
    noClaims: "No winnings to claim.",
    claimAction: "Claim",
    unavailableAction: "—",
    creditDeposit: "Credit Deposit",
    creditDepositHint: "Settlement asset: {asset}. Network: {network}. Deposits are credited by verifying an onchain USDC transfer to treasury.",
    treasuryLabel: "Treasury",
    usdcTokenLabel: "USDC token",
    depositVerificationHint: "Current implementation verifies an existing transaction hash. Sending funds from wallet is still done in your wallet app.",
    txHashPlaceholder: "0x transaction hash",
    creditDepositButton: "Credit Deposit",
    requestWithdrawal: "Request Withdrawal",
    requestWithdrawalHint: "Enter amount and destination wallet to create a {network} testnet withdrawal request.",
    amountPlaceholder: "Amount (atoms)",
    destinationPlaceholder: "0x destination wallet",
    requestWithdrawalButton: "Request Withdrawal",
    depositHistory: "Deposit History",
    noDeposits: "No deposits credited yet.",
    withdrawalHistory: "Withdrawal History",
    noWithdrawals: "No withdrawals requested yet.",
    market: "Market",
    outcome: "Outcome",
    shares: "Shares",
    avgPrice: "Avg Price",
    realizedPnl: "Realized PnL",
    side: "Side",
    price: "Price",
    remaining: "Remaining",
    status: "Status",
    claimable: "Claimable",
    claimed: "Claimed",
    action: "Action",
    txHash: "Tx hash",
    amount: "Amount",
    verifiedAtColumn: "Verified at",
    destination: "Destination",
    timeline: "Timeline",
    requestedAt: "Requested",
    processedAt: "Processed",
    transaction: "Tx",
    orderStatuses: {
      open: "Open",
      partially_filled: "Partially filled",
      filled: "Filled",
      cancelled: "Cancelled",
    },
    claimStatuses: {
      claimable: "Claimable",
      claimed: "Claimed",
    },
    withdrawalStatuses: {
      requested: "Requested",
      completed: "Completed",
      failed: "Failed",
    },
    depositStatuses: {
      confirmed: "confirmed",
      completed: "completed",
      failed: "failed",
      pending: "pending",
      submitted: "submitted",
    },
    sides: {
      buy: "Buy",
      sell: "Sell",
    },
  },
  wallet: {
    title: "Base Wallet Connect",
    subtitle: "v1 uses Base only. Connect your wallet on {network} to enable deposit verification and withdrawals.",
    connectedWallet: "Connected wallet",
    notConnected: "Not connected",
    walletNetwork: "Wallet network",
    unknown: "Unknown",
    wrongNetwork: "Wrong network",
    linkedWallet: "Linked wallet",
    notLinked: "Not linked",
    disconnectedBadge: "Wallet disconnected.",
    connectedBadge: "Wallet connected on {network}.",
    wrongNetworkBadge: "Wrong network. Switch to {network}.",
    connectWallet: "Connect Wallet",
    reconnectWallet: "Reconnect Wallet",
    connecting: "Connecting…",
    switchToNetwork: "Switch to {network}",
    linkWallet: "Link Wallet",
    relinkWallet: "Relink Wallet",
    noWalletDetected: "No wallet detected. Install Coinbase Wallet or MetaMask for Base Sepolia testing.",
    walletConnectionCancelled: "Wallet connection was cancelled.",
    failedToConnectWallet: "Failed to connect wallet.",
    failedToSwitchNetwork: "Failed to switch network.",
    switchBeforeLink: "Switch wallet network to {network} before linking.",
    invalidSignature: "Wallet did not return a valid signature.",
    signatureMismatch: "Wallet signature does not match connected account.",
    failedToLinkWallet: "Failed to link wallet.",
    walletLinkedNotice: "Wallet linked. Base deposit verification is now enabled for this account.",
  },
  claims: {
    title: "Claims & Payouts",
    subtitle: "Track claimable and claimed payout states for resolved markets in your portfolio.",
    unavailable: "Sign in to load claim and payout history.",
    claimableNow: "Claimable now",
    claimableNowHint: "Claims still waiting for action.",
    claimedLifetime: "Claimed lifetime",
    claimedLifetimeHint: "Total settled payout amount.",
    historyTitle: "Claim History",
    noClaims: "No claims yet. Resolve a market where you hold winning shares to generate claim records.",
    market: "Market",
    status: "Status",
    claimable: "Claimable",
    claimed: "Claimed",
    updated: "Updated",
    statuses: {
      claimable: "Claimable",
      claimed: "Claimed",
    },
  },
  referrals: {
    title: "Referrals",
    subtitle: "Grow your network, track downline activity, and review deposit-based MLM commissions.",
    inviteCode: "Your Invite Code",
    lifetimeCommission: "Lifetime Commission",
    last30Days: "Last 30 days",
    downline: "Downline",
    directReferrals: "Direct referrals",
    sponsor: "Sponsor",
    joined: "Joined",
    noCode: "No code",
    noSponsor: "No sponsor attached yet. Join an upline with a referral code.",
    joinWithCode: "Join With Code",
    referralCode: "Referral code",
    referralCodePlaceholder: "DEMO1001",
    attachSponsor: "Attach Sponsor",
    directReferralsTitle: "Direct Referrals",
    noDirectReferrals: "No direct referrals yet.",
    commissionHistory: "Commission History",
    noCommissions: "No commissions credited yet.",
    member: "Member",
    source: "Source",
    level: "Level",
    amount: "Amount",
    status: "Status",
    created: "Created",
    levelPrefix: "Level",
  },
  research: {
    title: "Market Research",
    subtitle: "Reference pricing from Polymarket and Kalshi for market context. Trading remains on each native venue.",
    empty: "No synced market data yet. Run pnpm sync:external, then refresh this page.",
    externalId: "External ID",
    bestBid: "Best bid",
    bestAsk: "Best ask",
    lastTrade: "Last trade",
    outcomes: "Outcomes",
    outcomesUnavailable: "Outcomes not available in latest sync payload.",
    volume24h: "24h volume",
    totalVolume: "Total volume",
    lastSynced: "Last synced",
    never: "never",
    tradeTime: "Trade time",
    side: "Side",
    price: "Price",
    size: "Size",
    noRecentTrades: "No recent external trades captured for this market yet.",
    statuses: {
      open: "Active",
      resolved: "Resolved",
      closed: "Closed",
      cancelled: "Cancelled",
    },
    sides: {
      buy: "Buy",
      sell: "Sell",
    },
  },
};

const zhCN: LocaleCopy = {
  shell: {
    brand: "Bet",
    nav: {
      markets: "市场",
      portfolio: "资产",
      referrals: "推荐",
      claims: "索赔",
      research: "研究",
      admin: "管理",
    },
  },
  markets: {
    title: "市场",
    subtitle: "在一个页面查看实时和已结算的预测市场，包括深度、最新活动和结算状态。",
    totalMarkets: "市场总数",
    totalMarketsHint: "包含进行中和已结算的市场。",
    activeNow: "当前活跃",
    activeNowHint: "可下单和撮合的市场。",
    resolved: "已结算",
    resolvedHint: "已完成结算并带有赔付历史的市场。",
    noMarketsTitle: "暂无市场",
    noMarketsBody: "目前还没有已发布的市场。运行 seed/reset 和 staging drill harness 后刷新此页面。",
    outcomes: "结果选项",
    none: "无",
    status: "状态",
    bestBid: "最佳买价",
    bestAsk: "最佳卖价",
    lastTrade: "最新成交",
    volume: "成交量",
    statuses: {
      open: "活跃",
      resolved: "已结算",
      halted: "已暂停",
      cancelled: "已取消",
    },
  },
  portfolio: {
    title: "资产",
    subtitle: "查看余额和转账历史，然后验证充值或提交提现请求。",
    unavailable: "请先登录以加载资产余额、订单、索赔、充值和提现记录。",
    availableBalance: "可用余额",
    availableBalanceHint: "可用于交易。",
    reservedBalance: "冻结余额",
    reservedBalanceHint: "已锁定用于未完成订单和待成交部分。",
    linkedWalletRecord: "已绑定钱包记录",
    walletAddress: "钱包地址",
    verifiedAt: "验证时间",
    positions: "持仓",
    noPositions: "暂无持仓。",
    openOrders: "挂单",
    noOpenOrders: "暂无挂单。",
    claims: "索赔",
    noClaims: "暂无可领取收益。",
    claimAction: "领取",
    unavailableAction: "—",
    creditDeposit: "入账充值",
    creditDepositHint: "结算资产：{asset}。网络：{network}。系统会通过验证链上转入国库的钱包 USDC 交易为充值入账。",
    treasuryLabel: "国库地址",
    usdcTokenLabel: "USDC 代币",
    depositVerificationHint: "当前实现会验证已有交易哈希。实际转账仍需在你的钱包应用中完成。",
    txHashPlaceholder: "0x 交易哈希",
    creditDepositButton: "入账充值",
    requestWithdrawal: "申请提现",
    requestWithdrawalHint: "输入金额和目标钱包地址以创建一个 {network} 测试网提现请求。",
    amountPlaceholder: "金额（atoms）",
    destinationPlaceholder: "0x 目标钱包",
    requestWithdrawalButton: "申请提现",
    depositHistory: "充值历史",
    noDeposits: "暂无已入账充值。",
    withdrawalHistory: "提现历史",
    noWithdrawals: "暂无提现请求。",
    market: "市场",
    outcome: "结果",
    shares: "份额",
    avgPrice: "平均价格",
    realizedPnl: "已实现盈亏",
    side: "方向",
    price: "价格",
    remaining: "剩余",
    status: "状态",
    claimable: "可领取",
    claimed: "已领取",
    action: "操作",
    txHash: "交易哈希",
    amount: "金额",
    verifiedAtColumn: "验证时间",
    destination: "目标地址",
    timeline: "时间线",
    requestedAt: "申请",
    processedAt: "处理",
    transaction: "交易",
    orderStatuses: {
      open: "进行中",
      partially_filled: "部分成交",
      filled: "已成交",
      cancelled: "已取消",
    },
    claimStatuses: {
      claimable: "可领取",
      claimed: "已领取",
    },
    withdrawalStatuses: {
      requested: "已申请",
      completed: "已完成",
      failed: "失败",
    },
    depositStatuses: {
      confirmed: "已确认",
      completed: "已完成",
      failed: "失败",
      pending: "处理中",
      submitted: "已提交",
    },
    sides: {
      buy: "买入",
      sell: "卖出",
    },
  },
  wallet: {
    title: "Base 钱包连接",
    subtitle: "v1 仅支持 Base。请在 {network} 上连接钱包以启用充值验证和提现。",
    connectedWallet: "当前钱包",
    notConnected: "未连接",
    walletNetwork: "钱包网络",
    unknown: "未知",
    wrongNetwork: "网络错误",
    linkedWallet: "已绑定钱包",
    notLinked: "未绑定",
    disconnectedBadge: "钱包未连接。",
    connectedBadge: "钱包已连接到 {network}。",
    wrongNetworkBadge: "网络错误。请切换到 {network}。",
    connectWallet: "连接钱包",
    reconnectWallet: "重新连接钱包",
    connecting: "连接中…",
    switchToNetwork: "切换到 {network}",
    linkWallet: "绑定钱包",
    relinkWallet: "重新绑定钱包",
    noWalletDetected: "未检测到钱包。请安装 Coinbase Wallet 或 MetaMask 以进行 Base Sepolia 测试。",
    walletConnectionCancelled: "钱包连接已取消。",
    failedToConnectWallet: "连接钱包失败。",
    failedToSwitchNetwork: "切换网络失败。",
    switchBeforeLink: "绑定前请先将钱包网络切换到 {network}。",
    invalidSignature: "钱包没有返回有效签名。",
    signatureMismatch: "钱包签名与当前连接账户不匹配。",
    failedToLinkWallet: "绑定钱包失败。",
    walletLinkedNotice: "钱包已绑定。此账户现已启用 Base 充值验证。",
  },
  claims: {
    title: "索赔与赔付",
    subtitle: "跟踪你资产中已结算市场的可领取和已领取赔付状态。",
    unavailable: "请先登录以加载索赔和赔付历史。",
    claimableNow: "当前可领取",
    claimableNowHint: "仍待处理的索赔。",
    claimedLifetime: "累计已领取",
    claimedLifetimeHint: "已结算赔付款总额。",
    historyTitle: "索赔历史",
    noClaims: "暂无索赔记录。持有获胜份额的市场结算后会生成索赔记录。",
    market: "市场",
    status: "状态",
    claimable: "可领取",
    claimed: "已领取",
    updated: "更新时间",
    statuses: {
      claimable: "可领取",
      claimed: "已领取",
    },
  },
  referrals: {
    title: "推荐",
    subtitle: "扩展你的网络，跟踪下线活动，并查看基于充值的 MLM 佣金。",
    inviteCode: "你的邀请码",
    lifetimeCommission: "累计佣金",
    last30Days: "最近 30 天",
    downline: "下线人数",
    directReferrals: "直属推荐",
    sponsor: "推荐人",
    joined: "加入时间",
    noCode: "无邀请码",
    noSponsor: "暂未绑定推荐人。使用推荐码加入上级网络。",
    joinWithCode: "使用推荐码加入",
    referralCode: "推荐码",
    referralCodePlaceholder: "DEMO1001",
    attachSponsor: "绑定推荐人",
    directReferralsTitle: "直属推荐",
    noDirectReferrals: "暂无直属推荐。",
    commissionHistory: "佣金历史",
    noCommissions: "暂无已入账佣金。",
    member: "成员",
    source: "来源",
    level: "层级",
    amount: "金额",
    status: "状态",
    created: "创建时间",
    levelPrefix: "第",
  },
  research: {
    title: "市场研究",
    subtitle: "参考 Polymarket 和 Kalshi 的价格以获取市场背景。交易仍在各自原生平台完成。",
    empty: "暂无已同步市场数据。运行 pnpm sync:external 后刷新此页面。",
    externalId: "外部 ID",
    bestBid: "最佳买价",
    bestAsk: "最佳卖价",
    lastTrade: "最新成交",
    outcomes: "结果选项",
    outcomesUnavailable: "最新同步数据中暂无结果选项。",
    volume24h: "24 小时成交量",
    totalVolume: "总成交量",
    lastSynced: "上次同步",
    never: "从未",
    tradeTime: "成交时间",
    side: "方向",
    price: "价格",
    size: "数量",
    noRecentTrades: "此市场暂未记录到最新外部成交。",
    statuses: {
      open: "活跃",
      resolved: "已结算",
      closed: "已关闭",
      cancelled: "已取消",
    },
    sides: {
      buy: "买入",
      sell: "卖出",
    },
  },
};

export const localeCopy: Record<AppLocale, LocaleCopy> = {
  en,
  "zh-CN": zhCN,
};

export const getLocaleCopy = (locale: AppLocale): LocaleCopy => localeCopy[locale];

export const interpolate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");
