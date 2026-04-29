import React from "react";
import Link from "next/link";

import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { sendMagicLinkAction } from "../auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; auth?: string }>;
}) {
  const params = await searchParams;
  const copy = getLocaleCopy(defaultLocale).auth;

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.loginTitle}</h1>
        <p>{copy.loginSubtitle}</p>
      </section>

      {params?.auth === "unavailable" ? <div className="error-state">{copy.authUnavailable}</div> : null}
      {params?.sent === "1" ? <div className="banner banner-success">{copy.magicLinkNotice}</div> : null}

      <section className="panel stack">
        <form action={sendMagicLinkAction} className="stack">
          <input type="hidden" name="next" value="/account" />
          <label className="stack">
            {copy.email}
            <input name="email" type="email" placeholder={copy.emailPlaceholder} required />
          </label>
          <button type="submit">{copy.sendMagicLink}</button>
        </form>
        <Link className="muted" href="/signup">{copy.signup}</Link>
      </section>
    </main>
  );
}
