import { Link, type ILink } from "@/lib/db/models/Link";
import { generateShortCode } from "@/lib/shortcode";

const MAX_CREATE_ATTEMPTS = 5;

export interface CreateLinkResult {
  shortCode: string;
  longUrl: string;
  createdAt: Date;
}

export class ShortCodeExhaustedError extends Error {
  constructor() {
    super(`Failed to generate a unique short code after ${MAX_CREATE_ATTEMPTS} attempts`);
    this.name = "ShortCodeExhaustedError";
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function createLink(longUrl: string): Promise<CreateLinkResult> {
  const existing = await Link.findOne({ longUrl });
  if (existing) {
    return {
      shortCode: existing.shortCode,
      longUrl: existing.longUrl,
      createdAt: existing.createdAt,
    };
  }

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const shortCode = generateShortCode();
    try {
      const link: ILink = await Link.create({ shortCode, longUrl });
      return { shortCode: link.shortCode, longUrl: link.longUrl, createdAt: link.createdAt };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new ShortCodeExhaustedError();
}

export async function findLinkByShortCode(shortCode: string): Promise<ILink | null> {
  const link = await Link.findOne({ shortCode });
  if (!link) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  return link;
}
