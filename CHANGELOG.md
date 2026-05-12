# Changelog

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
