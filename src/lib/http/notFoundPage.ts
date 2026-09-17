import { NextResponse } from "next/server";

// A hand-rolled HTML page for the redirect route: it's a plain Route Handler, not a
// Server Component, so Next's `notFound()` / `not-found.tsx` page-rendering pipeline
// doesn't apply here — calling `notFound()` in a Route Handler only sets the status
// code and returns an empty body, which isn't a real page for a human clicking a
// broken link in their browser. The token values are duplicated from globals.css
// since this response is built outside the React tree that reads them as CSS
// variables.
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Link not found</title>
<style>
  :root { --bg: #faf9f6; --text: #1c1c1e; --text-muted: #6b6b6f; --accent: #1d5c4f; --surface: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14151a; --text: #f2f1ec; --text-muted: #9a9a9f; --accent: #4fb8a0; --surface: #1c1e24; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg); color: var(--text); text-align: center; padding: 24px;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 12px; }
  p { color: var(--text-muted); max-width: 24rem; margin: 0 auto 24px; }
  a {
    display: inline-block; background: var(--accent); color: var(--surface);
    text-decoration: none; font-weight: 500; font-size: 0.875rem; padding: 10px 18px; border-radius: 4px;
  }
</style>
</head>
<body>
<div>
  <h1>Link not found</h1>
  <p>This short link doesn't exist or has expired. Double-check the URL, or shorten a new one.</p>
  <a href="/">Shorten a link</a>
</div>
</body>
</html>`;

export function notFoundPageResponse(): NextResponse {
  return new NextResponse(HTML, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
