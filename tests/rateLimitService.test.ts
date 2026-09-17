import { describe, it, expect, vi, beforeEach } from "vitest";

const findOneAndUpdateMock = vi.fn();

vi.mock("@/lib/db/models/RateLimit", () => ({
  RateLimit: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdateMock(...args),
  },
}));

const { checkRateLimit } = await import("@/lib/services/rateLimitService");

describe("checkRateLimit", () => {
  beforeEach(() => {
    findOneAndUpdateMock.mockReset();
  });

  it("allows a request when the count is at or below the limit", async () => {
    findOneAndUpdateMock.mockResolvedValue({ count: 3 });

    const result = await checkRateLimit("ip:1.2.3.4", 10, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7);
  });

  it("allows a request when the count exactly equals the limit", async () => {
    findOneAndUpdateMock.mockResolvedValue({ count: 10 });

    const result = await checkRateLimit("ip:1.2.3.4", 10, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("rejects a request once the count exceeds the limit", async () => {
    findOneAndUpdateMock.mockResolvedValue({ count: 11 });

    const result = await checkRateLimit("ip:1.2.3.4", 10, 60_000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("performs a single atomic upsert keyed by identifier and the current window", async () => {
    findOneAndUpdateMock.mockResolvedValue({ count: 1 });

    await checkRateLimit("ip:1.2.3.4", 10, 60_000);

    expect(findOneAndUpdateMock).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdateMock.mock.calls[0];
    expect(filter.key).toMatch(/^ip:1\.2\.3\.4:\d+$/);
    expect(update.$inc).toEqual({ count: 1 });
    expect(update.$setOnInsert.expiresAt).toBeInstanceOf(Date);
    expect(options).toEqual({ upsert: true, new: true });
  });

  it("returns a positive retryAfterSeconds within the window bound", async () => {
    findOneAndUpdateMock.mockResolvedValue({ count: 5 });

    const result = await checkRateLimit("ip:1.2.3.4", 10, 60_000);

    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
