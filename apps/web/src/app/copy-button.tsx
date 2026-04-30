"use client";

import React from "react";
import { useState } from "react";

export function CopyButton({
  value,
  label,
  copiedLabel = label,
  onCopied,
}: {
  value: string;
  label: string;
  copiedLabel?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      data-copy-value={value}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        onCopied?.();
        window.setTimeout(() => setCopied(false), 1600);
      }}
      title={label}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
