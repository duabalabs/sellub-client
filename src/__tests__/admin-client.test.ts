import { describe, it, expect, vi } from "vitest";
import { createAdminClient, AdminApiError, createSellubClient } from "../index";

function makeFetch(responses: Array<{ ok?: boolean; status?: number; body: unknown }>) {
  let i = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: { get: () => null },
      json: async () => r.body,
    } as unknown as Response;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe("AdminClient", () => {
  it("posts to /admin-api with bearer auth and returns channels", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            channels: {
              totalItems: 2,
              items: [
                { id: "1", token: "t1", code: "default", defaultCurrencyCode: "GHS", defaultLanguageCode: "en" },
                { id: "2", token: "t2", code: "duabanti", defaultCurrencyCode: "GHS", defaultLanguageCode: "en" },
              ],
            },
          },
        },
      },
    ]);
    const admin = createAdminClient({
      baseUrl: "https://api.test",
      adminToken: "tok",
      fetch: f.fetch,
    });
    const channels = await admin.listChannels();
    expect(channels.totalItems).toBe(2);
    expect(channels.items[1].code).toBe("duabanti");
    expect(f.calls[0].url).toBe("https://api.test/admin-api");
    const headers = f.calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws AdminApiError on graphql error", async () => {
    const f = makeFetch([{ body: { errors: [{ message: "no auth" }] } }]);
    const admin = createAdminClient({ adminToken: "x", fetch: f.fetch });
    await expect(admin.listChannels()).rejects.toBeInstanceOf(AdminApiError);
  });

  it("throws AdminApiError on http error", async () => {
    const f = makeFetch([{ ok: false, status: 500, body: {} }]);
    const admin = createAdminClient({ adminToken: "x", fetch: f.fetch });
    await expect(admin.listChannels()).rejects.toThrow(/HTTP 500/);
  });

  it("requires an adminToken", () => {
    expect(() => createAdminClient({ adminToken: "" })).toThrow(/adminToken/);
  });

  it("refuses to construct in a browser-like environment", () => {
    const win = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { document: {} };
    try {
      expect(() =>
        createAdminClient({ adminToken: "x", fetch: (() => {}) as unknown as typeof fetch }),
      ).toThrow(/browser/);
    } finally {
      (globalThis as { window?: unknown }).window = win;
    }
  });

  it("allows browser construction with explicit opt-in", () => {
    const win = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { document: {} };
    try {
      const admin = createAdminClient({
        adminToken: "x",
        allowBrowser: true,
        fetch: (() => {}) as unknown as typeof fetch,
      });
      expect(typeof admin.listChannels).toBe("function");
    } finally {
      (globalThis as { window?: unknown }).window = win;
    }
  });
});

describe("createSellubClient — admin wiring", () => {
  it("does not expose .admin when no adminToken given", () => {
    const client = createSellubClient({ fetch: (() => {}) as unknown as typeof fetch });
    expect(client.admin).toBeUndefined();
  });

  it("exposes .admin when an adminToken is supplied", () => {
    const client = createSellubClient({
      adminToken: "tok",
      fetch: (() => {}) as unknown as typeof fetch,
    });
    expect(client.admin).toBeDefined();
    expect(typeof client.admin?.listChannels).toBe("function");
  });
});
