# Alias test report: Codex subscriptionActiveUntil payload aliases

## Scope

Lock `fetchCodexQuota` normalization for both payload aliases:

- `subscription_active_until` (snake_case)
- `subscriptionActiveUntil` (camelCase)

into `result.subscriptionActiveUntil`.

## Production path (unchanged)

`apps/web/src/utils/quota/providerRequests.ts`:

```ts
const resolveCodexSubscriptionActiveUntil = (payload: CodexUsagePayload): string | null =>
  normalizeStringValue(payload.subscription_active_until ?? payload.subscriptionActiveUntil);
```

`fetchCodexQuota` assigns `subscriptionActiveUntil: resolveCodexSubscriptionActiveUntil(payload)`.
No production code changes required; both aliases already work.

## Test change

File: `apps/web/src/utils/quota/providerRequests.test.ts`

Added parameterized `fetchCodexQuota` cases under existing harness:

- `subscription_active_until` with whitespace-padded ISO timestamp
- `subscriptionActiveUntil` with whitespace-padded ISO timestamp

Observable assertion: `result.subscriptionActiveUntil === '2026-08-01T12:34:56.000Z'` (trimmed).

Whitespace padding exercises `normalizeStringValue` on the real request path, not raw passthrough.

## TDD / evidence

### RED attempt

Production already maps both aliases via `??` + `normalizeStringValue`.
A genuine RED could not be produced without intentionally breaking production alias selection or string normalization — out of scope (test-only unless production fails).

Documented as **baseline GREEN**.

### GREEN run (alias filter)

Command (from `apps/web`):

```sh
bunx vitest run src/utils/quota/providerRequests.test.ts -t "maps .* payload alias" --reporter=verbose
```

Result:

```
Test Files  1 passed (1)
     Tests  2 passed | 51 skipped (53)
  Duration  792ms
```

Both alias cases passed:

- `maps subscription_active_until payload alias to subscriptionActiveUntil`
- `maps subscriptionActiveUntil payload alias to subscriptionActiveUntil`

### GREEN run (full providerRequests suite)

Command (from `apps/web`):

```sh
bunx vitest run src/utils/quota/providerRequests.test.ts --reporter=verbose
```

Result:

```
Test Files  1 passed (1)
     Tests  53 passed (53)
  Duration  856ms
```

## Constraints check

- Production request code: not modified
- Formatters / linters / project-wide suite: skipped
- Focused provider request file suite exercised (alias filter + full file)

## Outcome

| Item | Status |
|------|--------|
| snake_case alias coverage | GREEN |
| camelCase alias coverage | GREEN |
| Production changes | none |
| Observable normalization (trim) | asserted |
| Full providerRequests.test.ts | 53/53 GREEN |
