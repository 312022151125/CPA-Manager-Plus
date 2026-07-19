# Task 1: Codex expiry parser and quota config/rendering

Implement the first two plan approach items in the existing web quota architecture.

## Required behavior

- Add `getCodexSubscriptionActiveUntilMs(value)` to `apps/web/src/utils/quota/codexQuota.ts`.
  - Normalize the existing string-like value using the same normalization pattern already used by Codex quota helpers.
  - Return `Date.parse` milliseconds only when finite; otherwise return `null`.
  - `null`, blank, malformed, and non-finite values are missing.
  - Valid past dates remain known.
- Extend `QuotaSortMode` with `expiry-asc` and `expiry-desc`.
- Add optional `QuotaConfig.getPlanExpiryAtMs(file, quota): number | null`.
- Set accessor only on `CODEX_CONFIG`, using the parser and `quota?.subscriptionActiveUntil`.
- In `buildSuccessState`, preserve raw Codex subscription expiry only when parser returns finite timestamp; otherwise store `null`, so a successful missing/malformed response clears prior expiry.
- Generalize the local Codex date formatter so reset-credit and subscription dates use identical localized date/time formatting.
- In `renderCodexItems`, add `codex_quota.subscription_expiry_label` label/value pair only for a valid timestamp. Include expiry in the surrounding plan row render condition so it appears when plan type is absent. Reuse existing plan row styles; no CSS or new component.
- Do not change request normalization or backend/API types.

## Tests required (TDD)

Update `apps/web/src/utils/quota/codexQuota.test.ts` for valid, blank, malformed, and past timestamps.
Update `apps/web/src/components/quota/quotaConfigs.test.ts` to assert valid subscription expiry label/value, invalid/missing omission, and malformed successful payload clearing stale expiry.
Use existing provider request tests only if needed for compilation; do not change production request code.

## Verification

Run focused tests for the changed utility/config tests after implementation. Record RED and GREEN evidence in the report.

## Constraints

Follow existing patterns. No new cache, component, CSS, endpoint, or abstraction beyond the named helper/accessor. Commit implementation and tests on current feature branch.
