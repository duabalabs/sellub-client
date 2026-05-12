/**
 * AdminClient — typed wrapper around the Sellub (Vendure) Admin GraphQL API.
 *
 * Talks to `${baseUrl}/admin-api`. Authenticates per request with:
 *   - `Authorization: Bearer <adminToken>` (Vendure session token, or
 *     a long-lived API key issued via `sellub-api-keys`)
 *
 * **Server-only.** This client requires a privileged admin token; never
 * embed it in browser bundles. `createSellubAdminClient` throws at
 * construction time when it detects a browser-like environment unless
 * the caller explicitly opts in via `allowBrowser: true`.
 *
 * v0.5 surface:
 *   - `listChannels()` — list Vendure channels visible to the token.
 *
 * Future surfaces (per A1):
 *   - `listOrders`, `getOrder`, `cancelOrder`, `refundOrder`,
 *     `listSubscriptions`.
 */

export interface AdminClientOptions {
  /** Base URL of the Sellub server. Defaults to https://api.sellub.com */
  baseUrl?: string;
  /** Bearer token for the Admin API. Required. */
  adminToken: string;
  /** Optional fetch implementation. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Optional default headers (e.g. tracing). */
  defaultHeaders?: Record<string, string>;
  /**
   * Opt-in to constructing the client in a browser-like environment.
   * Off by default — admin tokens belong on the server.
   */
  allowBrowser?: boolean;
}

export class AdminApiError extends Error {
  readonly errors: ReadonlyArray<{ message: string; extensions?: unknown }>;
  readonly status: number;
  constructor(
    message: string,
    errors: ReadonlyArray<{ message: string; extensions?: unknown }>,
    status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
    this.errors = errors;
    this.status = status;
  }
}

export interface AdminChannel {
  id: string;
  token: string;
  code: string;
  defaultCurrencyCode?: string;
  defaultLanguageCode?: string;
}

export interface AdminOrderSummary {
  id: string;
  code: string;
  state: string;
  active: boolean;
  total: number;
  totalWithTax: number;
  currencyCode: string;
  orderPlacedAt?: string | null;
  customer?: { id: string; emailAddress: string } | null;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  shipping: number;
  shippingWithTax: number;
  subTotal: number;
  subTotalWithTax: number;
  lines: Array<{
    id: string;
    quantity: number;
    linePriceWithTax: number;
    productVariant: { id: string; name: string; sku: string };
  }>;
  payments?: Array<{
    id: string;
    method: string;
    amount: number;
    state: string;
    transactionId?: string | null;
    errorMessage?: string | null;
  }> | null;
}

export interface AdminOrderListInput {
  take?: number;
  skip?: number;
  /** Free-text term — matched against `code` (contains, case-insensitive). */
  term?: string;
  /** Optional state filter (exact match). */
  state?: string;
}

export interface AdminRefundInput {
  paymentId: string;
  /** Refund amount in minor units. Refunds the full payment if omitted. */
  amount?: number;
  reason?: string;
  /** Lines to associate with the refund (Vendure requires at least one). */
  lines?: Array<{ orderLineId: string; quantity: number }>;
  /** Adjustments / shipping refund in minor units. */
  adjustment?: number;
  shipping?: number;
}

export interface AdminRefundResult {
  id: string;
  state: string;
  total: number;
  reason?: string | null;
  transactionId?: string | null;
}

/**
 * Vendure-backed subscription as exposed by the
 * `sellub-subscriptions` plugin (`dpsEAllSubscriptions` admin query).
 * `customerId` and `planId` are loose references — the plugin keeps
 * subscriptions decoupled from the Vendure customer/order graph.
 */
export interface AdminSubscriptionSummary {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  startDate: string;
  nextBillingDate: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  plan?: {
    id: string;
    name: string;
    interval: string;
    intervalCount: number;
    price: number;
    currency: string;
  } | null;
}

export interface AdminClientApi {
  /** Raw GraphQL escape hatch. */
  query<T = unknown>(document: string, variables?: Record<string, unknown>): Promise<T>;

  /** List Vendure channels visible to the configured admin token. */
  listChannels(): Promise<{ items: AdminChannel[]; totalItems: number }>;

  /** List orders, newest first. Use `term` for code search and `state` for filtering. */
  listOrders(input?: AdminOrderListInput): Promise<{ items: AdminOrderSummary[]; totalItems: number }>;

  /** Fetch a single order by id or code. Returns `null` when not found. */
  getOrder(input: { id?: string; code?: string }): Promise<AdminOrderDetail | null>;

  /**
   * Cancel an order (or specific lines). For full cancellation, leave `lines`
   * unset. Returns the updated `AdminOrderDetail`. Throws `AdminApiError`
   * when Vendure returns an `ErrorResult` discriminated union member.
   */
  cancelOrder(input: {
    orderId: string;
    reason?: string;
    lines?: Array<{ orderLineId: string; quantity: number }>;
  }): Promise<AdminOrderDetail>;

  /**
   * Refund a payment against an order. `lines` must reference the order
   * lines being refunded (Vendure validates this server-side).
   */
  refundOrder(input: AdminRefundInput): Promise<AdminRefundResult>;

  /**
   * List subscriptions across all customers (admin view). Backed by the
   * `dpsEAllSubscriptions` Vendure Admin GraphQL query exposed by the
   * `sellub-subscriptions` server plugin.
   *
   * Filter by `status` (`ACTIVE`, `PAUSED`, `CANCELLED`, `EXPIRED`).
   */
  listSubscriptions(input?: {
    take?: number;
    skip?: number;
    status?: string;
  }): Promise<{ items: AdminSubscriptionSummary[]; totalItems: number }>;
}

const DEFAULT_BASE_URL = "https://api.sellub.com";

function looksLikeBrowser(): boolean {
  return typeof window !== "undefined" && typeof (window as { document?: unknown }).document !== "undefined";
}

export function createAdminClient(options: AdminClientOptions): AdminClientApi {
  if (!options.adminToken) {
    throw new Error("[sellub-client/admin] `adminToken` is required.");
  }
  if (!options.allowBrowser && looksLikeBrowser()) {
    throw new Error(
      "[sellub-client/admin] Refusing to construct an Admin client in a browser " +
        "environment — admin tokens must stay server-side. Pass `allowBrowser: true` " +
        "if you really know what you are doing.",
    );
  }

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl =
    options.fetch ??
    (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  if (!fetchImpl) {
    throw new Error("[sellub-client/admin] No fetch implementation found. Pass `options.fetch`.");
  }
  const doFetch: typeof fetch = fetchImpl;

  async function rawQuery<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${options.adminToken}`,
      ...(options.defaultHeaders ?? {}),
    };

    const res = await doFetch(`${baseUrl}/admin-api`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: document, variables: variables ?? {} }),
    });

    let body: { data?: T; errors?: { message: string; extensions?: unknown }[] };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new AdminApiError(`admin-api returned non-JSON (HTTP ${res.status})`, [], res.status);
    }

    if (body.errors?.length) {
      throw new AdminApiError(body.errors[0].message, body.errors, res.status);
    }
    if (!res.ok) {
      throw new AdminApiError(`admin-api HTTP ${res.status}`, body.errors ?? [], res.status);
    }
    if (body.data === undefined) {
      throw new AdminApiError("admin-api returned no data", [], res.status);
    }
    return body.data;
  }

  const ORDER_SUMMARY_FRAGMENT = /* GraphQL */ `
    fragment OrderSummaryFields on Order {
      id
      code
      state
      active
      total
      totalWithTax
      currencyCode
      orderPlacedAt
      customer {
        id
        emailAddress
      }
    }
  `;

  const ORDER_DETAIL_FRAGMENT = /* GraphQL */ `
    fragment OrderDetailFields on Order {
      ...OrderSummaryFields
      shipping
      shippingWithTax
      subTotal
      subTotalWithTax
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
      payments {
        id
        method
        amount
        state
        transactionId
        errorMessage
      }
    }
    ${ORDER_SUMMARY_FRAGMENT}
  `;

  return {
    query: rawQuery,

    async listChannels() {
      const data = await rawQuery<{
        channels: { items: AdminChannel[]; totalItems: number };
      }>(/* GraphQL */ `
        query SellubAdminChannels {
          channels {
            totalItems
            items {
              id
              token
              code
              defaultCurrencyCode
              defaultLanguageCode
            }
          }
        }
      `);
      return data.channels;
    },

    async listOrders(input) {
      const filter: Record<string, unknown> = {};
      if (input?.term) {
        filter.code = { contains: input.term };
      }
      if (input?.state) {
        filter.state = { eq: input.state };
      }

      const options: Record<string, unknown> = {
        take: input?.take ?? 25,
        skip: input?.skip ?? 0,
        sort: { orderPlacedAt: "DESC" },
      };
      if (Object.keys(filter).length > 0) {
        options.filter = filter;
      }

      const data = await rawQuery<{
        orders: { items: AdminOrderSummary[]; totalItems: number };
      }>(
        /* GraphQL */ `
          query SellubAdminOrders($options: OrderListOptions) {
            orders(options: $options) {
              totalItems
              items {
                ...OrderSummaryFields
              }
            }
          }
          ${ORDER_SUMMARY_FRAGMENT}
        `,
        { options },
      );
      return data.orders;
    },

    async getOrder(input) {
      if (!input.id && !input.code) {
        throw new Error("[sellub-client/admin] getOrder: pass `id` or `code`.");
      }
      if (input.id) {
        const data = await rawQuery<{ order: AdminOrderDetail | null }>(
          /* GraphQL */ `
            query SellubAdminOrderById($id: ID!) {
              order(id: $id) {
                ...OrderDetailFields
              }
            }
            ${ORDER_DETAIL_FRAGMENT}
          `,
          { id: input.id },
        );
        return data.order;
      }
      const data = await rawQuery<{ orderByCode: AdminOrderDetail | null }>(
        /* GraphQL */ `
          query SellubAdminOrderByCode($code: String!) {
            orderByCode(code: $code) {
              ...OrderDetailFields
            }
          }
          ${ORDER_DETAIL_FRAGMENT}
        `,
        { code: input.code },
      );
      return data.orderByCode;
    },

    async cancelOrder(input) {
      const data = await rawQuery<{
        cancelOrder:
          | ({ __typename: "Order" } & AdminOrderDetail)
          | { __typename: string; errorCode: string; message: string };
      }>(
        /* GraphQL */ `
          mutation SellubAdminCancelOrder($input: CancelOrderInput!) {
            cancelOrder(input: $input) {
              __typename
              ... on Order {
                ...OrderDetailFields
              }
              ... on ErrorResult {
                errorCode
                message
              }
            }
          }
          ${ORDER_DETAIL_FRAGMENT}
        `,
        {
          input: {
            orderId: input.orderId,
            reason: input.reason,
            lines: input.lines,
          },
        },
      );
      const result = data.cancelOrder;
      if (result.__typename !== "Order") {
        const err = result as { errorCode: string; message: string };
        throw new AdminApiError(
          `cancelOrder failed: ${err.errorCode} — ${err.message}`,
          [{ message: err.message, extensions: { code: err.errorCode } }],
          200,
        );
      }
      // Strip __typename before returning.
      const { __typename: _t, ...rest } = result;
      return rest as AdminOrderDetail;
    },

    async refundOrder(input) {
      const data = await rawQuery<{
        refundOrder:
          | ({ __typename: "Refund" } & AdminRefundResult)
          | { __typename: string; errorCode: string; message: string };
      }>(
        /* GraphQL */ `
          mutation SellubAdminRefundOrder($input: RefundOrderInput!) {
            refundOrder(input: $input) {
              __typename
              ... on Refund {
                id
                state
                total
                reason
                transactionId
              }
              ... on ErrorResult {
                errorCode
                message
              }
            }
          }
        `,
        {
          input: {
            paymentId: input.paymentId,
            amount: input.amount,
            reason: input.reason,
            lines: input.lines ?? [],
            adjustment: input.adjustment ?? 0,
            shipping: input.shipping ?? 0,
          },
        },
      );
      const result = data.refundOrder;
      if (result.__typename !== "Refund") {
        const err = result as { errorCode: string; message: string };
        throw new AdminApiError(
          `refundOrder failed: ${err.errorCode} — ${err.message}`,
          [{ message: err.message, extensions: { code: err.errorCode } }],
          200,
        );
      }
      const { __typename: _t, ...rest } = result;
      return rest as AdminRefundResult;
    },

    async listSubscriptions(input) {
      const options: Record<string, unknown> = {
        take: input?.take ?? 25,
        skip: input?.skip ?? 0,
      };
      if (input?.status) {
        options.status = input.status;
      }
      const data = await rawQuery<{
        dpsEAllSubscriptions: {
          totalItems: number;
          items: AdminSubscriptionSummary[];
        };
      }>(
        /* GraphQL */ `
          query SellubAdminAllSubscriptions($options: DpsESubscriptionListOptions) {
            dpsEAllSubscriptions(options: $options) {
              totalItems
              items {
                id
                customerId
                planId
                status
                startDate
                nextBillingDate
                pausedAt
                cancelledAt
                plan {
                  id
                  name
                  interval
                  intervalCount
                  price
                  currency
                }
              }
            }
          }
        `,
        { options },
      );
      return data.dpsEAllSubscriptions;
    },
  };
}
