import { describe, it, expect, afterEach, vi } from "vitest";
import nextConfig from "../next.config";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function getHeaders() {
  const rules = await nextConfig.headers!();
  return rules[0].headers.reduce<Record<string, string>>((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {});
}

describe("next.config headers", () => {
  it("applies to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/(.*)");
  });

  it("always sets the baseline security headers", async () => {
    const headers = await getHeaders();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("does not declare a Content-Security-Policy", async () => {
    // Deliberate: see the comment in next.config.ts for why. A missing CSP
    // is honest here; a fake/permissive one would not be.
    const headers = await getHeaders();
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });

  it("adds Strict-Transport-Security in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = await getHeaders();
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
  });

  it("omits Strict-Transport-Security outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = await getHeaders();
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });
});
