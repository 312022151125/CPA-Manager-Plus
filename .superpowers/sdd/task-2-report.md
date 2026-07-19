# Task 2 report: session-only Codex subscription expiry

## Summary

Codex `subscriptionActiveUntil` stays live in memory for the current browser session, but is stripped at the persistence boundary so new writes omit it and legacy localStorage payloads cannot rehydrate it.

## Scope completed

- Updated `filterPersistableCodexQuota` in `apps/web/src/stores/useQuotaStore.ts` to copy eligible manual success records without `subscriptionActiveUntil`.
- Left `partialize` / `merge` callers unchanged; both already route through that helper.
- Left live `setCodexQuota`, cache-generation guards, loader/failure paths, and non-Codex persistence untouched.
- No UI sort, localization, or second-cache changes.

## Production change

`filterPersistableCodexQuota` still filters to:

- `status === 'success'`
- `observedFromUsageHeaders !== true`

Then maps each kept record through destructuring:

```ts
const { subscriptionActiveUntil: _omit, ...persistable } = item;
return [key, persistable];
```

Effects:

| Path | Behavior |
|---|---|
| Live `setCodexQuota` | retains expiry |
| `partialize` write | omits expiry from eligible records |
| `merge` rehydration | strips expiry from legacy records; still drops observed-header entries |

## TDD evidence

### RED (before production change)

Command:

```sh
cd apps/web && bunx vitest run src/stores/useQuotaStore.test.ts
```

Result:

- 2 new tests failed
- existing 4 tests still passed
- Failure assertion: persisted/rehydrated records still had `subscriptionActiveUntil`

Representative failure:

```text
FAIL  src/stores/useQuotaStore.test.ts > useQuotaStore persistence > keeps subscription expiry live while omitting it from persisted cache writes
AssertionError: expected { Object (status, windows, ...) } to not have property "subscriptionActiveUntil"
```

### GREEN (after production change)

Command:

```sh
cd apps/web && bunx vitest run src/stores/useQuotaStore.test.ts
```

Result:

```text
Test Files  1 passed (1)
     Tests  6 passed (6)
```

## Tests added

In `apps/web/src/stores/useQuotaStore.test.ts`:

1. **`keeps subscription expiry live while omitting it from persisted cache writes`**
   - Sets a manual success Codex quota with `subscriptionActiveUntil`
   - Asserts live store retains the value
   - Asserts obfuscated persisted cache record omits the property while keeping other success fields

2. **`strips legacy subscription expiry during rehydration`**
   - Seeds obfuscated storage with a legacy payload containing expiry on manual success and observed-header success rows
   - Imports store fresh
   - Asserts only the manual success row hydrates, without `subscriptionActiveUntil`
   - Asserts observed-header row still filtered out
   - Asserts `cacheScope` still restores from persisted state

## Self-review

- No second cache introduced.
- No change to cache-generation / scope-clear behavior.
- No UI sort or i18n consumer edits.
- Persistence still limited to manually fetched Codex success states.
- Expiry omission is a copy, not a mutation of live state objects.

## Commit

- Branch: `quota-plan-expiry-sort`
- Message: `fix(web): strip Codex subscription expiry from persisted quota cache`

## Not run (per brief)

- Formatters
- Linters
- Project-wide suites
- Type-check / browser smoke (belong to later verification steps / other tasks)

## Concerns

- None blocking. Destructured `_omit` is intentional discard; if lint later flags unused binding, rename to a voided binding without changing behavior.
