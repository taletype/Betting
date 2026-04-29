export const supportedLocales = ["zh-HK", "en"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "zh-HK";
export const chineseLocale: AppLocale = "zh-HK";
export const englishLocale: AppLocale = "en";
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
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));

export interface LocaleCopy {
  shell: {
    brand: string;
    nav: {
      markets: string;
      portfolio: string;
      ambassador: string;
      rewards: string;
      claims: string;
      research: string;
      account: string;
      admin: string;
    };
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    signupTitle: string;
    signupSubtitle: string;
    accountTitle: string;
    accountSubtitle: string;
    email: string;
    emailPlaceholder: string;
    sendMagicLink: string;
    continueWithEmail: string;
    logout: string;
    login: string;
    signup: string;
    sessionRequired: string;
    authUnavailable: string;
    magicLinkNotice: string;
    pendingReferral: string;
    noPendingReferral: string;
    applyReferral: string;
    referralApplied: string;
    connectWallet: string;
    walletStatus: string;
    readinessStatus: string;
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
  ambassador: {
    title: string;
    subtitle: string;
    safeNotice: string;
    approvalNotice: string;
    code: string;
    link: string;
    copy: string;
    directReferrals: string;
    directTradingVolume: string;
    pendingRewards: string;
    payableRewards: string;
    paidRewards: string;
    teamMembership: string;
    noTeamMembership: string;
    referredTraders: string;
    noDirectReferrals: string;
    joined: string;
    tradingVolume: string;
    status: string;
    manualCodeTitle: string;
    manualCodeHint: string;
    manualCodePlaceholder: string;
    applyCode: string;
  };
  rewards: {
    title: string;
    subtitle: string;
    ledger: string;
    payouts: string;
    sourceTrade: string;
    rewardType: string;
    amount: string;
    status: string;
    created: string;
    requestPayout: string;
    payoutDestination: string;
    destinationPlaceholder: string;
    thresholdNotice: string;
    noRewards: string;
    noPayouts: string;
    statuses: Record<string, string>;
    payoutStatuses: Record<string, string>;
    rewardTypes: Record<string, string>;
  };
  research: {
    title: string;
    subtitle: string;
    empty: string;
    loadError: string;
    externalId: string;
    bestBid: string;
    bestAsk: string;
    lastTrade: string;
    outcomes: string;
    outcomesUnavailable: string;
    volume24h: string;
    totalVolume: string;
    liquidity: string;
    closeTime: string;
    resolution: string;
    source: string;
    provenance: string;
    openOnPolymarket: string;
    openOnPolymarketUnavailable: string;
    builderDebug: string;
    builderCodeConfigured: string;
    routedTradingEnabled: string;
    walletConnected: string;
    polymarketCredentials: string;
    marketTradable: string;
    submitterAvailable: string;
    orderSubmitterMode: string;
    intendedFees: string;
    feeNotice: string;
    yes: string;
    no: string;
    disabled: string;
    mock: string;
    lastSynced: string;
    never: string;
    tradeTime: string;
    side: string;
    price: string;
    size: string;
    noRecentTrades: string;
    tradeViaPolymarket: string;
    nonCustodialNotice: string;
    builderAttributionNotice: string;
    orderReview: string;
    market: string;
    outcome: string;
    estimatedCostProceeds: string;
    readiness: string;
    submitUserSignedOrder: string;
    readinessCopy: Record<string, string>;
    polymarketRoutingPending: string;
    statuses: Record<string, string>;
    sides: Record<string, string>;
  };
  admin: {
    title: string;
    subtitle: string;
    ambassadors: string;
    rewards: string;
    payouts: string;
    createCode: string;
    disableCode: string;
    ownerUserId: string;
    code: string;
    status: string;
    reason: string;
    referralAttributions: string;
    tradeAttributions: string;
    rewardLedger: string;
    payoutReview: string;
    markPayable: string;
    approve: string;
    markPaid: string;
    markFailed: string;
    cancel: string;
    exportCsv: string;
    suspiciousReview: string;
    noRows: string;
    manualTrade: string;
    userId: string;
    notional: string;
    builderFee: string;
    recordConfirmedTrade: string;
    txHash: string;
    notes: string;
  };
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

const en: LocaleCopy = {
  shell: {
    brand: "Bet",
    nav: {
      markets: "Markets",
      portfolio: "Portfolio",
      ambassador: "Ambassador",
      rewards: "Rewards",
      claims: "Claims",
      research: "Polymarket",
      account: "Account",
      admin: "Admin",
    },
  },
  auth: {
    loginTitle: "Login",
    loginSubtitle: "Use email magic-link login when Supabase Auth is configured.",
    signupTitle: "Sign up",
    signupSubtitle: "Create an account, then apply the first valid referral code captured for this browser.",
    accountTitle: "Account",
    accountSubtitle: "Manage session, wallet readiness, and pending referral attribution.",
    email: "Email",
    emailPlaceholder: "you@example.com",
    sendMagicLink: "Send magic link",
    continueWithEmail: "Continue with email",
    logout: "Logout",
    login: "Login",
    signup: "Sign up",
    sessionRequired: "Please log in to view this page.",
    authUnavailable: "Production command actions stay disabled until Supabase Auth is configured.",
    magicLinkNotice: "Check your email for the magic link. Referral attribution is applied only after session confirmation.",
    pendingReferral: "Pending referral code",
    noPendingReferral: "No pending referral code in this browser.",
    applyReferral: "Apply referral code",
    referralApplied: "Referral attribution applied when the code is valid and this account has no existing attribution.",
    connectWallet: "Connect wallet",
    walletStatus: "Wallet status",
    readinessStatus: "Polymarket readiness",
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
    unavailableAction: "-",
    creditDeposit: "Credit Deposit",
    creditDepositHint: "Settlement asset: {asset}. Network: {network}. Deposits are credited by verifying an onchain USDC transfer to treasury.",
    treasuryLabel: "Treasury",
    usdcTokenLabel: "USDC token",
    depositVerificationHint: "Current implementation verifies an existing transaction hash. Sending funds from wallet is still done in your wallet app.",
    txHashPlaceholder: "0x transaction hash",
    creditDepositButton: "Credit Deposit",
    requestWithdrawal: "Request Withdrawal",
    requestWithdrawalHint: "Enter amount and destination wallet to create a manually reviewed {network} withdrawal request.",
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
    notConnected: "Wallet not connected",
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
    connecting: "Connecting...",
    switchToNetwork: "Switch to {network}",
    linkWallet: "Link Wallet",
    relinkWallet: "Relink Wallet",
    noWalletDetected: "No wallet detected. Install Coinbase Wallet or MetaMask for Base.",
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
  ambassador: {
    title: "Ambassador Rewards",
    subtitle: "Refer traders. Earn rewards from eligible Builder-fee revenue generated by users you directly refer.",
    safeNotice: "There is no participation fee, no multi-level referral reward, no promised return, and the platform does not bet or trade for users.",
    approvalNotice: "Rewards require confirmation and admin approval before payout.",
    code: "Referral code",
    link: "Referral link",
    copy: "Copy",
    directReferrals: "Direct referrals",
    directTradingVolume: "Direct trading volume",
    pendingRewards: "Pending rewards",
    payableRewards: "Payable rewards",
    paidRewards: "Paid rewards",
    teamMembership: "Team membership",
    noTeamMembership: "Team tracking is organizational only in this scaffold.",
    referredTraders: "Direct referred traders",
    noDirectReferrals: "No direct referred traders yet.",
    joined: "Joined",
    tradingVolume: "Trading volume",
    status: "Status",
    manualCodeTitle: "Manual referral code",
    manualCodeHint: "Apply one valid code. Existing attribution cannot be replaced without admin override.",
    manualCodePlaceholder: "CODE1234",
    applyCode: "Apply code",
  },
  rewards: {
    title: "Rewards",
    subtitle: "Review Ambassador Rewards ledger entries and request manual payout review when payable rewards meet the threshold.",
    ledger: "Reward ledger",
    payouts: "Payout requests",
    sourceTrade: "Source trade",
    rewardType: "Reward type",
    amount: "Amount",
    status: "Status",
    created: "Created",
    requestPayout: "Request payout review",
    payoutDestination: "Destination",
    destinationPlaceholder: "Wallet address or manual reference",
    thresholdNotice: "Payouts are manually reviewed in v1. No automatic production transfer is enabled.",
    noRewards: "No reward ledger entries yet.",
    noPayouts: "No payout requests yet.",
    statuses: {
      pending: "Pending",
      payable: "Payable",
      approved: "Approved",
      paid: "Paid",
      void: "Void",
    },
    payoutStatuses: {
      requested: "Requested",
      approved: "Approved",
      paid: "Paid",
      failed: "Failed",
      cancelled: "Cancelled",
    },
    rewardTypes: {
      platform_revenue: "Platform revenue",
      direct_referrer_commission: "Direct referrer commission",
      trader_cashback: "Trader cashback",
    },
  },
  research: {
    title: "Polymarket Markets",
    subtitle: "Browse public Polymarket markets. When enabled, routed trading remains non-custodial and user-signed.",
    empty: "No synced market data yet. Run pnpm sync:external, then refresh this page.",
    loadError: "Unable to load synced market data. Check that the API server is running and API_BASE_URL points to the right backend, then refresh this page.",
    externalId: "External ID",
    bestBid: "Best bid",
    bestAsk: "Best ask",
    lastTrade: "Price",
    outcomes: "Outcomes",
    outcomesUnavailable: "Outcomes not available in latest sync payload.",
    volume24h: "24h volume",
    totalVolume: "Total volume",
    liquidity: "Liquidity",
    closeTime: "Close time",
    resolution: "Resolution",
    source: "Source",
    provenance: "Source provenance",
    openOnPolymarket: "Open on Polymarket",
    openOnPolymarketUnavailable: "Open on Polymarket link unavailable",
    builderDebug: "Builder attribution status",
    builderCodeConfigured: "builder code configured",
    routedTradingEnabled: "routed trading enabled",
    walletConnected: "wallet connected",
    polymarketCredentials: "Polymarket credentials present",
    marketTradable: "market tradable",
    submitterAvailable: "submitter available",
    orderSubmitterMode: "order submitter mode",
    intendedFees: "intended fees",
    feeNotice: "Actual fees are configured in Polymarket Builder settings, not locally.",
    yes: "yes",
    no: "no",
    disabled: "disabled",
    mock: "mock",
    lastSynced: "Last synced",
    never: "never",
    tradeTime: "Trade time",
    side: "Side",
    price: "Price",
    size: "Size",
    noRecentTrades: "No recent external trades captured for this market yet.",
    tradeViaPolymarket: "Trade via Polymarket",
    nonCustodialNotice: "Review-only shell. Orders remain user-signed and routed externally.",
    builderAttributionNotice: "Builder attribution applies per Polymarket Builder settings.",
    orderReview: "Order review",
    market: "Market",
    outcome: "Outcome",
    estimatedCostProceeds: "Estimated cost/proceeds",
    readiness: "Readiness",
    submitUserSignedOrder: "Submit user-signed order",
    readinessCopy: {
      builder_code_missing: "Builder code missing",
      feature_disabled: "Trading not enabled",
      wallet_not_connected: "Wallet not connected",
      credentials_missing: "Polymarket credentials required",
      market_not_tradable: "Market not tradable",
      submitter_unavailable: "Submitter unavailable",
      ready_to_route: "Ready (submission scaffold only)",
    },
    polymarketRoutingPending: "POLYMARKET_ROUTED_TRADING_ENABLED is disabled until user signing/API credential flow is wired.",
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
  admin: {
    title: "Admin",
    subtitle: "Review ambassador attribution, Builder-fee reward accounting, and manual payout workflow.",
    ambassadors: "Ambassador codes",
    rewards: "Reward ledger",
    payouts: "Payout review",
    createCode: "Create code",
    disableCode: "Disable code",
    ownerUserId: "Owner user ID",
    code: "Code",
    status: "Status",
    reason: "Reason",
    referralAttributions: "Referral attributions",
    tradeAttributions: "Trade attributions",
    rewardLedger: "Reward ledger",
    payoutReview: "Payout review",
    markPayable: "Mark payable",
    approve: "Approve",
    markPaid: "Mark paid",
    markFailed: "Mark failed",
    cancel: "Cancel",
    exportCsv: "Export CSV",
    suspiciousReview: "Suspicious attribution review",
    noRows: "No records yet.",
    manualTrade: "Manual Builder-fee event",
    userId: "User ID",
    notional: "Notional USDC atoms",
    builderFee: "Builder fee USDC atoms",
    recordConfirmedTrade: "Record confirmed trade",
    txHash: "Tx hash/reference",
    notes: "Notes",
  },
};

const zhHK: DeepPartial<LocaleCopy> = {
  shell: {
    brand: "Bet",
    nav: {
      markets: "市場",
      portfolio: "資產",
      ambassador: "大使推薦",
      rewards: "獎勵",
      claims: "領取",
      research: "Polymarket 市場",
      account: "帳戶",
      admin: "管理",
    },
  },
  auth: {
    loginTitle: "登入",
    loginSubtitle: "如已設定 Supabase Auth，可使用電郵一次性連結登入。",
    signupTitle: "註冊",
    signupSubtitle: "建立帳戶後，系統會套用此瀏覽器最先記錄的有效推薦碼。",
    accountTitle: "帳戶",
    accountSubtitle: "查看登入狀態、錢包準備狀態及待套用推薦碼。",
    email: "電郵",
    emailPlaceholder: "you@example.com",
    sendMagicLink: "發送登入連結",
    continueWithEmail: "以電郵繼續",
    logout: "登出",
    login: "登入",
    signup: "註冊",
    sessionRequired: "請先登入以查看此頁面。",
    authUnavailable: "Supabase Auth 未完成設定前，正式命令操作會保持停用。",
    magicLinkNotice: "請查看電郵登入連結。推薦歸因只會在登入確認後套用。",
    pendingReferral: "待套用推薦碼",
    noPendingReferral: "此瀏覽器未有待套用推薦碼。",
    applyReferral: "套用推薦碼",
    referralApplied: "如推薦碼有效且此帳戶未有歸因，系統會套用推薦歸因。",
    connectWallet: "連接錢包",
    walletStatus: "錢包狀態",
    readinessStatus: "Polymarket 準備狀態",
  },
  markets: {
    title: "市場",
    subtitle: "集中查看即時及已結算預測市場，包括深度、近期活動及結算狀態。",
    totalMarkets: "市場總數",
    totalMarketsHint: "包括開放及已結算市場。",
    activeNow: "現正開放",
    activeNowHint: "可下單及撮合的市場。",
    resolved: "已結算",
    resolvedHint: "已有派付紀錄的已結算市場。",
    noMarketsTitle: "暫無市場",
    noMarketsBody: "目前未有已發布市場。請執行 seed/reset 及 staging drill harness 後重新整理。",
    outcomes: "結果",
    none: "無",
    status: "狀態",
    bestBid: "最佳買盤",
    bestAsk: "最佳賣盤",
    lastTrade: "最新成交",
    volume: "成交量",
    statuses: {
      open: "開放",
      resolved: "已結算",
      halted: "已暫停",
      cancelled: "已取消",
    },
  },
  portfolio: {
    title: "資產",
    subtitle: "查看結餘及轉帳紀錄，並驗證充值或提出提款申請。",
    unavailable: "請先登入以載入資產、訂單、領取、充值及提款紀錄。",
    availableBalance: "可用結餘",
    availableBalanceHint: "可用於交易。",
    reservedBalance: "預留結餘",
    reservedBalanceHint: "已鎖定於未完成訂單及待成交部分。",
    linkedWalletRecord: "已連結錢包紀錄",
    walletAddress: "錢包地址",
    verifiedAt: "驗證時間",
    positions: "持倉",
    noPositions: "暫無持倉。",
    openOrders: "未完成訂單",
    noOpenOrders: "暫無未完成訂單。",
    claims: "領取",
    noClaims: "暫無可領取金額。",
    claimAction: "領取",
    creditDeposit: "入帳充值",
    creditDepositHint: "結算資產：{asset}。網絡：{network}。充值會透過驗證鏈上 USDC 轉帳至金庫後入帳。",
    treasuryLabel: "金庫",
    usdcTokenLabel: "USDC 代幣",
    depositVerificationHint: "目前只驗證既有交易哈希。實際轉帳仍在你的錢包應用內完成。",
    txHashPlaceholder: "0x 交易哈希",
    creditDepositButton: "入帳充值",
    requestWithdrawal: "申請提款",
    requestWithdrawalHint: "輸入金額及目標錢包，以建立需人手審批的 {network} 提款申請。",
    amountPlaceholder: "金額 (atoms)",
    destinationPlaceholder: "0x 目標錢包",
    requestWithdrawalButton: "申請提款",
    depositHistory: "充值紀錄",
    noDeposits: "暫無已入帳充值。",
    withdrawalHistory: "提款紀錄",
    noWithdrawals: "暫無提款申請。",
    market: "市場",
    outcome: "結果",
    shares: "份額",
    avgPrice: "平均價",
    realizedPnl: "已實現盈虧",
    side: "方向",
    price: "價格",
    remaining: "剩餘",
    status: "狀態",
    claimable: "可領取",
    claimed: "已領取",
    action: "操作",
    txHash: "交易哈希",
    amount: "金額",
    verifiedAtColumn: "驗證時間",
    destination: "目標地址",
    timeline: "時間線",
    requestedAt: "申請",
    processedAt: "處理",
    transaction: "交易",
    orderStatuses: {
      open: "開放",
      partially_filled: "部分成交",
      filled: "已成交",
      cancelled: "已取消",
    },
    claimStatuses: {
      claimable: "可領取",
      claimed: "已領取",
    },
    withdrawalStatuses: {
      requested: "已申請",
      completed: "已完成",
      failed: "失敗",
    },
    depositStatuses: {
      confirmed: "已確認",
      completed: "已完成",
      failed: "失敗",
      pending: "待處理",
      submitted: "已提交",
    },
    sides: {
      buy: "買入",
      sell: "賣出",
    },
  },
  wallet: {
    title: "Base 錢包連接",
    subtitle: "v1 只支援 Base。請在 {network} 連接錢包以啟用充值驗證及提款。",
    connectedWallet: "已連接錢包",
    notConnected: "尚未連接錢包",
    walletNetwork: "錢包網絡",
    unknown: "未知",
    wrongNetwork: "網絡不正確",
    linkedWallet: "已連結錢包",
    notLinked: "未連結",
    disconnectedBadge: "尚未連接錢包。",
    connectedBadge: "錢包已連接至 {network}。",
    wrongNetworkBadge: "網絡不正確，請切換至 {network}。",
    connectWallet: "連接錢包",
    reconnectWallet: "重新連接錢包",
    connecting: "連接中...",
    switchToNetwork: "切換至 {network}",
    linkWallet: "連結錢包",
    relinkWallet: "重新連結錢包",
    noWalletDetected: "未偵測到錢包。請安裝 Coinbase Wallet 或 MetaMask 並切換至 Base。",
    walletConnectionCancelled: "錢包連接已取消。",
    failedToConnectWallet: "連接錢包失敗。",
    failedToSwitchNetwork: "切換網絡失敗。",
    switchBeforeLink: "連結前請先將錢包網絡切換至 {network}。",
    invalidSignature: "錢包未返回有效簽署。",
    signatureMismatch: "錢包簽署與已連接帳戶不符。",
    failedToLinkWallet: "連結錢包失敗。",
    walletLinkedNotice: "錢包已連結。此帳戶現可使用 Base 充值驗證。",
  },
  claims: {
    title: "領取及派付",
    subtitle: "追蹤已結算市場的可領取及已領取狀態。",
    unavailable: "請先登入以載入領取及派付紀錄。",
    claimableNow: "現可領取",
    claimableNowHint: "仍待操作的領取項目。",
    claimedLifetime: "累計已領取",
    claimedLifetimeHint: "已結算派付總額。",
    historyTitle: "領取紀錄",
    noClaims: "暫無領取紀錄。持有勝出份額的市場結算後會產生紀錄。",
    market: "市場",
    status: "狀態",
    claimable: "可領取",
    claimed: "已領取",
    updated: "更新時間",
    statuses: {
      claimable: "可領取",
      claimed: "已領取",
    },
  },
  ambassador: {
    title: "大使推薦獎勵",
    subtitle: "推薦交易者。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。",
    safeNotice: "本平台不收取參與費用，不設多層推薦獎勵，不保證盈利，亦不會替用戶下注或交易。",
    approvalNotice: "獎勵需要經確認及審批後才可支付。",
    code: "推薦碼",
    link: "推薦連結",
    copy: "複製",
    directReferrals: "直接推薦",
    directTradingVolume: "直接交易量",
    pendingRewards: "待確認獎勵",
    payableRewards: "可提取獎勵",
    paidRewards: "已支付獎勵",
    teamMembership: "團隊成員資格",
    noTeamMembership: "團隊追蹤只作組織及報表用途。",
    referredTraders: "直接推薦交易者",
    noDirectReferrals: "暫無直接推薦交易者。",
    joined: "加入時間",
    tradingVolume: "交易量",
    status: "狀態",
    manualCodeTitle: "手動輸入推薦碼",
    manualCodeHint: "只可套用一個有效推薦碼；既有歸因只可由管理員覆核更正。",
    manualCodePlaceholder: "CODE1234",
    applyCode: "套用推薦碼",
  },
  rewards: {
    title: "大使推薦獎勵",
    subtitle: "查看獨立獎勵帳本，當可提取獎勵達門檻後可提交人工審批。",
    ledger: "獎勵帳本",
    payouts: "支付申請",
    sourceTrade: "來源交易歸因",
    rewardType: "獎勵類型",
    amount: "金額",
    status: "狀態",
    created: "建立時間",
    requestPayout: "申請支付審批",
    payoutDestination: "支付目的地",
    destinationPlaceholder: "錢包地址或人工參考",
    thresholdNotice: "v1 支付需要人工審批，預設不會自動轉帳。",
    noRewards: "暫無獎勵帳本紀錄。",
    noPayouts: "暫無支付申請。",
    statuses: {
      pending: "待確認",
      payable: "可提取",
      approved: "已審批",
      paid: "已支付",
      void: "已作廢",
    },
    payoutStatuses: {
      requested: "已申請",
      approved: "已審批",
      paid: "已支付",
      failed: "失敗",
      cancelled: "已取消",
    },
    rewardTypes: {
      platform_revenue: "平台收入",
      direct_referrer_commission: "直接推薦佣金",
      trader_cashback: "交易者回贈",
    },
  },
  research: {
    title: "Polymarket 市場",
    subtitle: "瀏覽公開 Polymarket 市場。路由交易啟用後仍維持非託管，訂單由用戶自行簽署。",
    empty: "暫無已同步市場資料。請執行 pnpm sync:external 後重新整理。",
    loadError: "無法載入已同步市場資料。請確認 API 服務正在運行，且 API_BASE_URL 指向正確後端。",
    externalId: "外部 ID",
    bestBid: "最佳買盤",
    bestAsk: "最佳賣盤",
    lastTrade: "價格",
    outcomes: "結果",
    outcomesUnavailable: "最新同步資料未包含結果。",
    volume24h: "24 小時成交量",
    totalVolume: "總成交量",
    liquidity: "流動性",
    closeTime: "關閉時間",
    resolution: "結算狀態",
    source: "來源",
    provenance: "來源出處",
    openOnPolymarket: "前往 Polymarket",
    openOnPolymarketUnavailable: "Polymarket 連結暫不可用",
    builderDebug: "Builder 歸因狀態",
    builderCodeConfigured: "Builder 代碼已設定",
    routedTradingEnabled: "路由交易已啟用",
    walletConnected: "錢包已連接",
    polymarketCredentials: "Polymarket 憑證已準備",
    marketTradable: "市場可交易",
    submitterAvailable: "提交器可用",
    orderSubmitterMode: "訂單提交模式",
    intendedFees: "預期費用",
    feeNotice: "實際費用由 Polymarket Builder 設定，本地不作配置。",
    yes: "是",
    no: "否",
    disabled: "已停用",
    mock: "模擬",
    lastSynced: "上次同步",
    never: "從未",
    tradeTime: "成交時間",
    side: "方向",
    price: "價格",
    size: "數量",
    noRecentTrades: "此市場暫無近期外部成交紀錄。",
    tradeViaPolymarket: "透過 Polymarket 交易",
    nonCustodialNotice: "只供覆核的介面。外部訂單由用戶自行簽署並在外部路由。",
    builderAttributionNotice: "Builder 歸因依照 Polymarket Builder 設定處理。",
    orderReview: "訂單覆核",
    market: "市場",
    outcome: "結果",
    estimatedCostProceeds: "預計成本/所得",
    readiness: "準備狀態",
    submitUserSignedOrder: "提交用戶自行簽署訂單",
    readinessCopy: {
      builder_code_missing: "Builder 代碼缺失",
      feature_disabled: "交易功能尚未啟用",
      wallet_not_connected: "尚未連接錢包",
      credentials_missing: "需要 Polymarket 憑證",
      market_not_tradable: "市場暫不可交易",
      submitter_unavailable: "提交器暫不可用",
      ready_to_route: "已準備好 (只限提交框架)",
    },
    polymarketRoutingPending: "用戶簽署及 API 憑證流程完成前，POLYMARKET_ROUTED_TRADING_ENABLED 會保持關閉。",
    statuses: {
      open: "開放",
      resolved: "已結算",
      closed: "已關閉",
      cancelled: "已取消",
    },
    sides: {
      buy: "買入",
      sell: "賣出",
    },
  },
  admin: {
    title: "管理",
    subtitle: "覆核大使推薦歸因、Builder 費用獎勵帳務及人工支付流程。",
    ambassadors: "大使推薦碼",
    rewards: "獎勵帳本",
    payouts: "支付審批",
    createCode: "建立推薦碼",
    disableCode: "停用推薦碼",
    ownerUserId: "擁有人用戶 ID",
    code: "推薦碼",
    status: "狀態",
    reason: "原因",
    referralAttributions: "推薦歸因",
    tradeAttributions: "Builder 交易歸因",
    rewardLedger: "獎勵帳本",
    payoutReview: "支付審批",
    markPayable: "標記為可提取",
    approve: "審批",
    markPaid: "標記為已支付",
    markFailed: "標記失敗",
    cancel: "取消",
    exportCsv: "匯出 CSV",
    suspiciousReview: "可疑歸因覆核",
    noRows: "暫無紀錄。",
    manualTrade: "手動 Builder 費用事件",
    userId: "用戶 ID",
    notional: "名義金額 USDC atoms",
    builderFee: "Builder 費用 USDC atoms",
    recordConfirmedTrade: "記錄已確認交易",
    txHash: "交易哈希/參考",
    notes: "備註",
  },
};

const mergeLocaleCopy = <T>(fallback: T, override: DeepPartial<T> | undefined): T => {
  if (!override || typeof fallback !== "object" || fallback === null) {
    return fallback;
  }

  const result: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    const fallbackValue = result[key];
    result[key] =
      value && typeof value === "object" && !Array.isArray(value) && fallbackValue && typeof fallbackValue === "object"
        ? mergeLocaleCopy(fallbackValue, value as DeepPartial<typeof fallbackValue>)
        : value;
  }
  return result as T;
};

const localizedCopy: Record<AppLocale, DeepPartial<LocaleCopy>> = {
  en,
  "zh-HK": zhHK,
};

export const getLocaleCopy = (locale: AppLocale): LocaleCopy => mergeLocaleCopy(en, localizedCopy[locale]);

export const localeCopy: Record<AppLocale, LocaleCopy> = {
  en: getLocaleCopy("en"),
  "zh-HK": getLocaleCopy("zh-HK"),
};

export const interpolate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");
