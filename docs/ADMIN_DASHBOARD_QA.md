# Operations dashboard verification — 2026-10-30

Result: implementation and isolated end-to-end checks passed. Live activation awaits the owner running schema 25 and setting the generated backend auth env.

## Automated evidence

- 334 unit tests passed; provider pricing checks cover separate read/write cache rates, reasoning inclusion, invalid usage/rates, unsupported models/tiers, embedding prices and long-context premiums.
- 222 existing HTTP/database integration tests passed on schema 25. Six new dashboard integration cases and five provider-metering/database cases passed separately on disposable PostgreSQL (233 integration cases total).
- Workspace TypeScript checks and production builds of owner, clinic and admin frontends passed. The admin build lists `/dashboard`; `/app` remains the existing LINE tool route.
- SQL role/RLS, erasure, concurrency, rate-limit and gated schema-upgrade suites passed, including 24→25→25 preserving a sentinel owner and existing expense rows. Unknown/partial/drifted schemas and changed migration checksums are rejected.
- Generated bootstrap/upgrade consistency checks and `git diff --check` passed.

## Browser evidence

Tested the production admin build against a real disposable PostgreSQL database via the actual analytics API, using synthetic accounts only.

- Username/password login → HttpOnly session → overview API → chart/table. User-detail pet names, PetID status, per-feature call counts and cost totals matched the synthetic data.
- Monthly grouping produced one October bucket; daily expansion displayed 30 period rows including new-user counts. Pet-name search returned the matching owner once.
- Desktop 1440×1000 and English mobile 390×844 had no document overflow. Tables scroll within their container. Thai/English UI, keyboard-accessible dialog close and logout back to login were verified. Final production-build browser check had no console errors.
- Local evidence is ignored by Git: `.verification/dashboard/overview-th.png`, `mobile-en.png`, `user-detail.png`.

## Security and accounting boundaries

- Anonymous requests to overview and known user details are rejected. Cross-origin login, invalid password, repeated guesses, invalid date ranges and logged-out session reuse were tested.
- Dashboard cookie authority is confined to dashboard endpoints; it does not create a LINE admin identity or grant owner CRUD privileges. Data responses are private/no-store. No registration endpoint or public dashboard sample-data fallback exists.
- Provider usage is recorded even when structured output fails. Unobserved transport outcomes remain uncertain reservations. Budget admission prevents a new provider call once configured per-user exposure would exceed the cap. No real OpenAI API request was made.
- Legacy costs are separate, not retroactively repriced without cached-token data. Estimates are not an invoice. Existing account erasure deletes its ledger; this is documented as operational reporting, not permanent accounting.
- Generated login credentials are in local Git-ignored files with mode 0600. Only example variable names and the generation helper are committed. Production SQL, env and credentials have not been changed by this task.
