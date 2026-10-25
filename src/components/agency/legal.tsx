import type { ReactNode } from "react";

/**
 * The Terms and Privacy pages.
 *
 * TikTok, Meta and Google all require a reachable Terms and Privacy URL
 * before they will review an app, and reviewers do read them against what
 * the app actually does. So these describe the real pipeline — where video
 * goes, which third parties see it, what is kept and for how long — rather
 * than boilerplate. A policy that does not match the software is worse than
 * none, because it is the thing the reviewer checks.
 */

export const UPDATED = "25 October 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page legal-page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p className="page-subtitle">crayZmundo · last updated {UPDATED}</p>
        </div>
      </header>
      <section className="glass-panel legal-body">{children}</section>
    </div>
  );
}
