import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const connectToDatabaseMock = vi.fn();
const updateLinkMock = vi.fn();
const deleteLinkMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/db/connect", () => ({
  connectToDatabase: (...args: unknown[]) => connectToDatabaseMock(...args),
}));

const actualLinkService = await vi.importActual<typeof import("@/lib/services/linkService")>(
  "@/lib/services/linkService",
);

vi.mock("@/lib/services/linkService", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/linkService")>(
    "@/lib/services/linkService",
  );
  return {
    ...actual,
    updateLink: (...args: unknown[]) => updateLinkMock(...args),
    deleteLink: (...args: unknown[]) => deleteLinkMock(...args),
  };
});

const { LinkNotFoundError, AliasTakenError } = actualLinkService;
const { PATCH, DELETE } = await import("@/app/api/links/[shortCode]/route");

function makeParams(shortCode: string) {
  return { params: Promise.resolve({ shortCode }) };
}

function makePatchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/links/abc123", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest() {
  return new NextRequest("http://localhost/api/links/abc123", { method: "DELETE" });
}

describe("PATCH /api/links/[shortCode]", () => {
  beforeEach(() => {
    authMock.mockReset();
    connectToDatabaseMock.mockReset().mockResolvedValue(undefined);
    updateLinkMock.mockReset();
  });

  it("returns 401 and never touches the database when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await PATCH(
      makePatchRequest({ shortCode: "new-alias" }),
      makeParams("abc123"),
    );

    expect(response.status).toBe(401);
    expect(updateLinkMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid alias without touching the database", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const response = await PATCH(
      makePatchRequest({ shortCode: "no spaces" }),
      makeParams("abc123"),
    );

    expect(response.status).toBe(400);
    expect(updateLinkMock).not.toHaveBeenCalled();
  });

  it("returns a plain 404, not 403, when the link belongs to a different owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    updateLinkMock.mockRejectedValue(new LinkNotFoundError());

    const response = await PATCH(
      makePatchRequest({ shortCode: "new-alias" }),
      makeParams("abc123"),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("scopes the update to the authenticated user's own id", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    updateLinkMock.mockResolvedValue({
      shortCode: "new-alias",
      longUrl: "https://example.com",
      createdAt: new Date(),
      expiresAt: null,
    });

    await PATCH(makePatchRequest({ shortCode: "new-alias" }), makeParams("abc123"));

    expect(updateLinkMock).toHaveBeenCalledWith("abc123", "user-1", expect.any(Object));
  });

  it("returns 409 when the requested alias is already taken", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    updateLinkMock.mockRejectedValue(new AliasTakenError());

    const response = await PATCH(makePatchRequest({ shortCode: "taken" }), makeParams("abc123"));

    expect(response.status).toBe(409);
  });
});

describe("DELETE /api/links/[shortCode]", () => {
  beforeEach(() => {
    authMock.mockReset();
    connectToDatabaseMock.mockReset().mockResolvedValue(undefined);
    deleteLinkMock.mockReset();
  });

  it("returns 401 and never touches the database when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await DELETE(makeDeleteRequest(), makeParams("abc123"));

    expect(response.status).toBe(401);
    expect(deleteLinkMock).not.toHaveBeenCalled();
  });

  it("returns a plain 404, not 403, when deleting a link owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    deleteLinkMock.mockRejectedValue(new LinkNotFoundError());

    const response = await DELETE(makeDeleteRequest(), makeParams("abc123"));

    expect(response.status).toBe(404);
  });

  it("scopes the delete to the authenticated user's own id and returns 204 on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    deleteLinkMock.mockResolvedValue(undefined);

    const response = await DELETE(makeDeleteRequest(), makeParams("abc123"));

    expect(response.status).toBe(204);
    expect(deleteLinkMock).toHaveBeenCalledWith("abc123", "user-1");
  });
});
