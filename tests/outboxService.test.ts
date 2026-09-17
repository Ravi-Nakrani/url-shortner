import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("@/lib/db/models/OutboxEvent", () => ({
  OutboxEvent: {
    create: (...args: unknown[]) => createMock(...args),
  },
}));

const { recordClickEvent } = await import("@/lib/services/outboxService");

describe("recordClickEvent", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue(undefined);
  });

  it("writes a click event with the given shortCode, referrer, and userAgent", async () => {
    await recordClickEvent("abc1234", {
      referrer: "https://google.com",
      userAgent: "Mozilla/5.0",
    });

    expect(createMock).toHaveBeenCalledWith({
      shortCode: "abc1234",
      referrer: "https://google.com",
      userAgent: "Mozilla/5.0",
    });
  });

  it("passes through null referrer and userAgent when absent", async () => {
    await recordClickEvent("abc1234", { referrer: null, userAgent: null });

    expect(createMock).toHaveBeenCalledWith({
      shortCode: "abc1234",
      referrer: null,
      userAgent: null,
    });
  });

  it("propagates errors from the underlying insert so the caller can decide how to handle them", async () => {
    createMock.mockRejectedValue(new Error("connection lost"));

    await expect(recordClickEvent("abc1234", { referrer: null, userAgent: null })).rejects.toThrow(
      "connection lost",
    );
  });
});
