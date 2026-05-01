# @duabalabs/sellub-client

Typed client for the [Sellub](https://sellub.com) commerce platform.

Sibling of [`@duabalabs/dps-client`](../dps-client). Where DPS handles tenant
identity / automation, Sellub handles commerce — catalog, checkout, orders,
fulfillment, payments. This package wraps Sellub's REST + (later) GraphQL
surfaces with typed helpers.

## v0.1 — External Payments

The first surface is `ExternalPayments`, used by sites that just need to
collect a one-off payment routed to a Sellub seller's Paystack subaccount
(donation buttons, simple buy buttons, embedded checkout, etc).

```ts
import { createSellubClient } from "@duabalabs/sellub-client";

const sellub = createSellubClient({
  baseUrl: process.env.NEXT_PUBLIC_SELLUB_API_URL,        // default: https://api.sellub.com
  apiKey: process.env.NEXT_PUBLIC_SELLUB_EXTERNAL_PAYMENTS_API_KEY, // optional
});

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

## Roadmap

| Version | Surface | Purpose |
|---|---|---|
| 0.1 | `ExternalPayments` | one-off payments (donations, simple buttons) |
| 0.2 | `ShopClient` | Vendure Shop GraphQL — catalog, cart, checkout, orders |
| 0.3 | `AdminClient` | Vendure Admin GraphQL — provisioning, fulfillment, reports |
| 0.4 | `EmbedTokens` | short-lived session tokens for the iframe admin embed |
| 0.5 | `Webhooks` | HMAC verifier + typed payloads for inbound Sellub webhooks |

## License

MIT
