"use client";

import { useState } from "react";

export function ShortLinkResult({
  shortUrl,
  longUrl,
  onReset,
}: {
  shortUrl: string;
  longUrl: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context); silently no-op —
      // the user can still select and copy the text manually.
    }
  }

  return (
    <div className="rounded border border-border bg-accent-surface p-6">
      <p className="mb-2 text-sm text-text-muted">Your short link is ready</p>
      <a
        href={shortUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-4 block break-all font-mono text-xl font-semibold text-accent underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {shortUrl}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Short link copied to clipboard" : ""}
        </span>
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs font-medium tracking-wide text-text-muted uppercase">Original URL</p>
        <p className="mt-1 break-all text-sm text-text-muted">{longUrl}</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 text-sm text-text-muted underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Shorten another link
      </button>
    </div>
  );
}
