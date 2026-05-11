# @duabalabs/sellub-client

Typed client for the [Sellub](https://sellub.com) commerce platform.

Sibling of [`@duabalabs/dps-client`](../dps-client). Where DPS handles tenant
identity / automation, Sellub handles commerce — catalog, checkout, orders,
fulfillment, payments. This package wraps Sellub's REST + (later) GraphQL
surfaces with typed helpers.

## v0.3 — Money APIs

Three surfaces today, all hitting `api.sellub.com/external-payments/*` and
authenticating with a publishable key (`X-Sellub-Publishable-Key`):

- **`externalPayments`** — one-off payments routed to a seller's Paystack
  subaccount (donations, simple buy buttons, embedded checkout).
- **`subscriptions`** — recurring billing on Paystack plans.
- **`invoices`** — hosted Paystack payment requests on behalf of a seller.

```ts
import { createSellubClient } from "@duabalabs/sellub-client";

const sellub = createSellubClient({
  baseUrl: process.env.NEXT_PUBLIC_SELLUB_API_URL,        // default: https://api.sellub.com
  publishableKey: process.env.NEXT_PUBLIC_SELLUB_PUBLISHABLE_KEY,
});
```

### One-off payments

```ts
const init = await sellub.externalPayments.initialize({
  channelSlug: "duabanti",
  email: "donor@example.com",
  amount: 5000,                    // pesewas — GHS 50.00
  customerName: "Kwame Mensah",
  description: "Donation to DuabaNti",
  callbackUrl: "https://duabanti.org/donate/thank-you",
  metadata: { source: "donate-modal" },
});

if (init.success && init.authorizationUrl) {
  window.location.href = init.authorizationUrl;
}
```

After Paystack redirects back, verify on your callback page:

```ts
const result = await sellub.externalPayments.verify(reference);
if (result.success && result.status === "success") {
  // unlock whatever the payment was for
}
```

### Subscriptions

```ts
const sub = await sellub.subscriptions.start({
  channelSlug: "duabaconnect",
  email: "tenant@example.com",
  customerName: "Acme Ltd",
  plan: {
    name: "DuabaConnect Pro / monthly",
    amount: 15000,            // GHS 150.00
    interval: "monthly",
    currency: "GHS",
  },
  callbackUrl: "https://app.duabaconnect.com/billing/return",
  metadata: { tenantId: "acme" },
});

if (sub.success && sub.authorizationUrl) {
  window.location.href = sub.authorizationUrl;
}
```

Check status / cancel:

```ts
const status = await sellub.subscriptions.status(subscriptionCode);

await sellub.subscriptions.cancel({
  channelSlug: "duabaconnect",
  subscriptionCode,
  emailToken,
});
```

### Invoices

```ts
const inv = await sellub.invoices.create({
  channelSlug: "duabatrade",
  email: "buyer@example.com",
  customerName: "Buyer Co.",
  currency: "GHS",
  dueDate: "2025-12-31",
  description: "Order #1234",
  lineItems: [
    { name: "Logistics", amount: 25000, quantity: 1 },
    { name: "Insurance", amount: 5000, quantity: 1 },
  ],
  sendNotification: true,
});

if (inv.success && inv.hostedUrl) {
  // share inv.hostedUrl with the buyer
}

const fetched = await sellub.invoices.get(inv.requestCode!);
```

## Roadmap

| Version | Surface | Purpose |
|---|---|---|
| 0.1 | `externalPayments` | one-off payments (donations, simple buttons) |
| **0.3** | `+ subscriptions, invoices` | recurring billing + hosted invoices |
| 0.4 | `ShopClient` | Vendure Shop GraphQL — catalog, cart, checkout, orders |
| 0.5 | `AdminClient` | Vendure Admin GraphQL — provisioning, fulfillment, reports |
| 0.6 | `EmbedTokens` | short-lived session tokens for the iframe admin embed |
| 0.7 | `Webhooks` | HMAC verifier + typed payloads for inbound Sellub webhooks |

## License

MIT
