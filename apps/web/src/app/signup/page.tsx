import React from "react";
import Link from "next/link";

import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { sendMagicLinkAction } from "../auth-actions";
import { FunnelEventTracker } from "../funnel-analytics";

export default async function SignupPage() {
  const copy = getLocaleCopy(defaultLocale).auth;

  return (
    <main className="stack">
      <FunnelEventTracker name="signup_started" />
      <section className="hero">
        <h1>{copy.signupTitle}</h1>
        <p>{copy.signupSubtitle}</p>
      </section>

      <section className="panel stack">
        <form action={sendMagicLinkAction} className="stack">
          <input type="hidden" name="next" value="/account" />
          <label className="stack">
            {copy.email}
            <input name="email" type="email" placeholder={copy.emailPlaceholder} required />
          </label>
          <button type="submit">{copy.continueWithEmail}</button>
        </form>
        <Link className="muted" href="/login">{copy.login}</Link>
      </section>
    </main>
  );
}
