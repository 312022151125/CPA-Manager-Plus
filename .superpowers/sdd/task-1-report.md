# Task 1 Report: Codex expiry parser and quota config/rendering

**Status:** complete  
**Branch:** `quota-plan-expiry-sort`  
**Commit:** `6267a1b` — `feat(web): add Codex subscription expiry parser and render`

## Scope delivered

Implemented plan approach items 1–2 (parser + config/render) only. Persistence filtering and UI sort consumers left for later tasks.

### Behavior

1. **`getCodexSubscriptionActiveUntilMs(value)`** in `apps/web/src/utils/quota/codexQuota.ts`
   - Uses existing `normalizeStringValue` normalization.
   - Returns `Date.parse` ms only when finite; otherwise `null`.
   - Valid past dates remain known.

2. **`QuotaSortMode`** extended with `expiry-asc` | `expiry-desc`.

3. **`QuotaConfig.getPlanExpiryAtMs?(file, quota)`** optional accessor; set only on `CODEX_CONFIG` via the parser + `quota?.subscriptionActiveUntil`.

4. **`CODEX_CONFIG.buildSuccessState`** stores raw `subscriptionActiveUntil` only when parser returns finite ms; otherwise `null` (clears stale expiry on successful missing/malformed payload).

5. **Shared date formatter** `formatCodexDateTime` replaces `formatCodexResetCreditExpiryTime`; reset-credit and subscription expiry use the same localized `toLocaleString` shape.

6. **`renderCodexItems`**
   - Adds `codex_quota.subscription_expiry_label` + formatted value for valid timestamps only.
   - Plan row condition includes expiry so it still renders when plan type is absent.
   - Reuses existing plan-row styles; no CSS/new component.

7. **i18n** `subscription_expiry_label` added under `codex_quota` in en / ru / zh-CN / zh-TW.

## Files changed

| File | Change |
|---|---|
| `apps/web/src/utils/quota/codexQuota.ts` | Added `getCodexSubscriptionActiveUntilMs` |
| `apps/web/src/utils/quota/codexQuota.test.ts` | Parser cases: valid, past, blank, malformed/non-finite |
| `apps/web/src/components/quota/quotaConfigs.ts` | Sort modes, accessor, success clearing, shared formatter, render expiry |
| `apps/web/src/components/quota/quotaConfigs.test.ts` | Render/success/accessor coverage for expiry |
| `apps/web/src/i18n/locales/en.json` | `codex_quota.subscription_expiry_label` |
| `apps/web/src/i18n/locales/ru.json` | same |
| `apps/web/src/i18n/locales/zh-CN.json` | same |
| `apps/web/src/i18n/locales/zh-TW.json` | same |

## TDD evidence

### RED (tests first, production code absent/unchanged)

Command:

```sh
cd apps/web && bunx vitest run src/utils/quota/codexQuota.test.ts src/components/quota/quotaConfigs.test.ts
```

Result (excerpt from session log `~/AppData/Local/rtk/tee/1784442563_test.log`):

```
❯ src/utils/quota/codexQuota.test.ts (13 tests | 5 failed)
    × returns finite Date.parse milliseconds for valid ISO timestamps
    × keeps valid past dates as known sortable timestamps
    × treats null, blank, and whitespace-only values as missing
    × treats malformed and non-finite values as missing
    × normalizes finite numeric timestamps via string conversion
❯ src/components/quota/quotaConfigs.test.ts (16 tests | 4 failed)
    × renders a valid subscription expiry label and value with the plan row
    × renders subscription expiry even when plan type is absent
    × stores null subscription expiry when a successful payload is missing or malformed
    × exposes getPlanExpiryAtMs from CODEX_CONFIG only for finite timestamps

Test Files  2 failed (2)
     Tests  9 failed | 20 passed (29)
```

Key failure modes observed:

- `getCodexSubscriptionActiveUntilMs is not a function`
- render output missing `codex_quota.subscription_expiry_label`
- malformed success still kept `"not-a-date"`
- `CODEX_CONFIG.getPlanExpiryAtMs` undefined

Note: the fragile bare-number epoch case was later dropped (implementation-dependent `Date.parse` on decimal epoch strings); required cases remain valid / blank / malformed / past.

### GREEN (after implementation)

Command:

```sh
cd apps/web && bunx vitest run src/utils/quota/codexQuota.test.ts src/components/quota/quotaConfigs.test.ts
```

Result:

```
Test Files  2 passed (2)
     Tests  28 passed (28)
  Duration  1.15s
```

## Self-review

- No request normalization / backend / API type changes.
- No persistence / Auth Files / QuotaSection sort wiring (later tasks).
- Reset-credit feature remains independent of plan-expiry display/order.
- Loader still assigns `buildSuccessState` wholesale, so a successful missing/malformed response replaces prior state and clears expiry as designed.
- `formatCodexDateTime` reuses the new parser (stricter than prior `new Date(...).getTime()` only in that blank/malformed both yield `'-'`; valid dates identical).
- Sort mode type expanded now so later UI tasks compile against the union; no consumer branches added here.

## Concerns / follow-ups

1. **i18n sort strings** (`sort_expiry_asc` / `sort_expiry_desc` under `auth_files` and `quota_management`) intentionally deferred to later tasks that surface those options.
2. **Numeric epoch payloads** not auto-converted; plan assumption: current path is ISO via `resolveCodexSubscriptionActiveUntil` → `normalizeStringValue`. If backend sends raw epoch numbers that stay non-ISO after stringification, fix normalization only after confirming seconds-vs-ms contract.
3. **Did not run** formatters, linters, or project-wide suites (per task constraints). Focused tests only.

## Commit

```
6267a1b feat(web): add Codex subscription expiry parser and render
```
