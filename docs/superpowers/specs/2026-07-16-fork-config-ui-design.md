# Fork Config UI Coverage Design

## Goal

Update CPA Manager Plus web UI to expose all configuration supported by the forked `CLIProxyAPI/config.example.yaml`, including `ai-providers` and related provider editors, while retaining raw YAML editing for arbitrary values.

## Scope

### Global config editor

Extend `useVisualConfig`, `VisualConfigValues`, validation, translations, and `VisualConfigEditor` to cover every fork-supported scalar and nested setting currently absent from the visual UI, including:

- retry and cooldown controls, including OpenAI-compatible 429 key rotation;
- Codex fast service tier;
- OAuth model aliases and excluded models;
- plugin store/config values, with a structured escape hatch for arbitrary plugin config payloads;
- all existing fork additions under TLS, remote management, pprof, routing, streaming, quota, headers, image/video, and signature settings.

YAML remains source of truth. Loading reads the fork keys. Saving applies only dirty paths to the latest YAML document, preserving comments, ordering where `yaml` permits it, unknown keys, and unrelated plugin/provider data.

### AI provider editors

Extend existing provider drawers and shared types rather than creating a second provider system. Cover fork fields for Gemini, Interactions, Codex, xAI, Claude, Vertex, and OpenAI-compatible providers:

- provider/key metadata, prefixes, priorities, auth indexes, base URLs, proxies, headers, cooling, and websocket flags;
- Claude cloak settings, CCH signing, and system-message rebuilding;
- OpenAI-compatible disabled, force-balance, Responses passthrough/websocket/compaction, and cooling settings;
- model display names, image capability, input/output modalities, thinking levels, force mapping, and aliases;
- per-key proxy/header fields.

Provider API normalization and serializers must merge known edited fields into raw records so unsupported/forward-compatible fields survive saves.

### OAuth config

Expose global `oauth-model-alias` and `oauth-excluded-models` in the visual config flow, preserving provider names, entry order, optional `fork`, and `force-mapping` values.

## Data flow

1. Fetch `/config.yaml` for global visual editing.
2. Parse fork YAML into typed visual values plus preserved raw document.
3. Track dirty fields at scalar, nested collection, and provider/OAuth entry boundaries.
4. Apply dirty values to the latest YAML document and save through `/config.yaml`.
5. Continue using existing provider endpoints/drawers for provider list editing, with raw-field-preserving serializers and cache updates.
6. Source editor remains available for plugin-specific schemas and future fork fields.

## Validation and error handling

- Keep existing numeric and enum validation patterns.
- Validate URLs/addresses only where current UI already treats them as typed fields; do not reject valid fork extensions.
- Never overwrite secrets unless the user explicitly changes them.
- Preserve unknown YAML/provider fields on partial saves.
- On malformed YAML, keep source editor available and disable visual save with the existing parse error path.
- Surface provider API failures using existing notification/drawer error handling.

## Verification

- Add a fork-config fixture test that loads `config.example.yaml` and asserts every supported visual field/path.
- Add round-trip tests for every new global field, verifying exact YAML paths and preservation of unrelated comments/unknown keys.
- Add provider normalization/serialization tests for every newly exposed provider/model field.
- Run targeted web tests and TypeScript checks.
- Browser-smoke Config and AI Providers: edit representative global, OAuth, provider, model, and per-key values; save; reload; verify persistence.

## Deliberate simplifications

- No generated schema engine: existing typed editors provide better UX and safer validation.
- No replacement of raw YAML editing: arbitrary plugin config cannot have a stable UI schema.
- No new dependency: existing React, YAML, provider API, and test tooling are sufficient.
