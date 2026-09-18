import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { OutboxEvent } from "@/lib/db/models/OutboxEvent";
import { ClickStats } from "@/lib/db/models/ClickStats";
import { ReferrerStats } from "@/lib/db/models/ReferrerStats";
import { DrainMeta, LAST_DRAIN_DOC_ID } from "@/lib/db/models/DrainMeta";
import { DrainLock, DRAIN_LOCK_ID } from "@/lib/db/models/DrainLock";

const DEFAULT_BATCH_SIZE = 200;

// Comfortably under the 5-minute drain schedule (see DECISIONS.md), so a lock
// left behind by a crashed invocation self-heals well before the next
// scheduled run — no manual cleanup is ever needed.
const LOCK_TTL_MS = 2 * 60 * 1000;

export interface DrainResult {
  processedCount: number;
  groupsUpdated: number;
  tookMs: number;
}

interface ClickGroup {
  shortCode: string;
  date: string;
  count: number;
}

interface ReferrerGroup {
  shortCode: string;
  date: string;
  referrer: string;
  count: number;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toReferrerHost(referrer: string | null): string {
  if (!referrer) return "direct";
  try {
    return new URL(referrer).hostname || "direct";
  } catch {
    return "direct";
  }
}

async function recordDrainTimestamp(processedCount: number): Promise<void> {
  try {
    await DrainMeta.findOneAndUpdate(
      { _id: LAST_DRAIN_DOC_ID },
      { $set: { lastDrainedAt: new Date(), processedCount } },
      { upsert: true },
    );
  } catch (error) {
    // The freshness timestamp is a display convenience for the analytics
    // dashboard, not a correctness-critical value — a failure here shouldn't
    // fail an otherwise-successful drain.
    console.error("[outbox] failed to record drain timestamp", error);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

// Thrown when a drain invocation discovers, at commit time, that its lease
// was reclaimed by a newer worker while it was still running (see
// renewLockOrThrow below). Caught in drainOutbox() and treated as a benign
// no-op, not a failure — the newer worker owns the batch now.
class LockLostError extends Error {
  constructor() {
    super("Drain lock was reclaimed by another worker before this drain committed");
    this.name = "LockLostError";
  }
}

// Acquires a short-lived mutex so two overlapping drain invocations (e.g. a
// scheduled run and a manual workflow_dispatch, or a slow request that a
// caller retries) can't both fetch and aggregate the same unprocessed batch —
// which would double-count those clicks in the rollups. Relies on the same
// duplicate-key-on-upsert trick used elsewhere in this codebase (see
// linkService's alias handling): the filter only matches an expired or
// nonexistent lock, so a live lock causes the upsert to collide with the
// existing `_id` and throw 11000 instead of silently overwriting it.
//
// Returns a fencing token unique to this invocation (or null if another
// worker already holds the lock). Every later operation against the lock —
// the in-transaction renewal and the final release — is conditioned on this
// token still being the one stored on the lock document, so a worker that
// stalls past its own lease expiry can never release or renew a lock a
// newer worker has since acquired.
async function acquireDrainLock(): Promise<string | null> {
  const now = new Date();
  const owner = randomUUID();
  try {
    await DrainLock.findOneAndUpdate(
      { _id: DRAIN_LOCK_ID, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_TTL_MS), owner } },
      { upsert: true },
    );
    return owner;
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

// Renews the lease as part of the same transaction that commits the batch's
// rollups, so "this batch's writes landed" and "we still held the lock when
// they did" are guaranteed atomically together — not just checked
// separately beforehand, which would leave a window between the check and
// the writes. If a newer worker has already taken the lock (owner no longer
// matches), this matches zero documents and the whole transaction is
// aborted before any rollup counts are touched.
async function renewLockOrThrow(owner: string, session: mongoose.ClientSession): Promise<void> {
  const result = await DrainLock.updateOne(
    { _id: DRAIN_LOCK_ID, owner },
    { $set: { lockedUntil: new Date(Date.now() + LOCK_TTL_MS) } },
    { session },
  );
  if (result.matchedCount === 0) {
    throw new LockLostError();
  }
}

async function releaseDrainLock(owner: string): Promise<void> {
  try {
    // Only clears the lock if we're still the recorded owner. A stalled
    // worker whose lease already expired — and whose lock was already
    // reacquired by a newer worker — must not be able to blow away that
    // newer worker's still-active lock out from under it.
    const result = await DrainLock.updateOne(
      { _id: DRAIN_LOCK_ID, owner },
      { $set: { lockedUntil: new Date(0) } },
    );
    if (result.matchedCount === 0) {
      console.warn("[outbox] skipped releasing drain lock: no longer the owner");
    }
  } catch (error) {
    // The TTL bounds how long a missed release can matter, so this isn't fatal.
    console.error("[outbox] failed to release drain lock", error);
  }
}

async function runDrain(batchSize: number, start: number, owner: string): Promise<DrainResult> {
  const events = await OutboxEvent.find({ processed: false })
    .sort({ timestamp: 1 })
    .limit(batchSize);

  if (events.length === 0) {
    await recordDrainTimestamp(0);
    return { processedCount: 0, groupsUpdated: 0, tookMs: Date.now() - start };
  }

  const clickGroups = new Map<string, ClickGroup>();
  const referrerGroups = new Map<string, ReferrerGroup>();

  for (const event of events) {
    const date = toDateKey(event.timestamp);

    const clickKey = `${event.shortCode}|${date}`;
    const clickGroup = clickGroups.get(clickKey);
    if (clickGroup) {
      clickGroup.count += 1;
    } else {
      clickGroups.set(clickKey, { shortCode: event.shortCode, date, count: 1 });
    }

    const referrer = toReferrerHost(event.referrer);
    const referrerKey = `${event.shortCode}|${date}|${referrer}`;
    const referrerGroup = referrerGroups.get(referrerKey);
    if (referrerGroup) {
      referrerGroup.count += 1;
    } else {
      referrerGroups.set(referrerKey, { shortCode: event.shortCode, date, referrer, count: 1 });
    }
  }

  const eventIds = events.map((event) => event._id);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Renewed first and inside the same transaction as the rollup writes:
      // if a newer worker has taken over since this one's lease expired,
      // this throws and the transaction (including the $inc writes below)
      // is rolled back entirely — a stale worker can complete this far and
      // still not double-count anything.
      await renewLockOrThrow(owner, session);

      if (clickGroups.size > 0) {
        await ClickStats.bulkWrite(
          Array.from(clickGroups.values()).map(({ shortCode, date, count }) => ({
            updateOne: {
              filter: { shortCode, date },
              update: { $inc: { clicks: count } },
              upsert: true,
            },
          })),
          { session },
        );
      }

      if (referrerGroups.size > 0) {
        await ReferrerStats.bulkWrite(
          Array.from(referrerGroups.values()).map(({ shortCode, date, referrer, count }) => ({
            updateOne: {
              filter: { shortCode, date, referrer },
              update: { $inc: { count } },
              upsert: true,
            },
          })),
          { session },
        );
      }

      await OutboxEvent.updateMany(
        { _id: { $in: eventIds } },
        { $set: { processed: true } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await recordDrainTimestamp(events.length);

  return {
    processedCount: events.length,
    groupsUpdated: clickGroups.size + referrerGroups.size,
    tookMs: Date.now() - start,
  };
}

export async function drainOutbox(batchSize: number = DEFAULT_BATCH_SIZE): Promise<DrainResult> {
  const start = Date.now();

  const owner = await acquireDrainLock();
  if (!owner) {
    console.log("[outbox] drain already in progress elsewhere, skipping this invocation");
    return { processedCount: 0, groupsUpdated: 0, tookMs: Date.now() - start };
  }

  try {
    return await runDrain(batchSize, start, owner);
  } catch (error) {
    if (error instanceof LockLostError) {
      // Not a failure: a newer worker legitimately took over while this one
      // was still running. Its own drain owns this batch now.
      console.warn("[outbox] " + error.message);
      return { processedCount: 0, groupsUpdated: 0, tookMs: Date.now() - start };
    }
    throw error;
  } finally {
    await releaseDrainLock(owner);
  }
}
