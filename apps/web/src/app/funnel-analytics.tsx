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
  | "trade_cta_clicked"
  | "routed_trade_attempted"
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
