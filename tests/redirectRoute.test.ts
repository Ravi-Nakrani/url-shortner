import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const connectToDatabaseMock = vi.fn();
const findLinkByShortCodeMock = vi.fn();
const recordClickEventMock = vi.fn();

vi.mock("@/lib/db/connect", () => ({
  connectToDatabase: (...args: unknown[]) => connectToDatabaseMock(...args),
}));

vi.mock("@/lib/services/linkService", () => ({
  findLinkByShortCode: (...args: unknown[]) => findLinkByShortCodeMock(...args),
}));

vi.mock("@/lib/services/outboxService", () => ({
  recordClickEvent: (...args: unknown[]) => recordClickEventMock(...args),
}));

const { GET } = await import("@/app/[shortCode]/route");

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/abc123", { headers });
}

function makeParams(shortCode: string) {
  return { params: Promise.resolve({ shortCode }) };
}

describe("GET /[shortCode]", () => {
  beforeEach(() => {
    connectToDatabaseMock.mockReset().mockResolvedValue(undefined);
    findLinkByShortCodeMock.mockReset();
    recordClickEventMock.mockReset().mockResolvedValue(undefined);
  });

  it("redirects to the destination with a 302, not a 301, so repeat clicks aren't browser-cached away", async () => {
    findLinkByShortCodeMock.mockResolvedValue({ longUrl: "https://example.com/dest" });

    const response = await GET(makeRequest(), makeParams("abc123"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/dest");
  });

  it("records a click event with the referrer and user agent before redirecting", async () => {
    findLinkByShortCodeMock.mockResolvedValue({ longUrl: "https://example.com/dest" });

    await GET(
      makeRequest({ referer: "https://google.com", "user-agent": "test-agent" }),
      makeParams("abc123"),
    );

    expect(recordClickEventMock).toHaveBeenCalledWith("abc123", {
      referrer: "https://google.com",
      userAgent: "test-agent",
    });
  });

  it("returns a styled HTML 404 page for an unknown or expired short code, not a raw JSON error", async () => {
    findLinkByShortCodeMock.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams("doesnotexist"));

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("Link not found");
    expect(recordClickEventMock).not.toHaveBeenCalled();
  });

  it("still redirects successfully even when recording the click event fails", async () => {
    findLinkByShortCodeMock.mockResolvedValue({ longUrl: "https://example.com/dest" });
    recordClickEventMock.mockRejectedValue(new Error("db hiccup"));

    const response = await GET(makeRequest(), makeParams("abc123"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/dest");
  });

  it("returns a 500 error when the database lookup itself fails", async () => {
    findLinkByShortCodeMock.mockRejectedValue(new Error("connection lost"));

    const response = await GET(makeRequest(), makeParams("abc123"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
