import { Schema, model, models, type Model } from "mongoose";

export interface IDrainMeta {
  _id: string;
  lastDrainedAt: Date;
  processedCount: number;
}

const DrainMetaSchema = new Schema<IDrainMeta>(
  {
    _id: { type: String, required: true },
    lastDrainedAt: { type: Date, required: true },
    processedCount: { type: Number, required: true, default: 0 },
  },
  { collection: "drain_meta" },
);

export const DrainMeta: Model<IDrainMeta> =
  models.DrainMeta ?? model<IDrainMeta>("DrainMeta", DrainMetaSchema);

export const LAST_DRAIN_DOC_ID = "last_drain";
