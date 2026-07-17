# Quota

Quota answers "can this account continue serving requests now?" It combines auth files, inspection results, failure summaries, response headers, and cooldown records to decide whether an account should pause or recover.

It is about account state, not cost. Use [Usage Analytics](./usage-analytics.md) for cost breakdowns.

## Before Opening It

Quota data depends on auth files and provider responses. Before using this page, confirm:

1. The account exists in [Auth Files](./auth-files.md) and has a stable `auth_index`.
2. Requests are flowing through CPA and recent requests exist.
3. For Codex accounts, run [Codex Inspection](./codex-inspection.md) when needed.
4. For batch Grok/xAI account health, use [Grok Account Inspection](./grok-inspection.md).

## Data Sources

Quota clues may come from:

- Account information from CPA providers or auth files.
- Codex inspection results.
- Failure summaries such as `usage_limit_reached`.
- Recent response headers that recorded quota or reset times.
- CPAMP quota cooldown records.

Different providers return different data. Unknown means CPAMP did not get enough information. It does not mean the account is unlimited.

### Paid xAI OAuth

Free Grok Build OAuth credentials can return weekly and monthly data through the CLI billing endpoints. OAuth credentials intended for the official `api.x.ai` API may receive `403 Access denied` from those endpoints, and there is currently no public paid-quota endpoint that CPAMP can query for this credential type.

When both CLI billing requests return a generic `403 Access denied` without a more specific subscription, entitlement, or quota signal, CPAMP uses the read-only `GET https://api.x.ai/v1/me` endpoint to check the official API identity. A successful response is shown as an “Official API” health state. CPAMP does not synthesize quota, cost, or remaining percentages and does not invoke a model. This state proves only that the OAuth identity is reachable; it does not verify chat routing or model access.

To route paid xAI OAuth requests through the official API in CPA, the auth JSON normally needs `using_api: true` together with `base_url: https://api.x.ai/v1`. Otherwise OAuth may continue using the Grok CLI chat proxy by default. Check the xAI console for actual cost and remaining quota.

## Page Actions

- Search by file name, account, note, or index.
- Sort by plan, quota state, or name.
- Refresh auth files and quota to reload accounts and queryable quota.
- Follow cooldown, reauth, or health hints into Auth Files, OAuth, or inspection pages.
- When comparing accounts, rely on `auth_index` and notes, not only file names.

## Quota Cooldown

When a quota cooldown switch is enabled and an account reaches a clear usage limit, CPAMP can temporarily disable the related auth file and recover it after the reset time.

Supported signals and switches:

- **Codex**: `usage_limit_reached` with a known reset time (body/header). Enable with `USAGE_QUOTA_COOLDOWN_ENABLED` or Configuration → **Codex Quota Cooldown Handling**.
- **Grok/xAI free tier**: `subscription:free-usage-exhausted` (or body text containing free-usage exhaustion). Default recover window is **24 hours** unless the response body/header supplies a better reset time. Enable with `USAGE_GROK_QUOTA_COOLDOWN_ENABLED` or Configuration → **Grok/xAI Free-Usage Cooldown**.

Cooldown records include a reason code and window kind. Current window kinds are `five_hour`, `weekly`, `monthly`, `rolling_24h`, and `unknown`. For example, if a Codex five-hour limit is exhausted while the weekly limit remains available, only the five-hour window controls the cooldown. After recovery, the credential can re-enter CPA scheduling without waiting for the weekly window.

Notes:

- Codex and Grok/xAI use **separate** on/off switches; turning one on does not enable the other.
- Auto-restore depends on CPAMP continuing to run.
- While the CPAMP cooldown is active, the credential is disabled in CPA and is not selected for new requests.
- Quota cooldown restores only credentials disabled by that cooldown record. Manual, inspection-owned, or auth-failure disables are not overridden.
- Unstable `auth_index` values can prevent accurate account binding.
- Generic rate-limit 429s without a free-usage / usage-limit signal are ignored.

Quota cooldown is for clear quota exhaustion. It is not a good tool for expired login, upstream bans, or configuration errors. Use [Account Action Queue](./account-actions.md) or [OAuth Login](./oauth.md) for those.

## Troubleshooting

If an account looks usable but requests fail:

1. Read the failure summary in Monitoring.
2. Check whether Codex Inspection reports quota, workspace, or auth issues.
3. Check Auth Files for manual disabled state or cooldown.
4. Check whether the account action queue has pending candidates.
5. If the page has no quota data, confirm whether that provider supports active quota lookup or only passive header observation.
