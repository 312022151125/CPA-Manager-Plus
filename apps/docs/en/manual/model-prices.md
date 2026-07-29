---
title: Model Prices And Cost Estimation
description: Configure model prices, service tiers, long-context multipliers, and cache read/write/creation billing for local CPAMP cost estimates.
---

# Model Prices And Cost Estimation

Model Prices maintains CPAMP's local cost-estimation rules. It affects Dashboard, Monitoring, and Usage Analytics; it does not change provider billing or CPA routing.

Open the [Model Prices Demo](https://seakee.github.io/CPA-Manager-Plus/#/demo/model-prices) to inspect fictional prices and model usage.

## Price Sources

- Public metadata synchronized from models.dev first, with LiteLLM and OpenRouter used as fallbacks when the preferred source is unavailable or lacks a model.
- Local prices added or overridden by the user.
- Entries for aliases, internal names, or provider-specific variants.

Synchronization only occurs when the user triggers it and may use the current Manager Server proxy configuration.

The same models.dev model ID may be offered by multiple providers, and a real model ID may itself contain `/`. CPAMP compares source identities separately from original model IDs and only matches automatically when the complete pricing metadata, including tiers and experimental-mode prices, is consistent. Identity or price conflicts remain in the candidate-confirmation flow; a same-named LiteLLM or OpenRouter entry cannot bypass that conflict.

The current sync maps models.dev `cost.input`, `cost.output`, `cost.cache_read`, and `cost.cache_write`. The complete model object remains available in the raw metadata, including `cost.tiers`, Fast Mode, and reasoning fields, but those advanced fields are not yet converted automatically into CPAMP billing rules.

## Supported Billing Semantics

A price rule may include:

- Input and output tokens.
- Reasoning tokens.
- Cache read, cache write, and cache creation.
- Fixed per-request cost.
- `service_tier` differences.
- Long-context thresholds and multipliers.
- Model alias and billing-model mapping.

Models such as GPT-5.6 may vary by context length, service tier, and cache type. CPAMP can only apply a rule when both the request event and price entry contain the required fields.

## Matching Model Names

The client model, CPA alias, provider model, and price-table name may differ. When cost is missing:

1. Inspect the event model and billing model in [Monitoring](./monitoring.md).
2. Search for matching entries in Model Prices.
3. Add a local alias or override when required.
4. Refresh [Usage Analytics](./usage-analytics.md).

## Usage Summary

The page uses a compact model-usage summary to show which prices are active. It does not download full request history just to count model calls.

## Accuracy Boundaries

- Provider billing remains authoritative.
- Missing token, service tier, long-context, or cache fields reduce estimate accuracy.
- Subscriptions, grants, tiered prices, and multiple currencies may not fit a single price entry.
- Historical cost may be displayed using current prices after an update; the price table is not an immutable billing snapshot.
