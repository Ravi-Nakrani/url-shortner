import { describe, it, expect, vi, beforeEach } from "vitest";

const findMock = vi.fn();
const updateManyMock = vi.fn();
const clickStatsBulkWriteMock = vi.fn();
const referrerStatsBulkWriteMock = vi.fn();
const startSessionMock = vi.fn();
const withTransactionMock = vi.fn();
const endSessionMock = vi.fn();

vi.mock("mongoose", () => ({
  default: {
    startSession: (...args: unknown[]) => startSessionMock(...args),
  },
}));

vi.mock("@/lib/db/models/OutboxEvent", () => ({
  OutboxEvent: {
    find: (...args: unknown[]) => findMock(...args),
    updateMany: (...args: unknown[]) => updateManyMock(...args),
  },
}));

vi.mock("@/lib/db/models/ClickStats", () => ({
  ClickStats: {
    bulkWrite: (...args: unknown[]) => clickStatsBulkWriteMock(...args),
  },
}));

vi.mock("@/lib/db/models/ReferrerStats", () => ({
  ReferrerStats: {
    bulkWrite: (...args: unknown[]) => referrerStatsBulkWriteMock(...args),
  },
}));

const drainMetaFindOneAndUpdateMock = vi.fn();

vi.mock("@/lib/db/models/DrainMeta", () => ({
  DrainMeta: {
    findOneAndUpdate: (...args: unknown[]) => drainMetaFindOneAndUpdateMock(...args),
  },
  LAST_DRAIN_DOC_ID: "last_drain",
}));

const drainLockFindOneAndUpdateMock = vi.fn();
const drainLockUpdateOneMock = vi.fn();

vi.mock("@/lib/db/models/DrainLock", () => ({
  DrainLock: {
    findOneAndUpdate: (...args: unknown[]) => drainLockFindOneAndUpdateMock(...args),
    updateOne: (...args: unknown[]) => drainLockUpdateOneMock(...args),
  },
  DRAIN_LOCK_ID: "drain_lock",
}));

const { drainOutbox } = await import("@/lib/services/outboxDrainService");

function makeChainableFind(events: unknown[]) {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(events),
  };
  return chain;
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: overrides._id ?? `id-${Math.random()}`,
    shortCode: "abc1234",
    timestamp: new Date("2024-06-01T10:00:00.000Z"),
    referrer: null,
    userAgent: "test-agent",
    processed: false,
    ...overrides,
  };
}

describe("drainOutbox", () => {
  beforeEach(() => {
    findMock.mockReset();
    updateManyMock.mockReset().mockResolvedValue({});
    clickStatsBulkWriteMock.mockReset().mockResolvedValue({});
    referrerStatsBulkWriteMock.mockReset().mockResolvedValue({});
    startSessionMock.mockReset();
    withTransactionMock.mockReset();
    endSessionMock.mockReset().mockResolvedValue(undefined);
    drainMetaFindOneAndUpdateMock.mockReset().mockResolvedValue({});
    drainLockFindOneAndUpdateMock.mockReset().mockResolvedValue({});
    drainLockUpdateOneMock.mockReset().mockResolvedValue({});

    withTransactionMock.mockImplementation(async (fn: () => Promise<void>) => {
      await fn();
    });
    startSessionMock.mockResolvedValue({
      withTransaction: withTransactionMock,
      endSession: endSessionMock,
    });
  });

  it("is a fast no-op when there are no unprocessed events", async () => {
    findMock.mockReturnValue(makeChainableFind([]));

    const result = await drainOutbox(200);

    expect(result).toEqual({ processedCount: 0, groupsUpdated: 0, tookMs: expect.any(Number) });
    expect(startSessionMock).not.toHaveBeenCalled();
    expect(clickStatsBulkWriteMock).not.toHaveBeenCalled();
    expect(referrerStatsBulkWriteMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("still records a drain timestamp on an empty-backlog no-op", async () => {
    findMock.mockReturnValue(makeChainableFind([]));

    await drainOutbox(200);

    expect(drainMetaFindOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: "last_drain" },
      { $set: { lastDrainedAt: expect.any(Date), processedCount: 0 } },
      { upsert: true },
    );
  });

  it("records a drain timestamp with the processed count after a real batch", async () => {
    findMock.mockReturnValue(makeChainableFind([makeEvent(), makeEvent()]));

    await drainOutbox(200);

    expect(drainMetaFindOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: "last_drain" },
      { $set: { lastDrainedAt: expect.any(Date), processedCount: 2 } },
      { upsert: true },
    );
  });

  it("respects the batch size passed to find().limit()", async () => {
    const chain = makeChainableFind([]);
    findMock.mockReturnValue(chain);

    await drainOutbox(50);

    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  it("groups events by shortCode+date for click counts and by +referrer for referrer counts", async () => {
    const events = [
      makeEvent({ shortCode: "aaa1111", referrer: "https://www.google.com/search" }),
      makeEvent({ shortCode: "aaa1111", referrer: "https://www.google.com/other" }),
      makeEvent({ shortCode: "aaa1111", referrer: null }),
      makeEvent({ shortCode: "bbb2222", referrer: "https://twitter.com/x" }),
    ];
    findMock.mockReturnValue(makeChainableFind(events));

    const result = await drainOutbox(200);

    expect(clickStatsBulkWriteMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          updateOne: {
            filter: { shortCode: "aaa1111", date: "2024-06-01" },
            update: { $inc: { clicks: 3 } },
            upsert: true,
          },
        },
        {
          updateOne: {
            filter: { shortCode: "bbb2222", date: "2024-06-01" },
            update: { $inc: { clicks: 1 } },
            upsert: true,
          },
        },
      ]),
      { session: expect.anything() },
    );

    expect(referrerStatsBulkWriteMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          updateOne: {
            filter: { shortCode: "aaa1111", date: "2024-06-01", referrer: "www.google.com" },
            update: { $inc: { count: 2 } },
            upsert: true,
          },
        },
        {
          updateOne: {
            filter: { shortCode: "aaa1111", date: "2024-06-01", referrer: "direct" },
            update: { $inc: { count: 1 } },
            upsert: true,
          },
        },
        {
          updateOne: {
            filter: { shortCode: "bbb2222", date: "2024-06-01", referrer: "twitter.com" },
            update: { $inc: { count: 1 } },
            upsert: true,
          },
        },
      ]),
      { session: expect.anything() },
    );

    expect(result.processedCount).toBe(4);
    expect(result.groupsUpdated).toBe(2 + 3);
  });

  it("marks all fetched events as processed within the same transaction", async () => {
    const events = [makeEvent({ _id: "id-1" }), makeEvent({ _id: "id-2" })];
    findMock.mockReturnValue(makeChainableFind(events));

    await drainOutbox(200);

    expect(updateManyMock).toHaveBeenCalledWith(
      { _id: { $in: ["id-1", "id-2"] } },
      { $set: { processed: true } },
      { session: expect.anything() },
    );
    expect(withTransactionMock).toHaveBeenCalledTimes(1);
    expect(endSessionMock).toHaveBeenCalledTimes(1);
  });

  it("treats an unparsable referrer as direct", async () => {
    const events = [makeEvent({ referrer: "not-a-valid-url" })];
    findMock.mockReturnValue(makeChainableFind(events));

    await drainOutbox(200);

    expect(referrerStatsBulkWriteMock).toHaveBeenCalledWith(
      [
        {
          updateOne: {
            filter: { shortCode: "abc1234", date: "2024-06-01", referrer: "direct" },
            update: { $inc: { count: 1 } },
            upsert: true,
          },
        },
      ],
      { session: expect.anything() },
    );
  });

  it("ends the session even if the transaction throws", async () => {
    findMock.mockReturnValue(makeChainableFind([makeEvent()]));
    withTransactionMock.mockRejectedValue(new Error("transaction failed"));

    await expect(drainOutbox(200)).rejects.toThrow("transaction failed");
    expect(endSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not fetch or aggregate events when another invocation already holds the lock", async () => {
    drainLockFindOneAndUpdateMock.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: 11000 }),
    );

    const result = await drainOutbox(200);

    expect(result).toEqual({ processedCount: 0, groupsUpdated: 0, tookMs: expect.any(Number) });
    expect(findMock).not.toHaveBeenCalled();
    // Never acquired, so there's nothing of ours to release.
    expect(drainLockUpdateOneMock).not.toHaveBeenCalled();
  });

  it("releases the lock after a successful drain", async () => {
    findMock.mockReturnValue(makeChainableFind([makeEvent()]));

    await drainOutbox(200);

    expect(drainLockFindOneAndUpdateMock).toHaveBeenCalledTimes(1);
    expect(drainLockUpdateOneMock).toHaveBeenCalledWith(
      { _id: "drain_lock" },
      { $set: { lockedUntil: expect.any(Date) } },
    );
  });

  it("releases the lock even when the transaction throws, so a retry can succeed", async () => {
    findMock.mockReturnValue(makeChainableFind([makeEvent()]));
    withTransactionMock.mockRejectedValueOnce(new Error("transaction failed"));

    await expect(drainOutbox(200)).rejects.toThrow("transaction failed");
    expect(drainLockUpdateOneMock).toHaveBeenCalledTimes(1);

    // The failed attempt made zero writes (the transaction never committed),
    // so the same batch is still unprocessed and safe to reprocess exactly
    // once on this retry — no double-counting.
    withTransactionMock.mockImplementationOnce(async (fn: () => Promise<void>) => {
      await fn();
    });
    const result = await drainOutbox(200);

    expect(result.processedCount).toBe(1);
    expect(clickStatsBulkWriteMock).toHaveBeenCalledTimes(1);
  });
});
