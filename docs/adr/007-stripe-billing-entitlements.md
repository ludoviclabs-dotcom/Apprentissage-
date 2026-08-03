# ADR 007 — Stripe billing, webhook-driven entitlements and attestations (PR-07)

Status: accepted
Date: 2026-08-03

## Context

The product needs to sell one premium module and issue an attestation for a
finished track. That is a small feature with one large hazard: every way of
getting payment wrong grants access nobody paid for, or takes away access
somebody did.

The hazard has a specific shape. Stripe Checkout ends by redirecting the browser
back to a success URL, and that URL is the most obvious place to open the module
— the learner is right there, the session id is in the query string, and it
works in the demo. It is also the one place that must never do it: the parameter
is attacker-controlled, and even a genuine session id proves a checkout was
*started*, not that money moved.

The second problem is smaller but bites in production rather than in review.
Stripe guarantees at-least-once delivery and **no ordering** between events. A
design where `customer.subscription.created` can only be attributed to a learner
through the `checkout.session.completed` that preceded it fails whenever the two
arrive out of order, which is often enough to matter and rare enough to ship.

## Decision

### Only a signature-verified webhook writes an entitlement

`POST /api/stripe/webhook` reads the raw body, verifies it with
`Stripe.webhooks.constructEvent`, and is the sole writer of the `entitlements`
table. `/billing/success` reads what that writer produced and reports one of two
states: access is open, or Stripe has not delivered the event yet. It does not
read `session_id` at all.

The success page therefore looks slower than the naive version for a second or
two after payment. That is the correct trade: the alternative is a URL that
grants access to anyone who visits it.

### Identity travels on the subscription, not only on the session

The Checkout Session is created with `client_reference_id`, `metadata.userId`
**and** `subscription_data.metadata.userId`. The third one is what makes
ordering irrelevant: every `customer.subscription.*` event carries the internal
user id directly, so it can be applied whether or not the checkout event has
arrived. `billing_customers` remains as the fallback for subscriptions created
outside the app, and an event that resolves to nobody is answered `200` and
recorded as `unresolved` rather than retried forever — no number of retries will
invent a learner for a subscription made in the dashboard.

### `active` and `trialing` grant; `past_due` does not

`past_due` is Stripe retrying a declined card, and it can run for days. Treating
it as paid would make the product's answer to "your payment failed" be "here is
the content anyway". A recovered payment emits
`customer.subscription.updated` with `active`, so access returns on its own.

### Entitlements expire on their own

A grant carries `expires_at = current_period_end + 24 h`. The grace window
exists because renewal is asynchronous: the invoice is paid, then the webhook
carries the new period end, and a delayed delivery would otherwise lock out a
paying learner at the exact second the old period ends.

The self-expiry is the safety net for the whole integration. If
`customer.subscription.deleted` is never delivered — endpoint down, secret
rotated, deployment broken — access still lapses when the paid time runs out.
The system's failure mode is "closes when it should not have" rather than "stays
open forever", which is the right direction for a mistake about money.

One consequence has to be handled explicitly. The grant made from
`checkout.session.completed` has **no** expiry, because a session carries no
billing period, and Stripe can deliver it *after* the dated grant from the
subscription event. So the upsert coalesces: a dated expiry is never overwritten
by an undated one, while between two dates the newer event wins so a downgrade
still shortens access. That rule is asserted against a real PostgreSQL in
`packages/db/test/billing-entitlements.integration.test.ts`, because it cannot
be proven anywhere else.

### Revocation works from the subscription id, not from a feature list

A plan retired from `BILLING_PLANS` still has live entitlements pointing at it.
A revocation that could only name features it still recognises would leave those
open forever. Revoking every `source = 'subscription'` row tied to the
subscription closes them regardless — and leaves `source = 'manual'` grants
alone, which is what makes a beta tester or a hand-handled refund expressible
without inventing a fake subscription.

### Price ids never reach a client

`apps/web/lib/billing/plans.ts` imports `server-only`, so a client component that
reaches for a price id fails the build rather than shipping one. The checkout
button posts a plan *key*; the route resolves the price. A client that can name a
price can name a cheaper one.

### Two billing tables carry no row level security, and that is deliberate

`billing_customers` and `billing_events` have no policies. Every other owned
table in this schema compares `user_id` against `app_current_user_id()`, which
the application binds per transaction — but a webhook arrives with no session
and a *Stripe* customer id, and resolving that to an internal user is the step
that has to happen before a context exists. `billing_customers` is that lookup,
so it cannot be gated on knowing its own answer; `billing_events` is keyed on an
event id, not a person.

This is the exemption `app_users` and `user_sessions` already carry from PR-01,
for the same reason. Both tables are deliberately content-free — an id pair and
an event receipt, no amounts, no card data, no stored payload — so what an
compromised application role could read there is a mapping, not a billing
history. `subscriptions`, `entitlements` and `certificates` keep ENABLE + FORCE
row level security like everything else.

The rejected alternative was a `SECURITY DEFINER` function to bypass the policy
on `billing_customers`. It would have been a policy plus a documented hole
through it, which is harder to reason about than no policy and a written reason.

### The gate is a property of the module, not of the page

`packages/domain/src/modules.ts` — the registry PR-06 introduced to map an
exercise to its level — gains one field: the entitlement that exercise requires.
The lab page, the level page, the exercise page and `POST /api/exercises/attempts`
all ask the same function. Gating only the page would leave grading, the part
actually being sold, one direct POST away.

### With billing off, everything is open

`FINANCE_HUB_BILLING_ENABLED=false` is the default and means *no gate at all*,
not *gate closed*. A private local-first install has no customer; a paywall that
engages before anyone configured a price would lock the owner of the machine out
of their own lab. The flag is also the rollback lever: turning it off opens every
gate without deleting a single stored entitlement.

### The attestation is HTML, and issued once

No PDF pipeline. The browser's own print-to-PDF typesets better than a first-pass
HTML-to-PDF dependency would, and this app commits to running without internet
access. What the attestation must guarantee is that its contents are true, and
those come from a row only the server writes: completion is read from the PR-02
mastery snapshots — the same call the module pages make, so the two cannot
disagree — and the entitlement from `entitlements`.

Issuance is idempotent per `(user, track)`. Eligibility is checked at issue time
**only**: once issued, a certificate records something that happened, and letting
a lapsed subscription retract it would make the document worthless to the person
who earned it. Revocation exists for a certificate issued in error, not for
churn.

## Consequences

- Access can only be granted by traffic Stripe signed. There is no code path from
  a browser to an entitlement.
- A missed `deleted` webhook costs at most one billing period plus 24 hours of
  access, instead of costing it forever.
- A subscription on a price this deployment cannot map to a plan is **stored and
  not granted**, so an operator can see it and fix the mapping rather than
  discovering that a guess handed out access.
- The webhook is tested against whole Stripe payloads signed with the SDK's own
  `generateTestHeaderString`, so signature verification, the flattening of
  version-specific fields, and idempotency are all covered without a network.

## Assumed limits

- **One Stripe customer per learner, one subscription's worth of access.** Seats,
  team plans and per-seat entitlements are not modelled. Adding them means a new
  owner column, not a new column on `entitlements`.
- **No billing portal.** Cancellation and card updates go through the Stripe
  dashboard for this beta. A portal session is a small route to add later; it was
  left out because it is not needed to sell or to revoke.
- **`invoice.paid` cannot date every renewal.** When the invoice line carries no
  period end the event is recorded and ignored, and the renewal is picked up from
  `customer.subscription.updated` instead. Granting from an invoice that cannot
  date the access it paid for would replace a dated entitlement with an
  open-ended one.
- **Proration and mid-cycle plan changes are untested.** Both plans grant the
  same features, so a switch between them changes only the expiry, which the
  subscription event already carries.
- **The API version is pinned** to `2026-07-29.dahlia` in
  `apps/web/lib/billing/stripe.ts`. It has to be: `current_period_end` moved onto
  subscription items and an invoice reaches its subscription through
  `parent.subscription_details`, both since 2025-03. Upgrading means changing
  that line and re-reading `webhook.ts`, which is the only file that touches
  Stripe's field layout.
