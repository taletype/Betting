"use client";

import { useEffect } from "react";

export type FunnelEventName =
  | "landing_page_view"
  | "page_view"
  | "market_view"
  | "referral_code_seen"
  | "referral_code_captured"
  | "invite_link_copied"
  | "market_share_link_copied"
  | "signup_started"
  | "signup_completed"
  | "wallet_connect_started"
  | "wallet_connect_clicked"
  | "wallet_connected"
  | "wallet_funding_opened"
  | "wallet_funding_quoted"
  | "wallet_funding_completed"
  | "wallet_funding_failed"
  | "thirdweb_route_quoted"
  | "thirdweb_developer_fee_disclosed"
  | "thirdweb_developer_fee_confirmed"
  | "thirdweb_developer_fee_collected"
  | "wallet_link_started"
  | "wallet_link_verified"
  | "referral_attribution_applied"
  | "referral_attribution_rejected"
  | "trade_ticket_opened"
  | "order_preview_requested"
  | "order_preview_failed"
  | "trade_cta_clicked"
  | "routed_trade_attempted"
  | "routed_trade_signature_requested"
  | "routed_trade_user_signed"
  | "l2_credentials_missing"
  | "geoblock_failed"
  | "user_order_signature_requested"
  | "user_order_signature_completed"
  | "routed_trade_submitted"
  | "routed_trade_submit_failed"
  | "routed_trade_failed"
  | "routed_trade_disabled_reason"
  | "builder_attribution_prepared"
  | "builder_attribution_submitted"
  | "payout_requested";

const funnelEventsStorageKey = "bet_acquisition_funnel_events";

export interface FunnelEvent {
  name: FunnelEventName;
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt: string;
}

export const trackFunnelEvent = (
  name: FunnelEventName,
  metadata?: Record<string, string | number | boolean | null>,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  const event: FunnelEvent = {
    name,
    metadata,
    occurredAt: new Date().toISOString(),
  };

  try {
    const existing = JSON.parse(window.localStorage.getItem(funnelEventsStorageKey) ?? "[]") as FunnelEvent[];
    window.localStorage.setItem(funnelEventsStorageKey, JSON.stringify([...existing.slice(-99), event]));
  } catch {
    window.localStorage.setItem(funnelEventsStorageKey, JSON.stringify([event]));
  }

  window.dispatchEvent(new CustomEvent("bet:funnel-event", { detail: event }));
};

export function FunnelEventTracker({
  name,
  metadata,
}: {
  name: FunnelEventName;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  useEffect(() => {
    trackFunnelEvent(name, metadata);
  }, [name, metadata]);

  return null;
}
