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
