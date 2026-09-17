import { Link, type ILink } from "@/lib/db/models/Link";
import { generateShortCode } from "@/lib/shortcode";

const MAX_CREATE_ATTEMPTS = 5;

export interface CreateLinkResult {
  shortCode: string;
  longUrl: string;
  createdAt: Date;
}

export interface LinkSummary {
  shortCode: string;
  longUrl: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface UpdateLinkInput {
  shortCode?: string;
  expiresAt?: Date | null;
}

export class ShortCodeExhaustedError extends Error {
  constructor() {
    super(`Failed to generate a unique short code after ${MAX_CREATE_ATTEMPTS} attempts`);
    this.name = "ShortCodeExhaustedError";
  }
}

export class LinkNotFoundError extends Error {
  constructor() {
    super("Link not found");
    this.name = "LinkNotFoundError";
  }
}

export class AliasTakenError extends Error {
  constructor() {
    super("This alias is already taken");
    this.name = "AliasTakenError";
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function toSummary(link: ILink): LinkSummary {
  return {
    shortCode: link.shortCode,
    longUrl: link.longUrl,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
  };
}

export async function createLink(
  longUrl: string,
  userId: string | null,
): Promise<CreateLinkResult> {
  const existing = await Link.findOne({ longUrl, userId });
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
      const link: ILink = await Link.create({ shortCode, longUrl, userId });
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

export async function listLinksForUser(userId: string): Promise<LinkSummary[]> {
  const links = await Link.find({ userId }).sort({ createdAt: -1 });
  return links.map(toSummary);
}

export async function updateLink(
  currentShortCode: string,
  userId: string,
  updates: UpdateLinkInput,
): Promise<LinkSummary> {
  const link = await Link.findOne({ shortCode: currentShortCode, userId });
  if (!link) {
    throw new LinkNotFoundError();
  }

  if (updates.shortCode !== undefined) {
    link.shortCode = updates.shortCode;
  }
  if (updates.expiresAt !== undefined) {
    link.expiresAt = updates.expiresAt;
  }

  try {
    await link.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AliasTakenError();
    }
    throw error;
  }

  return toSummary(link);
}

export async function deleteLink(shortCode: string, userId: string): Promise<void> {
  const result = await Link.deleteOne({ shortCode, userId });
  if (result.deletedCount === 0) {
    throw new LinkNotFoundError();
  }
}
