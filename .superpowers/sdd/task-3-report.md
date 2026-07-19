# Task 3 report: generic quota expiry sorting

## Summary

Generic `/quota` UI now offers `expiry-asc` / `expiry-desc` sort modes. `QuotaSection` orders via optional `config.getPlanExpiryAtMs` on already-resolved display quota (known finite first, direction, filename fallback). `quotaPageUiState` persists both modes; providers without the accessor keep deterministic filename order.

## Scope completed

- `QuotaSection.tsx`: `expiry-asc` / `expiry-desc` comparator using `getPlanExpiryAtMs` + display quota.
- `QuotaPage.tsx`: both sort options wired to `quota_management.sort_expiry_*` keys.
- `quotaPageUiState.ts`: `QUOTA_SORT_MODE_SET` accepts both expiry modes.
- Tests: `QuotaSection.test.tsx` expiry ordering suite; `quotaPageUiState.test.ts` normalize/persist coverage.

## Production change

### Comparator (`QuotaSection`)

Mirrors plan-tier known-first pattern:

1. Call `config.getPlanExpiryAtMs?.(file, getDisplayQuota(file))`.
2. Known = non-null finite number from accessor.
3. Missing always after known (both directions).
4. `expiry-asc`: earliest first; `expiry-desc`: latest first.
5. Equal known / all missing → `compareFileName`.

Also early-return after plan branch (behavior-identical; avoids accidental fall-through if more modes are added later).

### UI state

`QUOTA_SORT_MODE_SET` now includes `expiry-asc` and `expiry-desc`. Unknown values still normalize to `default`.

### QuotaPage options

```ts
{ value: 'expiry-asc', label: t('quota_management.sort_expiry_asc') },
{ value: 'expiry-desc', label: t('quota_management.sort_expiry_desc') },
```

Locale strings intentionally **not** added in this task (assignment constraint: no localization sort-string edits; Task 6 owns i18n).

## TDD evidence

### RED (before production change)

Command:

```sh
cd apps/web && bunx vitest run src/components/quota/QuotaSection.test.tsx src/features/quota/quotaPageUiState.test.ts
```

Result:

- 5 new assertions failed / 13 passed (18 total)
- Files: both test files failed

Representative failures:

```text
QuotaSection expiry sorting > sorts known expiries ascending...
  expected [ 'zebra.json', 'mid-b.json', … ] to deeply equal [ 'early.json', 'mid-a.json', … ]

normalizeQuotaSortMode('expiry-asc') → expected 'default' to be 'expiry-asc'
```

### GREEN (after production change)

Command:

```sh
cd apps/web && bunx vitest run src/components/quota/QuotaSection.test.tsx src/features/quota/quotaPageUiState.test.ts
```

Result: all focused tests passed (`rtk err` clean).

## Tests added

In `apps/web/src/components/quota/QuotaSection.test.tsx`:

1. **Harness**: `renderSection` accepts `sortMode` / `viewMode` / `accountDisplayMode`; `getCardFileNames` reads `QuotaCard` order.
2. **`sorts known expiries ascending with missing last and filename ties`**
   - early < mid-a < mid-b < late < zebra(missing)
3. **`sorts known expiries descending with missing last and filename ties`**
   - late > mid-a > mid-b > early > zebra(missing)
4. **`falls back to filename order when config lacks getPlanExpiryAtMs`**
   - pure `compareFileName` under expiry mode

In `apps/web/src/features/quota/quotaPageUiState.test.ts`:

1. `normalizeQuotaSortMode('expiry-asc'|'expiry-desc')` keeps values.
2. **`persists valid expiry sort modes and rejects unknown`** via `normalizeQuotaPageUiState` (`expiry-soonest` → `default`).

## Self-review

- No duplicate parsing in UI; only optional config accessor.
- Plan-tier ordering untouched.
- Auth Files and locale files untouched per brief.
- Uses already-resolved `getDisplayQuota` (API + observed merge path preserved).
- No new cache/component/CSS.

## Commit

- Branch: `quota-plan-expiry-sort`
- See git log for `feat(web): add generic quota plan-expiry sort modes` after this report lands with code.

## Not run (per brief)

- Formatters
- Linters
- Project-wide suites
- Auth Files expiry ordering (Task 5)
- Localization of `sort_expiry_*` (later i18n task)

## Concerns

- `quota_management.sort_expiry_asc` / `sort_expiry_desc` keys will show raw i18n keys until locale files updated.
- Plan-branch early `return` is a tiny structural tweak beyond the minimum expiry branch; equivalent for existing modes.
