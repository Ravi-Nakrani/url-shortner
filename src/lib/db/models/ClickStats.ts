import { Schema, model, models, type Model } from "mongoose";

export interface IClickStats {
  shortCode: string;
  date: string;
  clicks: number;
}

const ClickStatsSchema = new Schema<IClickStats>(
  {
    shortCode: { type: String, required: true },
    date: { type: String, required: true },
    clicks: { type: Number, required: true, default: 0 },
  },
  { collection: "click_stats" },
);

ClickStatsSchema.index({ shortCode: 1, date: 1 }, { unique: true });

export const ClickStats: Model<IClickStats> =
  models.ClickStats ?? model<IClickStats>("ClickStats", ClickStatsSchema);
