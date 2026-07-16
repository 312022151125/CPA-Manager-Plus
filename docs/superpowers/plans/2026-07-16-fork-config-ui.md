# Fork Config UI Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CPA Manager Plus visual configuration and AI provider editors cover all fields in the forked `CLIProxyAPI/config.example.yaml` without destroying unknown YAML/provider fields.

**Architecture:** Keep `/config.yaml` as canonical storage for global settings and extend `useVisualConfig` with typed values plus dirty-path YAML patching. Keep existing provider endpoints/drawers for credential/provider editing, extending their types and raw-field-preserving serializers. Use structured dynamic editors only where fork config is intentionally arbitrary, such as plugin configs.

**Tech Stack:** React, TypeScript, YAML AST (`yaml`), Zustand, i18next, Vitest, existing provider API/drawer components.

## Global Constraints

- Reuse existing ConfigPage, VisualConfigEditor, provider drawers, API services, and YAML AST patching.
- No new dependencies.
- Preserve comments, unknown YAML keys, unknown provider fields, and secrets unless explicitly edited.
- Keep source YAML editor available as escape hatch.
- New non-trivial behavior requires a failing targeted test before implementation.

---

### Task 1: Establish fork configuration coverage fixture

**Files:**
- Create: `apps/web/src/hooks/fixtures/cliproxy-fork-config.example.yaml`
- Modify: `apps/web/src/hooks/useVisualConfig.test.ts`
- Modify: `apps/web/src/types/visualConfig.ts`

**Interfaces:**
- Consumes `useVisualConfig.loadVisualValuesFromYaml()`.
- Produces a fixture-backed list of fork paths that visual parsing and round-trip tests must cover.

- [ ] Copy the referenced fork example YAML into the web test fixture without secrets beyond the example placeholders.
- [ ] Add a failing test that loads the fixture and asserts current missing fields are represented after the model is extended: `openaiCompat429KeyRotation`, `fastServiceTier`, OAuth aliases, OAuth exclusions, and plugin configs.
- [ ] Add a failing round-trip test that changes each new value, applies changes, parses YAML, and asserts exact fork key paths while an unknown key/comment remains unchanged.
- [ ] Run `npm --prefix apps/web test -- useVisualConfig.test.ts`; expected failure must identify absent fields or parser/writer support.

### Task 2: Extend global visual config model and YAML round-trip

**Files:**
- Modify: `apps/web/src/types/visualConfig.ts`
- Modify: `apps/web/src/hooks/useVisualConfig.ts`
- Modify: `apps/web/src/hooks/useVisualConfig.test.ts`

**Interfaces:**
- `VisualConfigValues` gains typed values for `openaiCompat429KeyRotation`, `fastServiceTier`, OAuth alias entries, OAuth exclusion lists, and plugin config text/object state.
- `loadVisualValuesFromYaml(yamlContent)` parses fork keys.
- `applyVisualChangesToYaml(currentYaml)` writes only dirty paths.

- [ ] Define minimal types for OAuth alias entries and plugin config records; include optional `fork` and `forceMapping`.
- [ ] Implement parser defaults matching `config.example.yaml` and preserve absent-vs-default semantics.
- [ ] Extend dirty-field tracking for scalar, OAuth collection, and plugin collection edits.
- [ ] Write YAML paths `openai-compat-429-key-rotation`, `fast-service-tier`, `oauth-model-alias`, `oauth-excluded-models`, and `plugins.configs` only when changed.
- [ ] Preserve unrelated YAML nodes and unknown plugin/provider fields.
- [ ] Run fixture and round-trip tests; expected PASS.

### Task 3: Add global visual controls and translations

**Files:**
- Modify: `apps/web/src/components/config/VisualConfigEditor.tsx`
- Modify: `apps/web/src/components/config/VisualConfigEditorBlocks.tsx`
- Modify: `apps/web/src/components/config/VisualConfigEditor.module.scss`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/zh-CN.json`
- Modify: `apps/web/src/i18n/locales/zh-TW.json`
- Modify: `apps/web/src/i18n/locales/ru.json`

**Interfaces:**
- Existing `VisualConfigEditor` receives the extended `VisualConfigValues` and emits partial patches.
- New OAuth/plugin controls use existing list editors and `FieldShell` patterns.

- [ ] Add controls for 429 key rotation and Codex fast service tier in Network.
- [ ] Add OAuth alias list editor with provider, name, alias, fork, and force-mapping fields.
- [ ] Add OAuth excluded-model lists grouped by provider.
- [ ] Add plugin config editor that accepts valid JSON/YAML object text and reports parse errors without dropping data.
- [ ] Add all labels, hints, and validation messages in each supported locale, using English fallback only where existing locale policy permits.
- [ ] Add component tests for adding/removing OAuth entries and invalid plugin config input.
- [ ] Run targeted component tests and TypeScript check.

### Task 4: Extend provider types, normalization, and serialization

**Files:**
- Modify: `apps/web/src/types/provider.ts`
- Modify: `apps/web/src/types/config.ts`
- Modify: `apps/web/src/components/providers/types.ts`
- Modify: `apps/web/src/services/api/providers.ts`
- Modify: `apps/web/src/services/api/transformers.ts`
- Modify: `apps/web/src/services/api/providers.test.ts`

**Interfaces:**
- Provider model types expose `displayName`, `fork`, and existing fork modalities/thinking fields.
- Provider forms expose OpenAI-compatible response flags/force-balance/disabled and Claude CCH/cache fields.
- Existing `mergeKnownFields` logic remains the raw-field preservation boundary.

- [ ] Add exact camelCase types for every fork provider/model/key field currently represented only through index signatures or omitted types.
- [ ] Add those keys to normalization field lists and serializers using existing hyphenated YAML/API aliases.
- [ ] Ensure omitted fields remain omitted, while explicit false/empty edits serialize intentionally.
- [ ] Add failing tests proving all new fields normalize and serialize, and unknown fields survive a partial edit.
- [ ] Run provider API tests; expected PASS.

### Task 5: Extend AI provider drawers/forms

**Files:**
- Modify: `apps/web/src/components/providers/ProviderEditDrawer/GeminiEditDrawer.tsx`
- Modify: `apps/web/src/components/providers/ProviderEditDrawer/CodexEditDrawer.tsx`
- Modify: `apps/web/src/components/providers/ProviderEditDrawer/ClaudeEditDrawer.tsx`
- Modify: `apps/web/src/components/providers/ProviderEditDrawer/VertexEditDrawer.tsx`
- Modify: `apps/web/src/components/providers/ProviderEditDrawer/OpenAIEditDrawer.tsx`
- Modify: `apps/web/src/features/aiProviders/AiProvidersOpenAIEditLayout.tsx`
- Modify: `apps/web/src/components/providers/ProviderEditDrawer/index.ts`
- Modify: provider drawer tests where present; add focused tests beside existing drawer tests when absent.

**Interfaces:**
- Existing drawer save handlers continue calling `providersApi`; only form state and serialized payloads expand.
- Existing model/header/key list components remain UI primitives.

- [ ] Add provider/key controls for xAI websockets, Claude rebuild/CCH/cloak cache fields, and all omitted cooling/auth/proxy/header fields.
- [ ] Add OpenAI-compatible disabled, force-balance, Responses passthrough/websocket/compaction controls.
- [ ] Extend model rows for display name, image, input/output modalities, thinking levels, force mapping, and fork where applicable.
- [ ] Keep secret masking and explicit-edit semantics intact.
- [ ] Add failing behavior tests for representative fields per provider family, then implement minimal form/save changes.
- [ ] Run provider drawer tests and TypeScript check.

### Task 6: Integrate OAuth/global advanced config into ConfigPage

**Files:**
- Modify: `apps/web/src/features/config/ConfigPage.tsx`
- Modify: `apps/web/src/entities/config/sections.ts`
- Modify: `apps/web/src/types/config.ts`
- Modify: `apps/web/src/stores/useConfigStore.ts`
- Modify: `apps/web/src/features/authFiles/AuthFilesPage.tsx` only if existing OAuth aliases/exclusions need shared refresh behavior.

**Interfaces:**
- ConfigPage continues using `useVisualConfig`; store section mappings remain compatible with provider pages.
- OAuth edits refresh affected config/provider caches without requiring a full logout/reconnect.

- [ ] Add any missing raw-section aliases and normalized config fields required by the new visual controls.
- [ ] Ensure provider pages observe OAuth/global updates after save.
- [ ] Add regression test for cache refresh and no stale provider data after OAuth config save.
- [ ] Run targeted config/store tests.

### Task 7: End-to-end verification and cleanup

**Files:**
- Modify tests only where failures expose a real contract gap.
- No new abstraction or documentation files beyond this plan/spec.

- [ ] Run focused web tests for `useVisualConfig`, provider API serialization, ConfigPage, and provider drawers.
- [ ] Run web TypeScript check and lint.
- [ ] Start the web app and smoke-test Config visual/source tabs plus AI Providers drawers in browser.
- [ ] Load the fork fixture, edit representative global/OAuth/provider/model/per-key settings, save, reload, and verify persistence.
- [ ] Remove temporary debug code and confirm source editor still preserves unknown fields.
- [ ] Commit implementation in focused commits.
