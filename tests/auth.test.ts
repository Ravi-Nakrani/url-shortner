import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));

const { jwtCallback, sessionCallback } = await import("@/auth");

type JwtParams = Parameters<typeof jwtCallback>[0];
type SessionParams = Parameters<typeof sessionCallback>[0];

describe("jwtCallback", () => {
  it("stores the provider account id as userId on first sign-in", async () => {
    const token: Record<string, unknown> = {};
    const params = { token, account: { providerAccountId: "gh-12345" } } as unknown as JwtParams;

    const result = (await jwtCallback(params)) as Record<string, unknown> | null;

    expect(result?.userId).toBe("gh-12345");
  });

  it("leaves an existing userId untouched on subsequent calls without an account", async () => {
    const token: Record<string, unknown> = { userId: "gh-12345" };
    const params = { token, account: null } as unknown as JwtParams;

    const result = (await jwtCallback(params)) as Record<string, unknown> | null;

    expect(result?.userId).toBe("gh-12345");
  });
});

describe("sessionCallback", () => {
  it("copies the token's userId onto session.user.id", async () => {
    const session = { user: { name: "Test User" } };
    const token = { userId: "gh-12345" };
    const params = { session, token } as unknown as SessionParams;

    const result = (await sessionCallback(params)) as { user?: { id?: string } };

    expect(result.user?.id).toBe("gh-12345");
  });

  it("does nothing when the session has no user", async () => {
    const session = { user: undefined };
    const token = { userId: "gh-12345" };
    const params = { session, token } as unknown as SessionParams;

    const result = (await sessionCallback(params)) as { user?: unknown };

    expect(result.user).toBeUndefined();
  });
});
