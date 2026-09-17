import { describe, it, expect } from "vitest";
import { createLinkSchema } from "@/lib/validation/links";

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
