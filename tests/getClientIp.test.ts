import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/http/getClientIp";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/links", { headers });
}

describe("getClientIp", () => {
  it("returns the IP from a normal x-forwarded-for header", () => {
    const request = makeRequest({ "x-forwarded-for": "203.0.113.5" });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("takes the first entry of a comma-separated x-forwarded-for chain", () => {
    const request = makeRequest({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("prefers x-vercel-forwarded-for over x-forwarded-for when both are present", () => {
    // Vercel documents x-vercel-forwarded-for as staying authoritative even
    // if something upstream of Vercel rewrites x-forwarded-for itself.
    const request = makeRequest({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "198.51.100.1",
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip when no forwarded-for header is present", () => {
    const request = makeRequest({ "x-real-ip": "198.51.100.42" });
    expect(getClientIp(request)).toBe("198.51.100.42");
  });

  it("returns 'unknown' when no IP headers are present at all", () => {
    const request = makeRequest();
    expect(getClientIp(request)).toBe("unknown");
  });

  it("falls through to the next header when x-forwarded-for is present but empty/malformed", () => {
    const request = makeRequest({
      "x-forwarded-for": " , ,",
      "x-real-ip": "198.51.100.42",
    });
    expect(getClientIp(request)).toBe("198.51.100.42");
  });

  it("trims whitespace around a forwarded IP", () => {
    const request = makeRequest({ "x-forwarded-for": "  203.0.113.5  ,10.0.0.1" });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("never returns an empty string as an identifier, even for an all-blank header", () => {
    const request = makeRequest({ "x-forwarded-for": ",,," });
    expect(getClientIp(request)).toBe("unknown");
  });
});
