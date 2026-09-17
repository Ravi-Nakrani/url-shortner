import { Schema, model, models, type Model } from "mongoose";

export interface IOutboxEvent {
  type: "click";
  shortCode: string;
  timestamp: Date;
  referrer: string | null;
  userAgent: string | null;
  processed: boolean;
}

const OutboxEventSchema = new Schema<IOutboxEvent>(
  {
    type: { type: String, required: true, default: "click" },
    shortCode: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    referrer: { type: String, default: null },
    userAgent: { type: String, default: null },
    processed: { type: Boolean, required: true, default: false },
  },
  { collection: "outbox_events" },
);

// Backs Phase 3's bounded-batch drain query: find unprocessed events oldest-first.
OutboxEventSchema.index({ processed: 1, timestamp: 1 });

export const OutboxEvent: Model<IOutboxEvent> =
  models.OutboxEvent ?? model<IOutboxEvent>("OutboxEvent", OutboxEventSchema);
