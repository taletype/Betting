import React from "react";
import Link from "next/link";

import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { getGuide, type GuideSlug } from "./guide-data";

export function GuidePage({ slug }: { slug: GuideSlug }) {
  const guide = getGuide(slug);

  return (
    <main className="stack">
      <section className="hero">
        <Link className="muted" href="/guides">指南</Link>
        <h1>{guide.title}</h1>
        <p>{guide.summary}</p>
      </section>
      {slug === "fees-and-builder-code" ? <BuilderFeeDisclosureCard locale="zh-HK" /> : null}
      <section className="stack">
        {guide.sections.map((section) => (
          <article className="panel stack" key={section.heading}>
            <h2 className="section-title">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p className="muted" key={paragraph}>{paragraph}</p>
            ))}
          </article>
        ))}
      </section>
    </main>
  );
}
