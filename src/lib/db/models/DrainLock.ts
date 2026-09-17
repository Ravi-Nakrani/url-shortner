import { Schema, model, models, type Model } from "mongoose";

export interface IDrainLock {
  _id: string;
  lockedUntil: Date;
}

const DrainLockSchema = new Schema<IDrainLock>(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
  },
  { collection: "drain_lock" },
);

// A singleton mutex document: only one drain invocation may hold the lock at a
// time, preventing two overlapping invocations from double-counting the same
// batch of outbox events. See outboxDrainService.ts.
export const DrainLock: Model<IDrainLock> =
  models.DrainLock ?? model<IDrainLock>("DrainLock", DrainLockSchema);

export const DRAIN_LOCK_ID = "drain_lock";
