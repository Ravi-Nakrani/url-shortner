import { z } from "zod";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export const createLinkSchema = z.object({
  longUrl: z
    .string()
    .url({ message: "Please enter a valid URL, including https://" })
    .max(2048, { message: "URL is too long" })
    .refine(
      (value) => {
        try {
          return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
        } catch {
          return false;
        }
      },
      { message: "Only http:// and https:// URLs are supported" },
    ),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const aliasSchema = z
  .string()
  .min(3, { message: "Alias must be at least 3 characters" })
  .max(30, { message: "Alias must be at most 30 characters" })
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Alias can only contain letters, numbers, hyphens, and underscores",
  });

export const updateLinkSchema = z.object({
  shortCode: aliasSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
