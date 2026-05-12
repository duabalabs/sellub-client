import { describe, it, expect, vi } from "vitest";
import { createShopClient } from "../index";

describe("ShopClient.getCatalog (A1 alias)", () => {
  it("delegates to getProducts and returns the same shape", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        data: {
          products: {
            totalItems: 1,
            items: [
              { id: "p1", name: "Mug", slug: "mug", description: null, featuredAsset: null },
            ],
          },
        },
      }),
    } as unknown as Response));
    const shop = createShopClient({
      baseUrl: "https://api.test",
      channelToken: "ct",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    const out = await shop.getCatalog({ take: 5 });
    expect(out.totalItems).toBe(1);
    expect(out.items[0].slug).toBe("mug");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
