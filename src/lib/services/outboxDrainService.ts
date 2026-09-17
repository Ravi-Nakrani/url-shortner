import mongoose from "mongoose";
import { OutboxEvent } from "@/lib/db/models/OutboxEvent";
import { ClickStats } from "@/lib/db/models/ClickStats";
import { ReferrerStats } from "@/lib/db/models/ReferrerStats";

const DEFAULT_BATCH_SIZE = 200;

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

export async function drainOutbox(batchSize: number = DEFAULT_BATCH_SIZE): Promise<DrainResult> {
  const start = Date.now();

  const events = await OutboxEvent.find({ processed: false })
    .sort({ timestamp: 1 })
    .limit(batchSize);

  if (events.length === 0) {
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

  return {
    processedCount: events.length,
    groupsUpdated: clickGroups.size + referrerGroups.size,
    tookMs: Date.now() - start,
  };
}
