import { Schema, model, models, type Model } from "mongoose";

export interface IReferrerStats {
  shortCode: string;
  date: string;
  referrer: string;
  count: number;
}

const ReferrerStatsSchema = new Schema<IReferrerStats>(
  {
    shortCode: { type: String, required: true },
    date: { type: String, required: true },
    referrer: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  { collection: "referrer_stats" },
);

ReferrerStatsSchema.index({ shortCode: 1, date: 1, referrer: 1 }, { unique: true });

export const ReferrerStats: Model<IReferrerStats> =
  models.ReferrerStats ?? model<IReferrerStats>("ReferrerStats", ReferrerStatsSchema);
