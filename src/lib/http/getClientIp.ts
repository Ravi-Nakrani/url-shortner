import type { NextRequest } from "next/server";

// Trust boundary: this app is deployed on Vercel only (see README/DECISIONS).
// Vercel's own edge network sets these headers itself on every request that
// reaches this app and — per Vercel's docs — "overwrite[s] the
// X-Forwarded-For header and do[es] not forward external IPs" specifically
// "to prevent IP spoofing." That means a client cannot set its own
// x-forwarded-for value and have it survive to this code; Vercel's edge
// replaces it with the real connecting IP before the request is routed here.
// (The one exception is Vercel's paid "Trusted Proxy" add-on, which this
// project's free-tier deployment doesn't use.)
//
// `x-vercel-forwarded-for` is checked first because Vercel documents it as
// identical to `x-forwarded-for` except that it stays authoritative even if
// something in front of Vercel (a CDN, another proxy) were to rewrite
// `x-forwarded-for` itself — a defense-in-depth preference, not a sign that
// `x-forwarded-for` is untrusted on this deployment today.
//
// None of this holds for `npm run dev` — there is no Vercel edge in front of
// a local server, so any header value is trivially forgeable locally. That's
// an accepted, dev-only limitation: local rate-limit testing can't be used
// to reason about production abuse resistance.
const IP_HEADER_CANDIDATES = ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] as const;

function firstNonEmptyEntry(headerValue: string): string | null {
  for (const candidate of headerValue.split(",")) {
    const trimmed = candidate.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

export function getClientIp(request: NextRequest): string {
  for (const header of IP_HEADER_CANDIDATES) {
    const value = request.headers.get(header);
    if (!value) continue;

    const ip = firstNonEmptyEntry(value);
    if (ip) return ip;
  }

  return "unknown";
}
