import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createShopClient,
  ShopApiError,
  createSellubClient,
} from "../index";

function makeFetch(responses: Array<any>) {
  let i = 0;
  const calls: any[] = [];
  const fn = vi.fn(async (url: any, init: any) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    const headersMap = new Map<string, string>(
      Object.entries(r.headers ?? {})
    );
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: { get: (k: string) => headersMap.get(k.toLowerCase()) ?? null },
      json: async () => r.body,
    } as any;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe("ShopClient", () => {
  let shop: ReturnType<typeof createShopClient>;
  let calls: any[];
  let fetchImpl: typeof fetch;

  beforeEach(() => {
    const f = makeFetch([
      {
        body: { data: { activeOrder: null } },
        headers: { "vendure-auth-token": "tok-1" },
      },
      {
        body: {
          data: {
            addItemToOrder: {
              __typename: "Order",
              id: "o1",
              code: "C1",
              state: "AddingItems",
              active: true,
              total: 5000,
              totalWithTax: 5500,
              currencyCode: "GHS",
              customer: null,
              lines: [],
              shippingAddress: null,
              billingAddress: null,
            },
          },
        },
        headers: { "vendure-auth-token": "tok-2" },
      },
    ]);
    fetchImpl = f.fetch;
    calls = f.calls;
    shop = createShopClient({
      baseUrl: "https://api.sellub.test",
      channelToken: "ch-tok",
      fetch: fetchImpl,
    });
  });

  it("sends a POST to /shop-api with the channel token header", async () => {
    await shop.getActiveOrder();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.sellub.test/shop-api");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers["vendure-token"]).toBe("ch-tok");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
  });

  it("captures vendure-auth-token from the response and re-sends it", async () => {
    await shop.getActiveOrder();
    expect(shop.getAuthToken()).toBe("tok-1");

    await shop.addItemToOrder({ productVariantId: "v1", quantity: 2 });
    expect(calls[1].init.headers["authorization"]).toBe("Bearer tok-1");
    expect(shop.getAuthToken()).toBe("tok-2");
  });

  it("returns parsed data on success", async () => {
    await shop.getActiveOrder();
    const order = await shop.addItemToOrder({
      productVariantId: "v1",
      quantity: 2,
    });
    expect(order.id).toBe("o1");
    expect(order.state).toBe("AddingItems");
    expect(order.totalWithTax).toBe(5500);
  });

  it("throws ShopApiError when the response contains GraphQL errors", async () => {
    const f = makeFetch([
      {
        body: {
          errors: [{ message: "no active order", extensions: { code: "X" } }],
        },
      },
    ]);
    const s = createShopClient({
      baseUrl: "https://api.sellub.test",
      fetch: f.fetch,
    });
    await expect(s.getActiveOrder()).rejects.toBeInstanceOf(ShopApiError);
  });

  it("setAuthToken is honored on the next request", async () => {
    shop.setAuthToken("manual-tok");
    await shop.getActiveOrder();
    expect(calls[0].init.headers["authorization"]).toBe("Bearer manual-tok");
  });

  it("getProducts forwards take/skip/term as ProductListOptions", async () => {
    const f = makeFetch([
      { body: { data: { products: { items: [], totalItems: 0 } } } },
    ]);
    const s = createShopClient({ fetch: f.fetch });
    await s.getProducts({ take: 5, skip: 10, term: "shoes" });
    const body = JSON.parse(f.calls[0].init.body);
    expect(body.variables.options.take).toBe(5);
    expect(body.variables.options.skip).toBe(10);
    expect(body.variables.options.filter.name.contains).toBe("shoes");
  });

  it("setOrderShippingMethod wraps the id in an array (Vendure expects [ID!])", async () => {
    const f = makeFetch([
      {
        body: {
          data: {
            setOrderShippingMethod: {
              __typename: "Order",
              id: "o1",
              code: "C1",
              state: "ArrangingPayment",
              active: true,
              total: 0,
              totalWithTax: 0,
              currencyCode: "GHS",
              customer: null,
              lines: [],
              shippingAddress: null,
              billingAddress: null,
            },
          },
        },
      },
    ]);
    const s = createShopClient({ fetch: f.fetch });
    await s.setOrderShippingMethod({ shippingMethodId: "ship-1" });
    const body = JSON.parse(f.calls[0].init.body);
    expect(body.variables.shippingMethodId).toEqual(["ship-1"]);
  });
});

describe("createSellubClient.shop integration", () => {
  it("exposes shop with the channel token wired through", async () => {
    const f = makeFetch([
      { body: { data: { activeOrder: null } } },
    ]);
    const client = createSellubClient({
      baseUrl: "https://api.sellub.test",
      channelToken: "ch-xyz",
      fetch: f.fetch,
    });
    expect(client.shop).toBeDefined();
    await client.shop.getActiveOrder();
    expect(f.calls[0].init.headers["vendure-token"]).toBe("ch-xyz");
  });
});
