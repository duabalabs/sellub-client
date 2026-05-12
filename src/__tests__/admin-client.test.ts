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

describe("AdminClient — orders", () => {
  it("listOrders sends OrderListOptions with sort + filter", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            orders: {
              totalItems: 1,
              items: [
                {
                  id: "1",
                  code: "ORD-1",
                  state: "PaymentSettled",
                  active: false,
                  total: 1000,
                  totalWithTax: 1100,
                  currencyCode: "GHS",
                  orderPlacedAt: "2025-01-01T00:00:00Z",
                  customer: { id: "c1", emailAddress: "a@b.co" },
                },
              ],
            },
          },
        },
      },
    ]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    const out = await admin.listOrders({ term: "ORD", state: "PaymentSettled", take: 10 });
    expect(out.totalItems).toBe(1);
    const body = JSON.parse((f.calls[0].init.body as string) ?? "{}");
    expect(body.variables.options.take).toBe(10);
    expect(body.variables.options.skip).toBe(0);
    expect(body.variables.options.sort).toEqual({ orderPlacedAt: "DESC" });
    expect(body.variables.options.filter).toEqual({
      code: { contains: "ORD" },
      state: { eq: "PaymentSettled" },
    });
  });

  it("listOrders omits filter when no term/state given", async () => {
    const f = makeFetch([
      { body: { data: { orders: { totalItems: 0, items: [] } } } },
    ]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    await admin.listOrders();
    const body = JSON.parse((f.calls[0].init.body as string) ?? "{}");
    expect(body.variables.options.filter).toBeUndefined();
    expect(body.variables.options.take).toBe(25);
  });

  it("getOrder by id returns the order", async () => {
    const detail = {
      id: "1",
      code: "ORD-1",
      state: "PaymentSettled",
      active: false,
      total: 1000,
      totalWithTax: 1100,
      currencyCode: "GHS",
      orderPlacedAt: null,
      customer: null,
      shipping: 0,
      shippingWithTax: 0,
      subTotal: 1000,
      subTotalWithTax: 1100,
      lines: [],
      payments: [],
    };
    const f = makeFetch([{ body: { data: { order: detail } } }]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    const order = await admin.getOrder({ id: "1" });
    expect(order?.code).toBe("ORD-1");
    const body = JSON.parse((f.calls[0].init.body as string) ?? "{}");
    expect(body.variables).toEqual({ id: "1" });
    expect(body.query).toMatch(/order\(id: \$id\)/);
  });

  it("getOrder by code uses orderByCode", async () => {
    const f = makeFetch([{ body: { data: { orderByCode: null } } }]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    const order = await admin.getOrder({ code: "ORD-99" });
    expect(order).toBeNull();
    const body = JSON.parse((f.calls[0].init.body as string) ?? "{}");
    expect(body.query).toMatch(/orderByCode\(code: \$code\)/);
    expect(body.variables).toEqual({ code: "ORD-99" });
  });

  it("getOrder throws when neither id nor code given", async () => {
    const admin = createAdminClient({
      adminToken: "tok",
      fetch: (() => {}) as unknown as typeof fetch,
    });
    await expect(admin.getOrder({})).rejects.toThrow(/id.*code/);
  });

  it("cancelOrder unwraps Order union member", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            cancelOrder: {
              __typename: "Order",
              id: "1",
              code: "ORD-1",
              state: "Cancelled",
              active: false,
              total: 1000,
              totalWithTax: 1100,
              currencyCode: "GHS",
              orderPlacedAt: null,
              customer: null,
              shipping: 0,
              shippingWithTax: 0,
              subTotal: 1000,
              subTotalWithTax: 1100,
              lines: [],
              payments: [],
            },
          },
        },
      },
    ]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    const order = await admin.cancelOrder({ orderId: "1", reason: "test" });
    expect(order.state).toBe("Cancelled");
    expect((order as unknown as { __typename?: string }).__typename).toBeUndefined();
  });

  it("cancelOrder throws AdminApiError on ErrorResult union member", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            cancelOrder: {
              __typename: "CancelActiveOrderError",
              errorCode: "CANCEL_ACTIVE_ORDER_ERROR",
              message: "cannot cancel active order",
            },
          },
        },
      },
    ]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    await expect(admin.cancelOrder({ orderId: "1" })).rejects.toBeInstanceOf(AdminApiError);
  });

  it("refundOrder unwraps Refund union member", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            refundOrder: {
              __typename: "Refund",
              id: "r1",
              state: "Settled",
              total: 500,
              reason: "duplicate",
              transactionId: "txn_1",
            },
          },
        },
      },
    ]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    const refund = await admin.refundOrder({
      paymentId: "p1",
      lines: [{ orderLineId: "l1", quantity: 1 }],
      reason: "duplicate",
    });
    expect(refund.id).toBe("r1");
    expect(refund.state).toBe("Settled");
    const body = JSON.parse((f.calls[0].init.body as string) ?? "{}");
    expect(body.variables.input.paymentId).toBe("p1");
    expect(body.variables.input.lines).toEqual([{ orderLineId: "l1", quantity: 1 }]);
    expect(body.variables.input.adjustment).toBe(0);
    expect(body.variables.input.shipping).toBe(0);
  });

  it("refundOrder throws AdminApiError on ErrorResult", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            refundOrder: {
              __typename: "AlreadyRefundedError",
              errorCode: "ALREADY_REFUNDED_ERROR",
              message: "already refunded",
            },
          },
        },
      },
    ]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    await expect(
      admin.refundOrder({ paymentId: "p1" }),
    ).rejects.toBeInstanceOf(AdminApiError);
  });

  it("listSubscriptions queries sellubSubscriptions with filters", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            sellubSubscriptions: {
              totalItems: 1,
              items: [
                {
                  id: "s1",
                  appId: "app_1",
                  customerEmail: "a@b.co",
                  tier: "pro",
                  active: true,
                  expiresAt: "2026-01-01T00:00:00Z",
                  orderId: "o1",
                },
              ],
            },
          },
        },
      },
    ]);
    const admin = createAdminClient({ adminToken: "tok", fetch: f.fetch });
    const out = await admin.listSubscriptions({ tier: "pro", activeOnly: true, take: 50 });
    expect(out.items[0].tier).toBe("pro");
    const body = JSON.parse((f.calls[0].init.body as string) ?? "{}");
    expect(body.variables).toEqual({ take: 50, skip: 0, tier: "pro", activeOnly: true });
    expect(body.query).toMatch(/sellubSubscriptions/);
  });
});
