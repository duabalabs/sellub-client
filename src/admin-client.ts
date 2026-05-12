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

export interface AdminClientApi {
  /** Raw GraphQL escape hatch. */
  query<T = unknown>(document: string, variables?: Record<string, unknown>): Promise<T>;

  /** List Vendure channels visible to the configured admin token. */
  listChannels(): Promise<{ items: AdminChannel[]; totalItems: number }>;
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
  };
}
