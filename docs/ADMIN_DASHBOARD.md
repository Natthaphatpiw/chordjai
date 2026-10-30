# ChordJai operations dashboard

Implemented 2026-10-30. URL: https://admin.chordjai.life/dashboard

## What it measures

- Registered owner accounts, new accounts in a selected range, distinct active accounts, authenticated app opens, owned pets and ready PetID registrations.
- Active means an authenticated app open, an AI request admitted to the provider path, a new care diary entry, or a new memory page. It is not anonymous landing traffic or proof of meaningful engagement. Account and pet counts are current-state counts; new users and activity are period counts. App-open instrumentation starts with this release and does not backfill earlier visits. Shared pets are listed under their owner, not counted again under carers.
- A searchable, paginated owner list shows pet names/species, PetID status, diary/page counts, last known activity and AI costs. A user detail dialog shows per-feature usage. It does not expose diary narratives, conversations, medical attachments, microchips, LINE IDs or biometric descriptions.
- AI ledger: each provider API call, feature, requested/resolved model, input/output/cache-read/cache-write/reasoning tokens, latency, status, stored rate snapshot and estimated USD. One chat/Agent task may invoke LLM0 and several other calls; calls are not equivalent to user messages.
- Filters: inclusive start/end calendar dates in Asia/Bangkok; day/month/year buckets; user UUID; AI feature. All money stays in USD, with no invented THB exchange rate. CSV exports only the currently displayed ledger page, explicitly labelled.

## Cost definitions and accuracy

The OpenAI response supplies token usage; the application computes a cost estimate. This is not a provider invoice or a per-call billed-dollar field. No organisation billing key is needed or added.

Sources checked 2026-10-30:
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/guides/embeddings

Standard GPT-6.1 Sol rates per 1M tokens: ordinary input $2; cached read $0.10; cache write $2.50; output $10. Embedding text-embedding-3-small: input $0.02. Reasoning tokens are included in output and are never charged twice. Ordinary input is input minus cached reads and cache writes. Requests above 272K input use the documented 2× input/cache and 1.5× output multiplier. Generative calls explicitly request the default tier; unsupported returned tiers/models are shown as unpriced instead of assigning an unrelated price. An optional configured multiplier supports a known agreement/region adjustment.

Each measured call saves its rates/version and provider IDs (without prompts or answers). Later rate changes do not rewrite history. Known provider usage is preserved even when response validation fails. Missing/invalid usage or a lost transport result retains the conservative budget reservation and is shown as uncertain, not zero cost. Model token billing is estimated; provider credits, taxes, invoice adjustments and external tools are outside this ledger.

Rows from older releases retain `legacy_estimate`: their cache breakdown and original rate snapshot cannot be reconstructed honestly. They are displayed separately. The existing account-erasure cascade also removes that account's AI ledger; this dashboard is operational reporting on retained data, not a permanent accounting ledger.

## Activation: the owner applies SQL and env

1. Run the current **supabase/upgrade.sql** in Supabase SQL Editor as the database owner. It recognises verified existing schema versions, including 25, applies through schema 26 in one transaction and preserves existing rows. Re-running verifies the schema instead of recreating tables. Do not run bootstrap.sql against the existing project. The standalone source is supabase/migrations/202610300025_admin_dashboard.sql, but prefer the generated upgrade bundle so the tracker stays consistent.
2. Open the locally generated **local-secrets/dashboard-login.md** for the username and unique password. Both local-secrets files are Git-ignored with file mode 0600. No shared/default production password is committed.
3. Copy the three variables from **local-secrets/dashboard-backend.env** into the **chordjai-backend** Vercel project, Production environment:

```dotenv
ADMIN_DASHBOARD_USERNAME=chordjai-admin
ADMIN_DASHBOARD_PASSWORD_HASH=<copy the generated scrypt hash, not the password>
ADMIN_DASHBOARD_ORIGIN=https://admin.chordjai.life
```

4. Redeploy backend after setting env. The admin frontend uses its existing API_ORIGIN=https://api.chordjai.life; there are no new frontend secrets or NEXT_PUBLIC credentials.
5. Open /dashboard and sign in. /app retains the previous LINE-admin operations tools. Until SQL/env activation, the new dashboard fails closed with a setup message. AI metering remains compatible with schema 24 during rollout; the enhanced cache breakdown starts after migration 25 is detected (up to 30 seconds after a warm instance's schema check).

To generate credentials on a fresh checkout: `node scripts/create-dashboard-login.mjs`. It refuses to overwrite existing files and does not change live env/database. To rotate, preserve/move your previous local credential files, generate a fresh pair, replace the backend hash/username env, and redeploy. The credential-version check invalidates sessions signed in with the previous hash.

## Budget controls

Existing AI_DAILY_BUDGET_USD remains the global daily cap (default $5). These **backend-only** settings add caps (the input-protection release defaults the per-user cap to $0.50):

```dotenv
AI_USER_DAILY_BUDGET_USD=0.50
AI_MONTHLY_BUDGET_USD=0
AI_CACHED_INPUT_USD_PER_MILLION=0.10
AI_CACHE_WRITE_USD_PER_MILLION=2.50
AI_EMBEDDING_USD_PER_MILLION=0.02
AI_PRICE_MULTIPLIER=1
```

Zero disables an additional cap. For example, set per-user daily to 0.50 and monthly to 50 if those are your intended limits; these are examples, not financial recommendations or silently applied defaults. The existing AI_INPUT_USD_PER_MILLION=2 and AI_OUTPUT_USD_PER_MILLION=10 remain in effect. Budget admission is serialized by a database advisory lock across Vercel instances. It counts known costs plus conservative reserved/uncertain exposure and blocks before sending another request that would exceed the admission estimate. This cannot guarantee a provider invoice will equal the configured cap. Thai midnight/month boundaries are used consistently. The UI displays the configured limits; changes are made in backend env and redeployed.

## Access model

Single named operator credential, scrypt salted hash, 256-bit opaque random session, SHA-256 token digest in the database, HttpOnly/SameSite=Strict cookie (Secure in production), eight-hour absolute expiration, explicit allowed-Origin checks for login/logout, and persistent global/account login throttles. Password changes invalidate old sessions. Every dashboard data endpoint verifies its own session; the operator cookie grants no access to normal owner CRUD or old job-management endpoints. A user-detail view writes an audit entry. API responses are private/no-store and the admin site is noindex. This is separate from LINE owner/vet/admin identity and has no self-sign-up.

## Validation

- TypeScript across workspaces and production admin build.
- Pricing unit tests plus isolated provider-mock/database tests: cache/write breakdown, reasoning, incomplete output, unknown transport, embeddings and per-user budget admission. No real OpenAI request or charge.
- Isolated dashboard API tests: unauthenticated denial, Origin checks, password failures, HttpOnly session, rate limit, Bangkok-midnight/date buckets, distinct activity, pet search and scoped ledger, private-text exclusion, audit path and logout revocation.
- Existing SQL security/concurrency and schema upgrade tests, including 24→25→25 preservation.
- Browser verification uses synthetic accounts in disposable local PostgreSQL, never the user's live account data. Evidence: ignored .verification/dashboard/.

## Input protection release (schema 26)

See [INPUT_PROTECTION.md](INPUT_PROTECTION.md) for Luna screening, exact per-owner decision caching, ingress/API/DB quotas, upload storage ceilings and the added protection counters. `input.classify` is a distinct AI cost feature. The existing dashboard credentials remain valid. Apply the current upgrade bundle for schema 26 before deploying this release.
