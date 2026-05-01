# Polymarket UI Readiness

The Polymarket UI is a read-only public portal unless every live-order readiness gate passes. This hardening pass does not enable live trading.

## Tradability Codes

- `tradable`: 可交易
- `closed`: 市場已關閉
- `resolved`: 市場已結算
- `cancelled`: 市場已取消
- `inactive`: 市場暫不可交易
- `not_accepting_orders`: 市場暫不接受訂單
- `orderbook_disabled`: 訂單簿暫不可用
- `stale`: 市場資料可能過期
- `unknown`: 市場只供瀏覽

Terminal states win in this order: resolved, cancelled, closed, inactive, not accepting orders, orderbook disabled, stale, unknown. Strong live flags from Polymarket can keep a market open even when a legacy `endDate` or `closeTime` is old.

## Readiness Priority

Trade intent labels use this priority:

1. Wallet not connected: 連接錢包
2. Missing Polymarket credentials: 設定 Polymarket 交易權限
3. User signature required: 需要用戶自行簽署訂單
4. Missing Builder Code: Builder Code 未設定
5. Feature or submitter disabled: 實盤提交已停用
6. Market state: the exact tradability label
7. Invalid order values: 價格或數量無效

This prevents missing credentials, disabled submitter, or feature flags from being mislabeled as a closed market.

## Public Pages

`/polymarket` defaults to 熱門市場 / Smart Feed. `view=all` opens 全部市場 / All Markets and keeps no-price, stale, low-volume, closed, resolved, and cancelled records visible for browsing.

Market cards show image, title, localized title when available, outcomes/prices, 24h volume, liquidity, close time, status badges, source, updated time, and referral-preserving share/detail links.

The primary external-site CTA labels `前往 Polymarket` and `Open on Polymarket` must not return as public primary CTAs.

## Safety

The UI does not custody funds, does not use platform credentials for users, does not mutate internal balances from Polymarket activity, and does not submit live orders unless all existing readiness checks pass.
