# Task 5 Report: Expiry localization strings

## Status
Complete.

## Changes
- Added `sort_expiry_asc` and `sort_expiry_desc` under `auth_files` and `quota_management` in:
  - `apps/web/src/i18n/locales/en.json`
  - `apps/web/src/i18n/locales/ru.json`
  - `apps/web/src/i18n/locales/zh-CN.json`
  - `apps/web/src/i18n/locales/zh-TW.json`
- `codex_quota.subscription_expiry_label` was already present in all four locale files (`Plan expires`, `Срок тарифа`, `套餐到期`, `方案到期`); no duplicate or unrelated translation was added.

## Verification
Command:
```text
cd apps/web && bun -e "for (const f of ['en','ru','zh-CN','zh-TW']) { const p = 'src/i18n/locales/' + f + '.json'; JSON.parse(await Bun.file(p).text()); console.log(f + '.json: valid JSON'); }"
```
Output:
```text
en.json: valid JSON
ru.json: valid JSON
zh-CN.json: valid JSON
zh-TW.json: valid JSON
```

Focused test:
```text
cd apps/web && bunx vitest run src/components/quota/quotaConfigs.test.ts
```
Result: 1 file passed, 16 tests passed.

## Scope
Only the four requested locale JSON files were changed for translations, plus this required report.

## Concerns
None. Subscription-expiry label already existed in all four locales; only missing sort labels required edits.
