import type { NextConfig } from "next";

// A small, verified-compatible set of security headers — not a full
// checklist. Notably excludes Content-Security-Policy: this app's root
// layout relies on Next.js App Router's own inline hydration scripts, and
// the redirect route's 404 page (src/lib/http/notFoundPage.ts) is a
// hand-rolled HTML response with a real inline <style> block. A CSP strict
// enough to be meaningful would need nonce plumbing through the layout and
// route handler that's out of scope for this hardening pass — see
// DECISIONS.md rather than shipping a permissive/no-op policy just to have
// one.
const securityHeaders = [
  // Blocks a browser from sniffing a response's content type into something
  // other than what Content-Type declares (e.g. treating a hosted upload as
  // executable script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Prevents this app's pages from being framed by another origin
  // (clickjacking). Nothing here needs to be embedded in a third-party
  // iframe, and this doesn't affect this app redirecting the browser to
  // GitHub's/Google's own OAuth pages (a top-level navigation, not framing).
  { key: "X-Frame-Options", value: "DENY" },
  // Sends only the origin (not the full URL/path) on a cross-origin
  // navigation or request, and the full URL on a same-origin one — standard,
  // conservative default that doesn't affect the OAuth sign-in redirect.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app doesn't use any of these browser features anywhere.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const headers = [...securityHeaders];

    // HSTS only makes sense to advertise for real HTTPS production traffic
    // (Vercel deployments); a local `next dev` server is plain HTTP, where
    // browsers ignore the header anyway, but there's no reason to send it.
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }

    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
