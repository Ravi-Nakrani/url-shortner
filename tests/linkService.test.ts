import { describe, it, expect, vi, beforeEach } from "vitest";

const findOneMock = vi.fn();
const createMock = vi.fn();
const findMock = vi.fn();
const deleteOneMock = vi.fn();

vi.mock("@/lib/db/models/Link", () => ({
  Link: {
    findOne: (...args: unknown[]) => findOneMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    find: (...args: unknown[]) => findMock(...args),
    deleteOne: (...args: unknown[]) => deleteOneMock(...args),
  },
}));

vi.mock("@/lib/shortcode", () => ({
  generateShortCode: vi.fn(() => "ABCDEFG"),
}));

const {
  createLink,
  updateLink,
  deleteLink,
  listLinksForUser,
  ShortCodeExhaustedError,
  LinkNotFoundError,
  AliasTakenError,
} = await import("@/lib/services/linkService");

describe("createLink", () => {
  beforeEach(() => {
    findOneMock.mockReset();
    createMock.mockReset();
  });

  it("returns the existing link without creating a new one when longUrl already exists for this owner", async () => {
    const existing = {
      shortCode: "existing",
      longUrl: "https://example.com",
      createdAt: new Date("2024-01-01"),
    };
    findOneMock.mockResolvedValue(existing);

    const result = await createLink("https://example.com", null);

    expect(result.shortCode).toBe("existing");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("scopes the dedupe lookup by both longUrl and userId", async () => {
    findOneMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      shortCode: "ABCDEFG",
      longUrl: "https://example.com",
      createdAt: new Date("2024-01-01"),
    });

    await createLink("https://example.com", "user-123");

    expect(findOneMock).toHaveBeenCalledWith({
      longUrl: "https://example.com",
      userId: "user-123",
    });
  });

  it("creates a new link when no existing match is found for this owner", async () => {
    findOneMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      shortCode: "ABCDEFG",
      longUrl: "https://example.com",
      createdAt: new Date("2024-01-01"),
    });

    const result = await createLink("https://example.com", null);

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

    const result = await createLink("https://example.com", null);

    expect(result.shortCode).toBe("ABCDEFG");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("throws ShortCodeExhaustedError after exhausting all retry attempts", async () => {
    findOneMock.mockResolvedValue(null);
    const duplicateKeyError = Object.assign(new Error("duplicate"), { code: 11000 });
    createMock.mockRejectedValue(duplicateKeyError);

    await expect(createLink("https://example.com", null)).rejects.toBeInstanceOf(
      ShortCodeExhaustedError,
    );
    expect(createMock).toHaveBeenCalledTimes(5);
  });

  it("rethrows non-duplicate-key errors immediately without retrying", async () => {
    findOneMock.mockResolvedValue(null);
    createMock.mockRejectedValue(new Error("connection lost"));

    await expect(createLink("https://example.com", null)).rejects.toThrow("connection lost");
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe("listLinksForUser", () => {
  beforeEach(() => {
    findMock.mockReset();
  });

  it("returns the user's links sorted newest first", async () => {
    const links = [
      { shortCode: "aaa", longUrl: "https://a.com", createdAt: new Date(), expiresAt: null },
    ];
    const sortMock = vi.fn().mockResolvedValue(links);
    findMock.mockReturnValue({ sort: sortMock });

    const result = await listLinksForUser("user-123");

    expect(findMock).toHaveBeenCalledWith({ userId: "user-123" });
    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toEqual(links);
  });
});

describe("updateLink", () => {
  beforeEach(() => {
    findOneMock.mockReset();
  });

  it("throws LinkNotFoundError when no link is owned by this user", async () => {
    findOneMock.mockResolvedValue(null);

    await expect(updateLink("someCode", "user-123", { expiresAt: null })).rejects.toBeInstanceOf(
      LinkNotFoundError,
    );
  });

  it("applies the requested alias and expiry, then saves", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const doc = {
      shortCode: "oldCode",
      longUrl: "https://example.com",
      createdAt: new Date("2024-01-01"),
      expiresAt: null as Date | null,
      save: saveMock,
    };
    findOneMock.mockResolvedValue(doc);

    const futureDate = new Date("2030-01-01");
    const result = await updateLink("oldCode", "user-123", {
      shortCode: "newCode",
      expiresAt: futureDate,
    });

    expect(doc.shortCode).toBe("newCode");
    expect(doc.expiresAt).toBe(futureDate);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(result.shortCode).toBe("newCode");
  });

  it("throws AliasTakenError when saving hits a duplicate-key error", async () => {
    const duplicateKeyError = Object.assign(new Error("duplicate"), { code: 11000 });
    const doc = {
      shortCode: "oldCode",
      longUrl: "https://example.com",
      createdAt: new Date(),
      expiresAt: null,
      save: vi.fn().mockRejectedValue(duplicateKeyError),
    };
    findOneMock.mockResolvedValue(doc);

    await expect(updateLink("oldCode", "user-123", { shortCode: "taken" })).rejects.toBeInstanceOf(
      AliasTakenError,
    );
  });

  it("leaves fields unchanged when not present in the update", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const doc = {
      shortCode: "oldCode",
      longUrl: "https://example.com",
      createdAt: new Date(),
      expiresAt: null,
      save: saveMock,
    };
    findOneMock.mockResolvedValue(doc);

    await updateLink("oldCode", "user-123", {});

    expect(doc.shortCode).toBe("oldCode");
    expect(doc.expiresAt).toBeNull();
  });
});

describe("deleteLink", () => {
  beforeEach(() => {
    deleteOneMock.mockReset();
  });

  it("deletes the link scoped to the owner", async () => {
    deleteOneMock.mockResolvedValue({ deletedCount: 1 });

    await deleteLink("someCode", "user-123");

    expect(deleteOneMock).toHaveBeenCalledWith({ shortCode: "someCode", userId: "user-123" });
  });

  it("throws LinkNotFoundError when nothing was deleted", async () => {
    deleteOneMock.mockResolvedValue({ deletedCount: 0 });

    await expect(deleteLink("someCode", "user-123")).rejects.toBeInstanceOf(LinkNotFoundError);
  });
});
