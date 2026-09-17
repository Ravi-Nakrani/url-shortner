import { Schema, model, models, type Model } from "mongoose";

export interface IRateLimit {
  key: string;
  count: number;
  expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: "rate_limits" },
);

// TTL index: MongoDB deletes a window's counter document once its window has
// ended, so the collection never accumulates history and needs no cleanup code.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit: Model<IRateLimit> =
  models.RateLimit ?? model<IRateLimit>("RateLimit", RateLimitSchema);
