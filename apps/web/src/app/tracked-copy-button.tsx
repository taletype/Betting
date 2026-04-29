"use client";

import React from "react";

import { CopyButton } from "./copy-button";
import { trackFunnelEvent, type FunnelEventName } from "./funnel-analytics";

export function TrackedCopyButton({
  value,
  label,
  copiedLabel = label,
  eventName,
  metadata,
}: {
  value: string;
  label: string;
  copiedLabel?: string;
  eventName: FunnelEventName;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  return (
    <CopyButton
      value={value}
      label={label}
      copiedLabel={copiedLabel}
      onCopied={() => trackFunnelEvent(eventName, metadata)}
    />
  );
}
