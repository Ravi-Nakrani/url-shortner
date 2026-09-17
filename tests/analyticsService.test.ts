import { describe, it, expect, vi, beforeEach } from "vitest";

const linkFindMock = vi.fn();
const clickStatsAggregateMock = vi.fn();
const referrerStatsAggregateMock = vi.fn();
const drainMetaFindByIdMock = vi.fn();

vi.mock("@/lib/db/models/Link", () => ({
  Link: {
    find: (...args: unknown[]) => linkFindMock(...args),
  },
}));

vi.mock("@/lib/db/models/ClickStats", () => ({
  ClickStats: {
    aggregate: (...args: unknown[]) => clickStatsAggregateMock(...args),
  },
}));

vi.mock("@/lib/db/models/ReferrerStats", () => ({
  ReferrerStats: {
    aggregate: (...args: unknown[]) => referrerStatsAggregateMock(...args),
  },
}));

vi.mock("@/lib/db/models/DrainMeta", () => ({
  DrainMeta: {
    findById: (...args: unknown[]) => drainMetaFindByIdMock(...args),
  },
  LAST_DRAIN_DOC_ID: "last_drain",
}));

const { getAnalyticsForUser } = await import("@/lib/services/analyticsService");

function selectMock(links: unknown[]) {
  return { select: vi.fn().mockResolvedValue(links) };
}

describe("getAnalyticsForUser", () => {
  beforeEach(() => {
    linkFindMock.mockReset();
    clickStatsAggregateMock.mockReset();
    referrerStatsAggregateMock.mockReset();
    drainMetaFindByIdMock.mockReset();
  });

  it("returns an empty-state summary when the user has no links", async () => {
    linkFindMock.mockReturnValue(selectMock([]));
    drainMetaFindByIdMock.mockResolvedValue({ lastDrainedAt: new Date("2024-06-01T12:00:00Z") });

    const result = await getAnalyticsForUser("user-1");

    expect(result.clicksOverTime).toHaveLength(30);
    expect(result.clicksOverTime.every((day) => day.clicks === 0)).toBe(true);
    expect(result.topReferrers).toEqual([]);
    expect(result.linkBreakdown).toEqual([]);
    expect(clickStatsAggregateMock).not.toHaveBeenCalled();
    expect(referrerStatsAggregateMock).not.toHaveBeenCalled();
    expect(result.lastDrainedAt).toBe("2024-06-01T12:00:00.000Z");
  });

  it("returns null lastDrainedAt when the drain has never run", async () => {
    linkFindMock.mockReturnValue(selectMock([]));
    drainMetaFindByIdMock.mockResolvedValue(null);

    const result = await getAnalyticsForUser("user-1");

    expect(result.lastDrainedAt).toBeNull();
  });

  it("scopes all aggregation queries to the user's own short codes", async () => {
    linkFindMock.mockReturnValue(
      selectMock([
        { shortCode: "aaa1111", longUrl: "https://a.com" },
        { shortCode: "bbb2222", longUrl: "https://b.com" },
      ]),
    );
    clickStatsAggregateMock.mockResolvedValue([]);
    referrerStatsAggregateMock.mockResolvedValue([]);
    drainMetaFindByIdMock.mockResolvedValue(null);

    await getAnalyticsForUser("user-1");

    expect(linkFindMock).toHaveBeenCalledWith({ userId: "user-1" });

    const clickCalls = clickStatsAggregateMock.mock.calls;
    expect(clickCalls[0][0][0].$match.shortCode).toEqual({ $in: ["aaa1111", "bbb2222"] });
    expect(clickCalls[1][0][0].$match.shortCode).toEqual({ $in: ["aaa1111", "bbb2222"] });

    const referrerMatch = referrerStatsAggregateMock.mock.calls[0][0][0].$match;
    expect(referrerMatch.shortCode).toEqual({ $in: ["aaa1111", "bbb2222"] });
  });

  it("zero-fills days with no click data and merges in days that have data", async () => {
    linkFindMock.mockReturnValue(selectMock([{ shortCode: "aaa1111", longUrl: "https://a.com" }]));
    const today = new Date().toISOString().slice(0, 10);
    clickStatsAggregateMock
      .mockResolvedValueOnce([{ _id: today, clicks: 7 }])
      .mockResolvedValueOnce([{ _id: "aaa1111", totalClicks: 7 }]);
    referrerStatsAggregateMock.mockResolvedValue([]);
    drainMetaFindByIdMock.mockResolvedValue(null);

    const result = await getAnalyticsForUser("user-1");

    expect(result.clicksOverTime).toHaveLength(30);
    const todayEntry = result.clicksOverTime.find((day) => day.date === today);
    expect(todayEntry?.clicks).toBe(7);
    const zeroDays = result.clicksOverTime.filter((day) => day.date !== today);
    expect(zeroDays.every((day) => day.clicks === 0)).toBe(true);
  });

  it("sorts the per-link breakdown by total clicks descending, including links with zero clicks", async () => {
    linkFindMock.mockReturnValue(
      selectMock([
        { shortCode: "low", longUrl: "https://low.com" },
        { shortCode: "high", longUrl: "https://high.com" },
        { shortCode: "none", longUrl: "https://none.com" },
      ]),
    );
    clickStatsAggregateMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { _id: "low", totalClicks: 2 },
      { _id: "high", totalClicks: 9 },
    ]);
    referrerStatsAggregateMock.mockResolvedValue([]);
    drainMetaFindByIdMock.mockResolvedValue(null);

    const result = await getAnalyticsForUser("user-1");

    expect(result.linkBreakdown.map((link) => link.shortCode)).toEqual(["high", "low", "none"]);
    expect(result.linkBreakdown.find((link) => link.shortCode === "none")?.totalClicks).toBe(0);
  });

  it("maps top referrer aggregation results to the expected shape", async () => {
    linkFindMock.mockReturnValue(selectMock([{ shortCode: "aaa1111", longUrl: "https://a.com" }]));
    clickStatsAggregateMock.mockResolvedValue([]);
    referrerStatsAggregateMock.mockResolvedValue([
      { _id: "google.com", clicks: 10 },
      { _id: "direct", clicks: 3 },
    ]);
    drainMetaFindByIdMock.mockResolvedValue(null);

    const result = await getAnalyticsForUser("user-1");

    expect(result.topReferrers).toEqual([
      { referrer: "google.com", clicks: 10 },
      { referrer: "direct", clicks: 3 },
    ]);
  });
});
