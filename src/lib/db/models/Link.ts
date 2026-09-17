import { Schema, model, models, type Model } from "mongoose";

export interface ILink {
  shortCode: string;
  longUrl: string;
  createdAt: Date;
  userId: string | null;
  expiresAt: Date | null;
}

const LinkSchema = new Schema<ILink>({
  shortCode: { type: String, required: true, unique: true },
  longUrl: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  userId: { type: String, default: null },
  expiresAt: { type: Date, default: null },
});

// `models.Link` may already exist on hot-reloaded / warm serverless modules;
// re-registering the same schema throws, so reuse the existing model if present.
export const Link: Model<ILink> = models.Link ?? model<ILink>("Link", LinkSchema);
