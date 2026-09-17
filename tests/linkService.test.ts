import { describe, it, expect, vi, beforeEach } from "vitest";

const findOneMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/lib/db/models/Link", () => ({
  Link: {
    findOne: (...args: unknown[]) => findOneMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

vi.mock("@/lib/shortcode", () => ({
  generateShortCode: vi.fn(() => "ABCDEFG"),
}));

const { createLink, ShortCodeExhaustedError } = await import("@/lib/services/linkService");

describe("createLink", () => {
  beforeEach(() => {
    findOneMock.mockReset();
    createMock.mockReset();
  });

  it("returns the existing link without creating a new one when longUrl already exists", async () => {
    const existing = {
      shortCode: "existing",
      longUrl: "https://example.com",
      createdAt: new Date("2024-01-01"),
    };
    findOneMock.mockResolvedValue(existing);

    const result = await createLink("https://example.com");

    expect(result.shortCode).toBe("existing");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates a new link when no existing match is found", async () => {
    findOneMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      shortCode: "ABCDEFG",
      longUrl: "https://example.com",
      createdAt: new Date("2024-01-01"),
    });

    const result = await createLink("https://example.com");

    expect(result.shortCode).toBe("ABCDEFG");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries on a duplicate-key error and succeeds on the next attempt", async () => {
    findOneMock.mockResolvedValue(null);
    const duplicateKeyError = Object.assign(new Error("duplicate"), { code: 11000 });
    createMock.mockRejectedValueOnce(duplicateKeyError).mockResolvedValueOnce({
      shortCode: "ABCDEFG",
      longUrl: "https://example.com",
      createdAt: new Date("2024-01-01"),
    });

    const result = await createLink("https://example.com");

    expect(result.shortCode).toBe("ABCDEFG");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("throws ShortCodeExhaustedError after exhausting all retry attempts", async () => {
    findOneMock.mockResolvedValue(null);
    const duplicateKeyError = Object.assign(new Error("duplicate"), { code: 11000 });
    createMock.mockRejectedValue(duplicateKeyError);

    await expect(createLink("https://example.com")).rejects.toBeInstanceOf(ShortCodeExhaustedError);
    expect(createMock).toHaveBeenCalledTimes(5);
  });

  it("rethrows non-duplicate-key errors immediately without retrying", async () => {
    findOneMock.mockResolvedValue(null);
    createMock.mockRejectedValue(new Error("connection lost"));

    await expect(createLink("https://example.com")).rejects.toThrow("connection lost");
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
