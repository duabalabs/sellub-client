# Changelog

## 0.6.0 — 2026-05-12 — Admin orders, refunds, subscriptions (A1 slice 4)

### Added

- **`admin.listOrders({ take, skip, term, state })`** — paginated, sorted
  by `orderPlacedAt DESC`. Server-side filter via `OrderListOptions`
  (`code: { contains }`, `state: { eq }`).
- **`admin.getOrder({ id }) | admin.getOrder({ code })`** — returns the
  full `AdminOrderDetail` (lines, payments, totals) or `null`.
- **`admin.cancelOrder({ orderId, reason?, lines? })`** — handles the
  `Order | ErrorResult` union; throws `AdminApiError` on
  `CancelActiveOrderError` and friends. Strips `__typename` before return.
- **`admin.refundOrder({ paymentId, lines, amount?, reason?, adjustment?, shipping? })`** —
  same union-unwrap pattern; returns the typed `AdminRefundResult`.
- **`admin.listSubscriptions({ take, skip, tier?, activeOnly? })`** —
  queries the `sellubSubscriptions` resolver (provided by the
  `sellub-subscriptions` plugin on the server side; will no-op with a
  GraphQL "Unknown field" error until that plugin lands).
- New exported types: `AdminOrderSummary`, `AdminOrderDetail`,
  `AdminOrderListInput`, `AdminRefundInput`, `AdminRefundResult`,
  `AdminSubscriptionSummary`.

### Honest gaps

- `listSubscriptions` depends on a server-side `sellubSubscriptions`
  resolver that ships with work-stream C3. The client surface is
  finalised so consumers can wire it without churn.
- `cancelOrder` / `refundOrder` only surface the first ErrorResult
  variant message — granular per-error-code typing is intentionally
  deferred (caller can still inspect `.errors[0].extensions.code`).

## 0.5.0 — 2026-05-12 — Admin namespace + getCatalog alias (A1 slice 1)

### Added

- **NEW: `AdminClient`** — typed wrapper around Sellub's Vendure Admin
  GraphQL API at `${baseUrl}/admin-api`. Auth via
  `Authorization: Bearer <adminToken>`. Surfaces:
  - `listChannels()` — returns `{ items: AdminChannel[]; totalItems }`.
  - `query()` — raw GraphQL escape hatch.
- **`createSellubClient({ adminToken })`** now exposes `client.admin` when
  an admin token is supplied. Without it, `client.admin` is `undefined`.
- **Browser safety guard** — `createAdminClient` throws at construction
  time when it detects a browser-like environment. Pass
  `allowBrowser: true` (or `allowAdminInBrowser: true` on the parent
  client) to opt out.
- **`shop.getCatalog(input?)`** — spec-named alias for `shop.getProducts`.
  Identical behaviour, identical return shape. Provided so integrators can
  use the canonical name from the A1 work-stream.
- **`AdminApiError`** — thrown by all admin operations. Carries `errors[]`
  and `status`.
- 9 new vitest specs covering admin client behaviour, browser guard,
  conditional wiring, and the `getCatalog` alias. Total: 17 tests.

### Notes

- Future A1 slices will add `listOrders`, `getOrder`, `cancelOrder`,
  `refundOrder`, `listSubscriptions` to the admin namespace.

## 0.4.0 — 2026-05 — ShopClient

- **NEW: `ShopClient`** — typed wrapper around Sellub's Vendure Shop GraphQL
  API at `${baseUrl}/shop-api`. Surfaces catalog (`getProducts`, `getProduct`),
  cart (`getActiveOrder`, `addItemToOrder`, `adjustOrderLine`,
  `removeOrderLine`, `setCustomerForOrder`, `setOrderShippingAddress`,
  `setOrderBillingAddress`), and checkout (`getEligibleShippingMethods`,
  `setOrderShippingMethod`, `transitionOrderToState`, `addPaymentToOrder`,
  `getOrderByCode`). Also exposes `query()` as a raw GraphQL escape hatch.
- Vendure session token (`vendure-auth-token`) is captured from response
  headers on every reply and re-attached as `Authorization: Bearer <tok>`
  on the next request. `getAuthToken()` / `setAuthToken()` let callers
  rehydrate sessions from external storage.
- GraphQL `errors[]` are thrown as `ShopApiError`; Vendure ErrorResult
  union members (e.g. `OrderModificationError`) are returned as data —
  switch on `__typename` to handle.
- `createSellubClient({ channelToken, shopAuthToken? })` now exposes
  `client.shop` wired to the same `baseUrl` and channel.
- `createShopClient(...)` is also exported standalone for callers that
  only need the Shop API.
- Vitest added as a devDependency; full unit coverage for the ShopClient
  fetch / header / error / session-rotation paths.

## 0.3.0 — Money APIs

- Renamed and re-released the v0.2 surface (`externalPayments`,
  `subscriptions`, `invoices`) under the v0.3 line. No API changes.

## 0.2.0

- ExternalPayments, Subscriptions, Invoices.

## 0.1.0

- Initial release.
