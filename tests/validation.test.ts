import { describe, it, expect } from "vitest";
import { createLinkSchema, aliasSchema, updateLinkSchema } from "@/lib/validation/links";

describe("createLinkSchema", () => {
  it("accepts a valid https URL", () => {
    const result = createLinkSchema.safeParse({ longUrl: "https://example.com/path" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid http URL", () => {
    const result = createLinkSchema.safeParse({ longUrl: "http://example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed URL", () => {
    const result = createLinkSchema.safeParse({ longUrl: "not a url" });
    expect(result.success).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    const result = createLinkSchema.safeParse({ longUrl: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects a data: URL", () => {
    const result = createLinkSchema.safeParse({
      longUrl: "data:text/html,<script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a URL longer than 2048 characters", () => {
    const longUrl = "https://example.com/" + "a".repeat(2048);
    const result = createLinkSchema.safeParse({ longUrl });
    expect(result.success).toBe(false);
  });

  it("rejects a missing longUrl field", () => {
    const result = createLinkSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("aliasSchema", () => {
  it("accepts letters, numbers, hyphens, and underscores", () => {
    expect(aliasSchema.safeParse("my-cool_link42").success).toBe(true);
  });

  it("rejects an alias shorter than 3 characters", () => {
    expect(aliasSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects an alias longer than 30 characters", () => {
    expect(aliasSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects an alias with spaces or slashes", () => {
    expect(aliasSchema.safeParse("my cool/link").success).toBe(false);
  });
});

describe("updateLinkSchema", () => {
  it("accepts an update with only a new alias", () => {
    const result = updateLinkSchema.safeParse({ shortCode: "new-alias" });
    expect(result.success).toBe(true);
  });

  it("accepts an update clearing expiresAt with null", () => {
    const result = updateLinkSchema.safeParse({ expiresAt: null });
    expect(result.success).toBe(true);
  });

  it("accepts an update setting expiresAt to an ISO datetime string", () => {
    const result = updateLinkSchema.safeParse({ expiresAt: new Date().toISOString() });
    expect(result.success).toBe(true);
  });

  it("accepts an empty update object", () => {
    const result = updateLinkSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects an invalid alias in an update", () => {
    const result = updateLinkSchema.safeParse({ shortCode: "no spaces allowed" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO string for expiresAt", () => {
    const result = updateLinkSchema.safeParse({ expiresAt: "not-a-date" });
    expect(result.success).toBe(false);
  });
});
