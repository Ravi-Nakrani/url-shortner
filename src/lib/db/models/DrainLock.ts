import { Schema, model, models, type Model } from "mongoose";

export interface IDrainLock {
  _id: string;
  lockedUntil: Date;
  owner: string;
}

const DrainLockSchema = new Schema<IDrainLock>(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
    // A fencing token unique to the invocation that currently holds the
    // lock — lets a stale worker's release/renew calls be rejected once a
    // newer worker has taken over, instead of blindly trusting the lease
    // timer alone. See outboxDrainService.ts.
    owner: { type: String, required: true },
  },
  { collection: "drain_lock" },
);

// A singleton mutex document: only one drain invocation may hold the lock at a
// time, preventing two overlapping invocations from double-counting the same
// batch of outbox events. See outboxDrainService.ts.
export const DrainLock: Model<IDrainLock> =
  models.DrainLock ?? model<IDrainLock>("DrainLock", DrainLockSchema);

export const DRAIN_LOCK_ID = "drain_lock";
