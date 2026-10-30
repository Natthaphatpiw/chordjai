# Input screening, caching and abuse controls

Implemented 2026-10-30. Apply `supabase/upgrade.sql` **schema 26** before deploying. The operator has already applied schema 25. No production database, environment, deployment or LINE messages were changed for this work.

## Product behaviour

LINE input now follows:

1. A bounded warm-instance request shield before body buffering, then the body limit. JSON business payloads are capped at 128 KiB; multipart photo upload keeps its separate limit.
2. LINE HMAC verification over the original bytes. Invalid signatures never reach durable work.
3. Closed deterministic exclusions: a greeting alone, the exact unrelated examples such as “นายกชื่ออะไร” / “หุ้นตัวไหนดี”, and obvious long repeated-character noise. Return HTTP 200 without an answer, ACK, loading, AI call, event row or job. A greeting followed by a care story is not excluded.
4. Private-user source, event timestamp freshness (24 hours, 60 seconds future tolerance), existing event-ID check, global/source quotas and same-input duplicate check. Group/room traffic and unsupported event types do not enter this product's Agent. Unknown accounts get a bounded onboarding path; they cannot spend AI budget.
5. For active accounts with service consent, **GPT-6 Luna is LLM0**. It returns only route, language and reason, using a bounded pending question, prior request and recent care/conversation context. It has no tools or permission to create records. Scope includes pets, owner feelings about pets, food, symptoms, treatment reports, expenses, memories, PetID, Passport and product help.
6. Unsupported, spam and injection decisions scrub the webhook payload and complete it silently. No Agent turn, chat message, clinical entry or result push is created. The accepted raw webhook was already marked read; a read receipt means receipt, not acceptance of its content.
7. Allowed input receives the existing ACK/loading and durable Agent handoff. The server saves the decision in a separate webhook column, not in a user-supplied payload field. The Agent consumes that decision instead of paying for a second normalizer. Internal Chat receives a server-only Symbol capability; no HTTP header, body flag or model output can forge it. Main planning/chat/vision still use **GPT-6.1 Sol**.

Postbacks use existing owned, expiring, versioned choices, with consumed-state checks. They do not need a model just to classify a button click. PAUSE/RESUME remain deterministic before AI routing. A recognised PAUSE from an existing account can pass an exhausted daily source quota; burst, global and duplicate controls still apply. Clinical emergency patterns take the deterministic urgent path without waiting for an available model. The app's emergency page remains available independently.

LIFF Chat requires active service consent (also on cache hits) and uses the same contextual gate before creating a conversation/message or reading a full personalised context. Unsupported input gets a short local scope hint in the UI and is not added to conversation history. Existing conversation/pet ownership is checked before screening. Stable completed request IDs replay the original result without another provider call; changed text with the same ID is a conflict.

## Threat analysis and implemented responses

| Surface / abuse | Response | Remaining boundary |
|---|---|---|
| Greetings, politics, stocks, unrelated homework/code | Exact closed rules first; Luna for remaining scope decisions; no main-model answer for rejected input | Semantic decisions can be wrong; evaluate Thai/English cases with actual Luna before launch |
| Repeated message / webhook redelivery / double worker | Unique event IDs, per-owner last-input fingerprint for 30 seconds and task-version context, durable turn/task/result idempotency | Deliberate repetition after the window is a new request; do not permanently suppress genuine repeated symptoms |
| Rapid valid messages, buttons and many new accounts | Persistent source burst/day and global minute limits before event/job INSERT; unknown accounts cannot call AI | Application limits do not stop network-level distributed denial of service |
| Prompt injection / asking to reveal secrets, forge ownership or mass-create fake records | Narrow typed Luna decision, no classifier tools, unchanged bounded planner/tool catalogue, current server ownership checks and sensitive-write confirmation | LLM classification is not an authorisation boundary; quotas and RLS remain necessary even when it says allowed |
| Calling API directly / rotating paths or idempotency keys | Per-account read/write buckets use fixed categories, not arbitrary paths/keys; public global/IP gates | Limits are shared across services to stop quota multiplication |
| Flooding records or batch writes | DB insert triggers on pets, care entries, health records, books/pages, media, explicit AI memories, conversations and analytics; full transaction rollback when a batch exceeds quota | Existing valid records are not content-classified or deleted; further record types still rely on authenticated API caps |
| Photo/receipt upload spam | Existing file type, 3.5 MB byte and 40M decoded-pixel checks; upload 10/minute and 50/day; 250 MiB active/pending media per owner checked before Blob PUT with a DB lock | Erased blobs are removed by the existing deletion queue; active quota is not an exact Blob invoice limit |
| Cache probing, cross-owner leaks, stale care answers | Cache only exact typed classification; owner, channel, context revision, prompt version and Bangkok day are in the key; current auth is still checked | The classification cache never stores generated medical advice, records, permission decisions, action success or signed image URLs; existing exact-request message replay is separate idempotency |
| Cache stampede / many Vercel instances | Database lease per owner/key; 8-second Luna timeout, no retries and no fallback to Sol; uncertain billed outcomes retained in cost ledger | A crashed request may need a later retry after the 90-second lease |
| Database/log inflation from blocked traffic | Saturating rate counters, hourly aggregate metrics, bounded cache, budget-denial ledger coalesced to one row/minute/owner/feature; sampled 4xx logs | Warm rejections and pre-storage LINE rule drops intentionally have no DB metric |
| Expired storage | Existing cron sweeps: cache expiry, guard metrics after 30 days, completed jobs after 30 days in bounded batches; existing webhook/Agent retention remains | Dead/queued/running jobs are retained for operational recovery; ensure cron is healthy |

## Defaults and tuning

No new required secret or external Redis service. Same existing OpenAI key and Supabase connection. The full optional backend variables are listed in `backend/.env.example`. Integer limits must be between 1 and 10,000; zero cannot disable protection.

| Control | Default |
|---|---:|
| Warm shield per service / trusted source IP / 10 seconds | 120 (best effort, one warm instance only) |
| LINE all-source admissions / minute | 600 |
| LINE one-source burst / 10 seconds | 6 |
| LINE one registered source / UTC bucket day | 150 |
| Unknown LINE source / UTC bucket day | 5 |
| Authenticated API writes / account / minute and UTC bucket day | 60 / 500 |
| Authenticated API reads / account / minute | 240 |
| Public requests / service / minute; per source IP / minute | 600 / 120 |
| AI calls / account / minute; globally / minute | 20 / 300 |
| Per-user AI budget / Bangkok day | $0.50; existing global daily default stays $5 |
| DB guarded inserts / actor / minute and UTC bucket day | 120 / 1,000 (hard ceilings) |
| Media uploads / actor / minute and UTC bucket day | 10 / 50 (hard ceilings) |
| Active + pending media size / owner | 250 MiB (hard ceiling) |
| Classification cache TTL; records / owner | 10 minutes; 200 |

These anti-abuse day windows use the existing `ops.take_rate_limit` UTC epoch buckets. Financial budget and dashboard calendar filters remain Asia/Bangkok. A fixed-window boundary can admit a burst on both sides; the 10-second and minute ceilings reduce that exposure. General API writes count requests, while DB triggers count committed INSERT attempts (including ON CONFLICT attempts). Batch imports therefore have two distinct ceilings.

Per-account buckets are tied to server-verified identity. They cannot be bypassed by changing an idempotency key or LINE display name. Public source IP is read from Vercel's `x-vercel-forwarded-for`; arbitrary client `X-Forwarded-For` is not trusted. Local development uses a shared local bucket. [Vercel request headers](https://vercel.com/docs/headers/request-headers).

## Cost and privacy

Luna Standard rates checked 2026-10-30 per 1M tokens: input $0.10, output $0.50, cached read $0.01, short cache write $0.125. Optional `AI_LUNA_*_USD_PER_MILLION` overrides are independent of Sol's rates. Every actual screening call is metered as `input.classify`, with tokens, cache breakdown, model and saved price snapshot visible in the operations dashboard. Existing `agent.normalize` fallback also uses Luna, covering pre-gate queued turns. Unsupported tiers/models remain unpriced rather than assigned Sol pricing.

The Responses request uses `store:false`, reasoning `none`, maximum 300 output tokens and a stable in-memory prompt-cache key for shared classifier instructions. Provider prompt caching is separate from the app's decision cache and a hit is not guaranteed. No full history or images are sent to this textual gate. Prompt/answer text is not stored in the cost ledger, cache or hourly counters. Existing requested business narratives remain in their appropriate private records.

Official sources: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [OpenAI pricing](https://developers.openai.com/api/docs/pricing).

## Dashboard and rollout

Overview adds hourly protection counters with the selected date/user filter. The AI feature filter does not apply to these counters. Cache hits, model-allowed/rejected inputs, duplicate LINE input and rate limits are separate event counts, not unique users or provider invoices. Cache-hit events are not counted again as fresh classifier decisions. No fabricated dollar savings is displayed.

Activation order:

1. Run the current `supabase/upgrade.sql` against the already-upgraded schema 25. Do not use bootstrap.sql for the existing project.
2. Existing dashboard/login env from version 25 stays valid. No new secret is required. The per-user AI budget now defaults to $0.50/day; if an older environment explicitly sets `AI_USER_DAILY_BUDGET_USD=0`, set it to `0.50` (or your intended cap) to enable that protection. Other optional limits are in `backend/.env.example`.
3. Deploy this code together after SQL. If the API key's model policy does not permit Luna, grant it in the existing OpenAI project; the gate will otherwise fail closed and will not switch models.
4. Confirm valid pet care, pending numeric/name answers, unrelated topics, duplicate messages, diary result links and the `input.classify` cost rows on staging, then a controlled production check. Do not broadcast tests to users.

For distributed attacks, configure Vercel Firewall before Functions, across backend and frontend API rewrite domains. Keep LINE's signed webhook out of browser challenge rules; a CAPTCHA challenge would break LINE delivery. Apply authentication-exchange/public capability limits and monitor false positives before tightening. This work changes no paid Firewall settings. Application-layer protection cannot promise zero database traffic, zero infrastructure charges or immunity to DDoS.

## Verification

Automated tests exercise signed admission, no-row greeting drops, silent Luna rejection, a provider outage without Sol fallback, context-aware numeric answers, no duplicate normalizer, cost metering, owner/context cache isolation, concurrent cache leases, direct API quotas, atomic DB batch refusal and media storage overflow. Providers and LINE delivery are mocked; no live paid API call or real user message was made. Full regression results are recorded in `docs/VERIFICATION.md`. These are implementation tests, not measured semantic accuracy or a load test of production.
