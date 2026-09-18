import { describe, it, expect, vi } from "vitest";
import { generateShortCode } from "@/lib/shortcode";

describe("generateShortCode", () => {
  it("returns a string of the default length (7)", () => {
    expect(generateShortCode()).toHaveLength(7);
  });

  it("respects a custom length", () => {
    expect(generateShortCode(10)).toHaveLength(10);
  });

  it("only contains base62 characters", () => {
    const code = generateShortCode(50);
    expect(code).toMatch(/^[0-9A-Za-z]+$/);
  });

  it("produces different codes across calls (probabilistically)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateShortCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it("does not derive randomness from Math.random", () => {
    // Math.random() is not a CSPRNG; short codes should come from
    // crypto.randomInt instead so they aren't predictable from prior output.
    const spy = vi.spyOn(Math, "random");
    generateShortCode();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
