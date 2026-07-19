# Task 4 report: Auth Files plan-expiry sorting

## Summary

Auth Files now accepts and persists `expiry-asc` / `expiry-desc` sort modes. Ordering uses `CODEX_CONFIG.getPlanExpiryAtMs` with the existing `getDisplayCodexQuota(file)` display path (known finite first, direction, case-insensitive filename fallback). Plan-rank sorting and other modes are unchanged.

## Scope completed

- `uiState.ts`: `AUTH_FILES_SORT_MODES` includes `expiry-asc` / `expiry-desc` (normalization/persistence via existing set).
- `AuthFilesPage.tsx`: both sort options wired to `auth_files.sort_expiry_*` keys; comparator branch mirrors generic `QuotaSection` expiry logic via config accessor + display helper.
- Tests: `uiState.test.ts` normalize coverage; `AuthFilesPage.pasteIntegration.test.tsx` expanded sort-mode mock + UI ordering test (two finite Codex expiries + missing Codex + non-Codex).

## Production change

### UI state

```ts
// AUTH_FILES_SORT_MODES
'expiry-asc',
'expiry-desc',
```

Legacy plan/priority mappings untouched. Unknown values still normalize to `null` (no accidental default write).

### Sort options

```ts
{ value: 'expiry-asc', label: t('auth_files.sort_expiry_asc') },
{ value: 'expiry-desc', label: t('auth_files.sort_expiry_desc') },
```

Locale strings intentionally **not** added in this task (assignment constraint: no localization edits; Task 6 owns i18n).

### Comparator (`AuthFilesPage` `sorted` memo)

Placed next to plan-tier branch. Does **not** re-parse timestamps on the page:

1. `CODEX_CONFIG.getPlanExpiryAtMs?.(file, getDisplayCodexQuota(file))`.
2. Known = `Number.isFinite(expiry)` only (`null` / `undefined` / `NaN` / `±Infinity` missing).
3. Missing always after known (both directions).
4. `expiry-asc`: earliest first; `expiry-desc`: latest first.
5. Equal known / all missing → `compareAuthFileName`.

Identity-scoped API quota + observed header merge stay on `getDisplayCodexQuota`; plan-rank calculation untouched.

## TDD evidence

### RED (before production change)

Command:

```sh
cd apps/web && bunx vitest run src/features/authFiles/uiState.test.ts src/features/authFiles/AuthFilesPage.pasteIntegration.test.tsx
```

Result:

- 2 failed | 13 passed (15 total)
- Files: both test files failed

Representative failures:

```text
normalizes persisted sort modes
  expected null to be 'expiry-asc'

orders Codex rows by plan expiry with missing last in both directions
  expected [ 'zebra-codex.json::z', … ] to deeply equal [ 'early-codex.json::e', … ]
```

### GREEN (after production change)

Command:

```sh
cd apps/web && bunx vitest run src/features/authFiles/uiState.test.ts src/features/authFiles/AuthFilesPage.pasteIntegration.test.tsx
```

Result: **15 passed / 0 failed** (2 files).

## Tests added/updated

### `uiState.test.ts`

- Asserts `expiry-asc` / `expiry-desc` normalize as themselves.
- Keeps legacy `priority` → `priority-desc` mapping and `plan-*` modes.
- Unknown still `null`.

### `AuthFilesPage.pasteIntegration.test.tsx`

1. **Sort-mode mock expanded** so `normalizeAuthFilesSortMode` accepts the full Auth Files mode set including both expiry modes (narrow previous mock only allowed `default`).
2. **`orders Codex rows by plan expiry with missing last in both directions`**
   - Seeds store quotas:
     - `early-codex.json` → `2026-03-01T00:00:00.000Z`
     - `late-codex.json` → `2026-09-01T00:00:00.000Z`
     - `zebra-codex.json` → `null` (missing)
     - `alpha-qwen.json` → non-Codex (missing)
   - `expiry-asc` order: early → late → alpha-qwen → zebra
   - `expiry-desc` order: late → early → alpha-qwen → zebra
   - Missing/non-Codex stay last in **both** directions; among missing, filename tie-break (`alpha` before `zebra`).

## Files touched

| File | Change |
|---|---|
| `apps/web/src/features/authFiles/uiState.ts` | Add expiry modes to `AUTH_FILES_SORT_MODES` |
| `apps/web/src/features/authFiles/AuthFilesPage.tsx` | Sort options + expiry comparator via `CODEX_CONFIG` + `getDisplayCodexQuota` |
| `apps/web/src/features/authFiles/uiState.test.ts` | Persist/normalize coverage for expiry modes |
| `apps/web/src/features/authFiles/AuthFilesPage.pasteIntegration.test.tsx` | Sort mock expand + UI ordering test |

## Explicitly not changed

- Localization files (`en`/`ru`/`zh-CN`/`zh-TW`)
- Provider request tests / request normalization
- Plan-rank calculation / plan sort modes
- Duplicate Codex timestamp parser on Auth Files page
- Formatters, linters, project-wide suites

## Concerns

- Sort option labels resolve to raw i18n keys until Task 6 adds `auth_files.sort_expiry_asc` / `sort_expiry_desc` strings (same pattern as Task 3 quota management keys).
- Paste harness still mocks `uiState` rather than importing production `AUTH_FILES_SORT_MODES`; mock set must stay in sync if modes are added later (acceptable for this isolated harness).

## Verification performed

Focused Auth Files tests only (RED then GREEN). No type-check / full suite / browser smoke in this task scope.
