"use client";

import { useState } from "react";

export function CopyButton({ value, label, copiedLabel = label }: { value: string; label: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      title={label}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
