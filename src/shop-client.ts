/**
 * ShopClient — typed wrapper around the Sellub (Vendure) Shop GraphQL API.
 *
 * Talks to `${baseUrl}/shop-api`. Authenticates per request with:
 *   - `vendure-token: <channelToken>` to scope to a Sellub channel
 *   - `authorization: Bearer <authToken>` for active-order/session continuity
 *
 * The Vendure session token is captured from the `vendure-auth-token`
 * response header on every reply and re-attached on the next call. Callers
 * managing storage themselves can use `getAuthToken()` / `setAuthToken()`.
 *
 * GraphQL `errors[]` are thrown as `ShopApiError`. Vendure ErrorResult union
 * members (e.g. `OrderModificationError`) are returned as data — callers
 * switch on `__typename` to handle them.
 */

export interface ShopClientOptions {
  /** Base URL of the Sellub API. Defaults to https://api.sellub.com */
  baseUrl?: string;
  /** Channel token (Vendure channel.token) — required for multi-channel. */
  channelToken?: string;
  /** Initial Vendure auth token (resume an existing session). */
  authToken?: string;
  /** Optional fetch implementation. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Optional default headers (e.g. tracing). */
  defaultHeaders?: Record<string, string>;
}

export class ShopApiError extends Error {
  readonly errors: ReadonlyArray<{ message: string; extensions?: any }>;
  readonly status: number;
  constructor(
    message: string,
    errors: ReadonlyArray<{ message: string; extensions?: any }>,
    status: number
  ) {
    super(message);
    this.name = "ShopApiError";
    this.errors = errors;
    this.status = status;
  }
}

export interface OrderLineInput {
  productVariantId: string;
  quantity: number;
}

export interface AddressInput {
  fullName?: string;
  company?: string;
  streetLine1: string;
  streetLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  countryCode: string;
  phoneNumber?: string;
}

export interface PaymentInput {
  method: string;
  metadata?: Record<string, unknown>;
}

export interface ShopProductSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  featuredAsset?: { id: string; preview: string } | null;
}

export interface ShopProductDetail extends ShopProductSummary {
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    price: number;
    priceWithTax: number;
    currencyCode: string;
    stockLevel?: string;
  }>;
}

export interface ShopOrder {
  __typename?: string;
  id: string;
  code: string;
  state: string;
  active: boolean;
  total: number;
  totalWithTax: number;
  currencyCode: string;
  customer?: { id: string; emailAddress: string } | null;
  lines: Array<{
    id: string;
    quantity: number;
    linePriceWithTax: number;
    productVariant: { id: string; name: string; sku: string };
  }>;
  shippingAddress?: AddressInput | null;
  billingAddress?: AddressInput | null;
}

export interface ShippingMethodQuote {
  id: string;
  name: string;
  description?: string;
  price: number;
  priceWithTax: number;
}

export interface ShopClientApi {
  /** Raw GraphQL escape hatch. */
  query<T = any>(document: string, variables?: Record<string, any>): Promise<T>;

  /** Read the current Vendure auth token (refreshed after every call). */
  getAuthToken(): string | undefined;
  /** Set/replace the Vendure auth token (e.g. after rehydrating from storage). */
  setAuthToken(token: string | undefined): void;

  // Catalog
  getProducts(input?: {
    take?: number;
    skip?: number;
    term?: string;
  }): Promise<{ items: ShopProductSummary[]; totalItems: number }>;
  getProduct(input: { id?: string; slug?: string }): Promise<ShopProductDetail | null>;

  // Active order
  getActiveOrder(): Promise<ShopOrder | null>;
  addItemToOrder(input: OrderLineInput): Promise<ShopOrder>;
  adjustOrderLine(input: { orderLineId: string; quantity: number }): Promise<ShopOrder>;
  removeOrderLine(input: { orderLineId: string }): Promise<ShopOrder>;
  setCustomerForOrder(input: {
    emailAddress: string;
    firstName: string;
    lastName: string;
  }): Promise<ShopOrder>;
  setOrderShippingAddress(input: AddressInput): Promise<ShopOrder>;
  setOrderBillingAddress(input: AddressInput): Promise<ShopOrder>;

  // Checkout
  getEligibleShippingMethods(): Promise<ShippingMethodQuote[]>;
  setOrderShippingMethod(input: { shippingMethodId: string }): Promise<ShopOrder>;
  transitionOrderToState(input: { state: string }): Promise<ShopOrder>;
  addPaymentToOrder(input: PaymentInput): Promise<ShopOrder>;
  getOrderByCode(code: string): Promise<ShopOrder | null>;
}

const DEFAULT_BASE_URL = "https://api.sellub.com";

const ORDER_FRAGMENT = /* GraphQL */ `
  fragment OrderFields on Order {
    __typename
    id
    code
    state
    active
    total
    totalWithTax
    currencyCode
    customer {
      id
      emailAddress
    }
    lines {
      id
      quantity
      linePriceWithTax
      productVariant {
        id
        name
        sku
      }
    }
    shippingAddress {
      fullName
      company
      streetLine1
      streetLine2
      city
      province
      postalCode
      countryCode
      phoneNumber
    }
    billingAddress {
      fullName
      company
      streetLine1
      streetLine2
      city
      province
      postalCode
      countryCode
      phoneNumber
    }
  }
`;

export function createShopClient(options: ShopClientOptions = {}): ShopClientApi {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl =
    options.fetch ??
    (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  if (!fetchImpl) {
    throw new Error(
      "[sellub-client/shop] No fetch implementation found. Pass `options.fetch`."
    );
  }
  const doFetch: typeof fetch = fetchImpl;
  let authToken: string | undefined = options.authToken;

  async function rawQuery<T>(
    document: string,
    variables?: Record<string, any>
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.defaultHeaders ?? {}),
    };
    if (options.channelToken) headers["vendure-token"] = options.channelToken;
    if (authToken) headers["authorization"] = `Bearer ${authToken}`;

    const res = await doFetch(`${baseUrl}/shop-api`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: document, variables }),
    });

    // Vendure rotates the session token on each response.
    const refreshed =
      typeof res.headers?.get === "function"
        ? res.headers.get("vendure-auth-token")
        : undefined;
    if (refreshed) authToken = refreshed;

    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new ShopApiError(
        `shop-api returned non-JSON (HTTP ${res.status})`,
        [],
        res.status
      );
    }

    if (body?.errors?.length) {
      const first = body.errors[0]?.message ?? "GraphQL error";
      throw new ShopApiError(first, body.errors, res.status);
    }
    if (!res.ok) {
      throw new ShopApiError(
        `shop-api HTTP ${res.status}`,
        body?.errors ?? [],
        res.status
      );
    }
    return body.data as T;
  }

  return {
    query: rawQuery,
    getAuthToken: () => authToken,
    setAuthToken: (t) => {
      authToken = t;
    },

    async getProducts(input = {}) {
      const data = await rawQuery<{
        products: { items: ShopProductSummary[]; totalItems: number };
      }>(
        /* GraphQL */ `
          query GetProducts($options: ProductListOptions) {
            products(options: $options) {
              items {
                id
                name
                slug
                description
                featuredAsset {
                  id
                  preview
                }
              }
              totalItems
            }
          }
        `,
        {
          options: {
            take: input.take ?? 20,
            skip: input.skip ?? 0,
            ...(input.term
              ? {
                  filter: { name: { contains: input.term } },
                }
              : {}),
          },
        }
      );
      return data.products;
    },

    async getProduct(input) {
      const data = await rawQuery<{ product: ShopProductDetail | null }>(
        /* GraphQL */ `
          query GetProduct($id: ID, $slug: String) {
            product(id: $id, slug: $slug) {
              id
              name
              slug
              description
              featuredAsset {
                id
                preview
              }
              variants {
                id
                name
                sku
                price
                priceWithTax
                currencyCode
                stockLevel
              }
            }
          }
        `,
        { id: input.id ?? null, slug: input.slug ?? null }
      );
      return data.product;
    },

    async getActiveOrder() {
      const data = await rawQuery<{ activeOrder: ShopOrder | null }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          query GetActiveOrder {
            activeOrder {
              ...OrderFields
            }
          }
        `
      );
      return data.activeOrder;
    },

    async addItemToOrder(input) {
      const data = await rawQuery<{ addItemToOrder: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation AddItemToOrder($productVariantId: ID!, $quantity: Int!) {
            addItemToOrder(
              productVariantId: $productVariantId
              quantity: $quantity
            ) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        input
      );
      return data.addItemToOrder;
    },

    async adjustOrderLine(input) {
      const data = await rawQuery<{ adjustOrderLine: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation AdjustOrderLine($orderLineId: ID!, $quantity: Int!) {
            adjustOrderLine(orderLineId: $orderLineId, quantity: $quantity) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        input
      );
      return data.adjustOrderLine;
    },

    async removeOrderLine(input) {
      const data = await rawQuery<{ removeOrderLine: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation RemoveOrderLine($orderLineId: ID!) {
            removeOrderLine(orderLineId: $orderLineId) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        input
      );
      return data.removeOrderLine;
    },

    async setCustomerForOrder(input) {
      const data = await rawQuery<{ setCustomerForOrder: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation SetCustomerForOrder($input: CreateCustomerInput!) {
            setCustomerForOrder(input: $input) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        { input }
      );
      return data.setCustomerForOrder;
    },

    async setOrderShippingAddress(input) {
      const data = await rawQuery<{ setOrderShippingAddress: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation SetOrderShippingAddress($input: CreateAddressInput!) {
            setOrderShippingAddress(input: $input) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        { input }
      );
      return data.setOrderShippingAddress;
    },

    async setOrderBillingAddress(input) {
      const data = await rawQuery<{ setOrderBillingAddress: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation SetOrderBillingAddress($input: CreateAddressInput!) {
            setOrderBillingAddress(input: $input) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        { input }
      );
      return data.setOrderBillingAddress;
    },

    async getEligibleShippingMethods() {
      const data = await rawQuery<{
        eligibleShippingMethods: ShippingMethodQuote[];
      }>(
        /* GraphQL */ `
          query GetEligibleShippingMethods {
            eligibleShippingMethods {
              id
              name
              description
              price
              priceWithTax
            }
          }
        `
      );
      return data.eligibleShippingMethods;
    },

    async setOrderShippingMethod(input) {
      const data = await rawQuery<{ setOrderShippingMethod: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation SetOrderShippingMethod($shippingMethodId: [ID!]!) {
            setOrderShippingMethod(shippingMethodId: $shippingMethodId) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        { shippingMethodId: [input.shippingMethodId] }
      );
      return data.setOrderShippingMethod;
    },

    async transitionOrderToState(input) {
      const data = await rawQuery<{ transitionOrderToState: ShopOrder | null }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation TransitionOrderToState($state: String!) {
            transitionOrderToState(state: $state) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        input
      );
      if (!data.transitionOrderToState) {
        throw new ShopApiError("transitionOrderToState returned null", [], 200);
      }
      return data.transitionOrderToState;
    },

    async addPaymentToOrder(input) {
      const data = await rawQuery<{ addPaymentToOrder: ShopOrder }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          mutation AddPaymentToOrder($input: PaymentInput!) {
            addPaymentToOrder(input: $input) {
              ...OrderFields
              ... on ErrorResult {
                __typename
                errorCode
                message
              }
            }
          }
        `,
        { input: { method: input.method, metadata: input.metadata ?? {} } }
      );
      return data.addPaymentToOrder;
    },

    async getOrderByCode(code) {
      const data = await rawQuery<{ orderByCode: ShopOrder | null }>(
        /* GraphQL */ `
          ${ORDER_FRAGMENT}
          query GetOrderByCode($code: String!) {
            orderByCode(code: $code) {
              ...OrderFields
            }
          }
        `,
        { code }
      );
      return data.orderByCode;
    },
  };
}
