/**
 * @duabalabs/sellub-client — typed client for the Sellub commerce platform.
 *
 * v0.4 surface:
 *   • ExternalPayments — initialize + verify one-off payments
 *     (e.g. donation modals, simple checkout buttons).
 *   • Subscriptions    — start / fetch / cancel recurring subscriptions
 *     routed to a Sellub seller's Paystack subaccount
 *     (e.g. SaaS subs from DuabaConnect).
 *   • Invoices         — create + fetch hosted Paystack payment requests
 *     on behalf of a Sellub seller (e.g. billing flows from DuabaTrade).
 *   • ShopClient       — Vendure Shop GraphQL API: catalog, cart,
 *     checkout, orders. Created with `createShopClient(...)` or via
 *     `createSellubClient({ channelToken }).shop`.
 *
 * Future surfaces:
 *   • AdminClient  — Vendure Admin API (provisioning, fulfillment, reports)
 *   • EmbedTokens  — short-lived session tokens for the embed iframe
 *   • Webhooks     — HMAC verifier for inbound Sellub webhooks
 *     (use `@duabalabs/sellub-webhooks` today).
 */

export {
  createShopClient,
  ShopApiError,
  type ShopClientOptions,
  type ShopClientApi,
  type OrderLineInput,
  type AddressInput,
  type PaymentInput,
  type ShopProductSummary,
  type ShopProductDetail,
  type ShopOrder,
  type ShippingMethodQuote,
} from "./shop-client";
import { createShopClient, type ShopClientApi } from "./shop-client";

export {
  createAdminClient,
  AdminApiError,
  type AdminClientOptions,
  type AdminClientApi,
  type AdminChannel,
  type AdminOrderSummary,
  type AdminOrderDetail,
  type AdminOrderListInput,
  type AdminRefundInput,
  type AdminRefundResult,
  type AdminSubscriptionSummary,
} from "./admin-client";
import { createAdminClient, type AdminClientApi } from "./admin-client";

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror sellub-server/src/plugins/sellub-external-payments/src/types.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface ExternalPaymentInitializeRequest {
  /** The Sellub channel slug identifying the recipient account (e.g. "duabanti"). */
  channelSlug: string;
  /** Payer's email address (required by Paystack). */
  email: string;
  /** Amount in minor currency units (pesewas for GHS). e.g. 5000 = GHS 50.00. */
  amount: number;
  /** Payer/donor display name. */
  customerName?: string;
  /** Human-readable description for the payment. */
  description?: string;
  /** URL to redirect the payer after a successful payment. */
  callbackUrl?: string;
  /** Arbitrary metadata to attach to the transaction. */
  metadata?: Record<string, unknown>;
}

export interface ExternalPaymentInitializeResponse {
  success: boolean;
  /** Paystack hosted payment page URL — redirect the payer here. */
  authorizationUrl?: string;
  /** Unique transaction reference for verification. */
  reference?: string;
  /** Paystack access code (for inline/popup integration). */
  accessCode?: string;
  /** Error message if initialization failed. */
  error?: string;
}

export type ExternalPaymentStatus =
  | "success"
  | "failed"
  | "abandoned"
  | "pending"
  | "unknown";

export interface ExternalPaymentVerifyResponse {
  success: boolean;
  status: ExternalPaymentStatus;
  reference: string;
  amount: number;
  currency: string;
  paidAt?: string;
  channel?: string;
  customerEmail?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionInterval =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "biannually"
  | "annually";

export interface SubscriptionStartRequest {
  /** Sellub channel slug identifying the recipient account. */
  channelSlug: string;
  /** Subscriber's email address. */
  email: string;
  /** Subscriber display name. */
  customerName?: string;
  /** Existing Paystack plan code (mutually exclusive with `plan`). */
  planCode?: string;
  /** Inline plan definition (mutually exclusive with `planCode`). */
  plan?: {
    /** Stable name — used to dedupe plan creation. */
    name: string;
    /** Amount in minor units (pesewas for GHS). */
    amount: number;
    interval: SubscriptionInterval;
    currency?: string;
    description?: string;
  };
  /** URL to redirect the subscriber after the first successful charge. */
  callbackUrl?: string;
  /** Arbitrary metadata to attach to the first transaction. */
  metadata?: Record<string, unknown>;
}

export interface SubscriptionStartResponse {
  success: boolean;
  /** Paystack hosted page — redirect the subscriber here to authorize. */
  authorizationUrl?: string;
  /** Reference for the first/initial transaction. */
  reference?: string;
  accessCode?: string;
  /** Plan code used for this subscription. */
  planCode?: string;
  error?: string;
}

export type SubscriptionStatus =
  | "active"
  | "non-renewing"
  | "attention"
  | "completed"
  | "cancelled"
  | "unknown";

export interface SubscriptionStatusResponse {
  success: boolean;
  status: SubscriptionStatus;
  subscriptionCode?: string;
  emailToken?: string;
  planCode?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  nextPaymentDate?: string;
  customerEmail?: string;
  error?: string;
}

export interface SubscriptionCancelRequest {
  channelSlug: string;
  subscriptionCode: string;
  emailToken: string;
}

export interface SubscriptionCancelResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices (Paystack payment requests)
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  name: string;
  /** Amount in minor units. */
  amount: number;
  quantity?: number;
}

export interface InvoiceTaxItem {
  name: string;
  /** Amount in minor units. */
  amount: number;
}

export interface InvoiceCreateRequest {
  channelSlug: string;
  email: string;
  customerName?: string;
  /** Total amount in minor units. Required if `lineItems` is omitted. */
  amount?: number;
  currency?: string;
  /** ISO 8601 due date. */
  dueDate?: string;
  description?: string;
  lineItems?: InvoiceLineItem[];
  tax?: InvoiceTaxItem[];
  /** Whether Paystack should email the invoice to the customer. */
  sendNotification?: boolean;
  metadata?: Record<string, unknown>;
}

export type InvoiceStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "expired"
  | "unknown";

export interface InvoiceCreateResponse {
  success: boolean;
  /** Paystack request_code (PRQ_*). */
  requestCode?: string;
  /** Public reference customers see. */
  offlineReference?: string;
  /** Hosted invoice URL — share with the customer. */
  hostedUrl?: string;
  status?: InvoiceStatus;
  amount?: number;
  currency?: string;
  dueDate?: string;
  error?: string;
}

export interface InvoiceFetchResponse {
  success: boolean;
  requestCode?: string;
  offlineReference?: string;
  status?: InvoiceStatus;
  paid?: boolean;
  amount?: number;
  currency?: string;
  dueDate?: string;
  description?: string;
  lineItems?: InvoiceLineItem[];
  tax?: InvoiceTaxItem[];
  customerEmail?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export interface SellubClientOptions {
  /**
   * Base URL of the Sellub API. Defaults to https://api.sellub.com.
   */
  baseUrl?: string;
  /**
   * Publishable key for browser-side calls (`pk_live_*` / `pk_test_*`).
   * Bound to a single channel and pinned to the calling origin on the
   * server. Safe to expose in client bundles.
   *
   * Sent as `X-Sellub-Publishable-Key` on every request.
   */
  publishableKey?: string;
  /**
   * @deprecated Renamed to `publishableKey`. Kept for v0.1 compatibility;
   * if both are set, `publishableKey` wins.
   */
  apiKey?: string;
  /**
   * Optional fetch implementation. Defaults to global `fetch`.
   * Override for environments without a global (e.g. older Node).
   */
  fetch?: typeof fetch;
  /**
   * Vendure channel token (`Channel.token`). When set, the returned
   * `client.shop` ShopClient is scoped to this channel. Required for any
   * Shop API call against multi-channel servers.
   */
  channelToken?: string;
  /**
   * Initial Vendure auth token to resume an existing Shop session.
   * The ShopClient automatically refreshes this from response headers.
   */
  shopAuthToken?: string;
  /**
   * Bearer token for the Sellub Admin GraphQL API. When set, the returned
   * client exposes `client.admin`. **Server-only.** Never embed in browser
   * bundles. Pass `allowAdminInBrowser: true` to bypass the safety guard.
   */
  adminToken?: string;
  /**
   * Opt-in escape hatch to allow constructing the admin client in a
   * browser-like environment. Off by default.
   */
  allowAdminInBrowser?: boolean;
}

export interface SellubClient {
  externalPayments: ExternalPaymentsApi;
  subscriptions: SubscriptionsApi;
  invoices: InvoicesApi;
  /**
   * Vendure Shop GraphQL API (catalog, cart, checkout, orders).
   * Scoped to `options.channelToken` if provided.
   */
  shop: ShopClientApi;
  /**
   * Vendure Admin GraphQL API. Only present when `options.adminToken`
   * was supplied. Throws `AdminApiError` on error.
   */
  admin?: AdminClientApi;
}

export interface ExternalPaymentsApi {
  /**
   * Initialize a one-off payment routed to the given channel's seller
   * subaccount. Returns a Paystack authorization URL — redirect the
   * payer to it.
   */
  initialize(
    input: ExternalPaymentInitializeRequest
  ): Promise<ExternalPaymentInitializeResponse>;

  /**
   * Verify a previously-initialized payment by its reference.
   * Use this on your callback page to confirm the payment status
   * before activating whatever the customer paid for.
   */
  verify(reference: string): Promise<ExternalPaymentVerifyResponse>;
}

export interface SubscriptionsApi {
  /**
   * Start a recurring subscription. Returns a Paystack hosted page URL
   * for the subscriber to authorize the first charge. Once that succeeds
   * Paystack creates the subscription and charges the saved authorization
   * on each interval.
   */
  start(input: SubscriptionStartRequest): Promise<SubscriptionStartResponse>;

  /**
   * Fetch the current status of a subscription by its Paystack
   * `subscription_code`.
   */
  status(subscriptionCode: string): Promise<SubscriptionStatusResponse>;

  /**
   * Cancel an active subscription. Requires both the subscription code
   * and the email token Paystack issued at creation.
   */
  cancel(input: SubscriptionCancelRequest): Promise<SubscriptionCancelResponse>;
}

export interface InvoicesApi {
  /**
   * Create a hosted Paystack payment request (invoice) on behalf of a
   * Sellub seller. Returns the hosted URL the customer can pay from.
   */
  create(input: InvoiceCreateRequest): Promise<InvoiceCreateResponse>;

  /**
   * Fetch an invoice by its Paystack `request_code` (PRQ_*).
   */
  get(requestCode: string): Promise<InvoiceFetchResponse>;
}

const DEFAULT_BASE_URL = "https://api.sellub.com";

export function createSellubClient(
  options: SellubClientOptions = {}
): SellubClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const publishableKey = options.publishableKey ?? options.apiKey;
  const fetchImpl =
    options.fetch ??
    (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);

  if (!fetchImpl) {
    throw new Error(
      "[sellub-client] No fetch implementation found. Pass `options.fetch`."
    );
  }

  const headers = (extra: Record<string, string> = {}): Record<string, string> => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...extra,
    };
    if (publishableKey) h["X-Sellub-Publishable-Key"] = publishableKey;
    return h;
  };

  return {
    externalPayments: {
      async initialize(input) {
        const res = await fetchImpl(`${baseUrl}/external-payments/initialize`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        });
        const data = (await safeJson(res)) as ExternalPaymentInitializeResponse;
        if (!res.ok || !data || data.success === false) {
          return {
            success: false,
            error:
              (data && data.error) ||
              `external-payments/initialize failed (HTTP ${res.status})`,
          };
        }
        return data;
      },

      async verify(reference) {
        const res = await fetchImpl(
          `${baseUrl}/external-payments/verify/${encodeURIComponent(reference)}`,
          { method: "GET", headers: headers() }
        );
        const data = (await safeJson(res)) as ExternalPaymentVerifyResponse;
        if (!res.ok || !data) {
          return {
            success: false,
            status: "unknown",
            reference,
            amount: 0,
            currency: "GHS",
            error: `external-payments/verify failed (HTTP ${res.status})`,
          };
        }
        return data;
      },
    },

    subscriptions: {
      async start(input) {
        const res = await fetchImpl(
          `${baseUrl}/external-payments/subscriptions/start`,
          {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(input),
          }
        );
        const data = (await safeJson(res)) as SubscriptionStartResponse;
        if (!res.ok || !data || data.success === false) {
          return {
            success: false,
            error:
              (data && data.error) ||
              `subscriptions/start failed (HTTP ${res.status})`,
          };
        }
        return data;
      },

      async status(subscriptionCode) {
        const res = await fetchImpl(
          `${baseUrl}/external-payments/subscriptions/${encodeURIComponent(subscriptionCode)}`,
          { method: "GET", headers: headers() }
        );
        const data = (await safeJson(res)) as SubscriptionStatusResponse;
        if (!res.ok || !data) {
          return {
            success: false,
            status: "unknown",
            error: `subscriptions/status failed (HTTP ${res.status})`,
          };
        }
        return data;
      },

      async cancel(input) {
        const res = await fetchImpl(
          `${baseUrl}/external-payments/subscriptions/cancel`,
          {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(input),
          }
        );
        const data = (await safeJson(res)) as SubscriptionCancelResponse;
        if (!res.ok || !data || data.success === false) {
          return {
            success: false,
            error:
              (data && data.error) ||
              `subscriptions/cancel failed (HTTP ${res.status})`,
          };
        }
        return data;
      },
    },

    invoices: {
      async create(input) {
        const res = await fetchImpl(`${baseUrl}/external-payments/invoices`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        });
        const data = (await safeJson(res)) as InvoiceCreateResponse;
        if (!res.ok || !data || data.success === false) {
          return {
            success: false,
            error:
              (data && data.error) ||
              `invoices/create failed (HTTP ${res.status})`,
          };
        }
        return data;
      },

      async get(requestCode) {
        const res = await fetchImpl(
          `${baseUrl}/external-payments/invoices/${encodeURIComponent(requestCode)}`,
          { method: "GET", headers: headers() }
        );
        const data = (await safeJson(res)) as InvoiceFetchResponse;
        if (!res.ok || !data) {
          return {
            success: false,
            error: `invoices/get failed (HTTP ${res.status})`,
          };
        }
        return data;
      },
    },

    shop: createShopClient({
      baseUrl: options.baseUrl,
      channelToken: options.channelToken,
      authToken: options.shopAuthToken,
      fetch: options.fetch,
    }),

    ...(options.adminToken
      ? {
          admin: createAdminClient({
            baseUrl: options.baseUrl,
            adminToken: options.adminToken,
            fetch: options.fetch,
            allowBrowser: options.allowAdminInBrowser,
          }),
        }
      : {}),
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
