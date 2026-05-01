/**
 * @duabalabs/sellub-client — typed client for the Sellub commerce platform.
 *
 * v0.1 surface:
 *   • ExternalPayments — initialize + verify one-off payments through
 *     Sellub's external-payments REST endpoints (used by donation modals,
 *     simple checkout buttons, embedded buy flows, etc).
 *
 * Future surfaces (v0.2+):
 *   • ShopClient   — Vendure Shop API (catalog, cart, checkout, orders)
 *   • AdminClient  — Vendure Admin API (provisioning, fulfillment, reports)
 *   • EmbedTokens  — short-lived session tokens for the embed iframe
 *   • Webhooks     — HMAC verifier for inbound Sellub webhooks
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror sellub-server/src/plugins/dps-e-external-payments/src/types.ts
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
// Client
// ─────────────────────────────────────────────────────────────────────────────

export interface SellubClientOptions {
  /**
   * Base URL of the Sellub API. Defaults to https://api.sellub.com.
   */
  baseUrl?: string;
  /**
   * Optional API key. When the Sellub server is configured with
   * `EXTERNAL_PAYMENTS_API_KEY`, requests must include
   * `X-Sellub-Api-Key` — this client adds it automatically.
   */
  apiKey?: string;
  /**
   * Optional fetch implementation. Defaults to global `fetch`.
   * Override for environments without a global (e.g. older Node).
   */
  fetch?: typeof fetch;
}

export interface SellubClient {
  externalPayments: ExternalPaymentsApi;
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

const DEFAULT_BASE_URL = "https://api.sellub.com";

export function createSellubClient(
  options: SellubClientOptions = {}
): SellubClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = options.apiKey;
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
    if (apiKey) h["X-Sellub-Api-Key"] = apiKey;
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
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
