"use client";

import React from "react";
import { useMemo, useState } from "react";

const toSafeHttpUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export function selectHomeMarketImageUrl(imageUrl: string | null | undefined, iconUrl: string | null | undefined): string | null {
  return toSafeHttpUrl(imageUrl) ?? toSafeHttpUrl(iconUrl);
}

export function HomeMarketImage({
  imageUrl,
  iconUrl,
  alt,
  featured = false,
}: {
  imageUrl: string | null | undefined;
  iconUrl: string | null | undefined;
  alt: string;
  featured?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const safeUrl = useMemo(() => selectHomeMarketImageUrl(imageUrl, iconUrl), [imageUrl, iconUrl]);

  if (!safeUrl || failed) {
    return (
      <div className={`home-market-image-fallback${featured ? " featured" : ""}`} aria-hidden="true">
        <span>Polymarket</span>
      </div>
    );
  }

  return (
    <img
      src={safeUrl}
      alt={alt}
      width={featured ? 960 : 720}
      height={featured ? 540 : 405}
      className="home-market-image"
      loading={featured ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}
