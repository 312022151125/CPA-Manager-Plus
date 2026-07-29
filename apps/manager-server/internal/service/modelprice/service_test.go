package modelprice

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/testutil"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func TestFetchModelsDevModelPrices(t *testing.T) {
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"provider-a": {"models": {
				"shared-model": {"name":"Shared A", "cost":{"input":1,"output":2,"cache_read":0.1,"cache_write":0.2,"tiers":[{"input":3,"output":4,"tier":{"type":"context","size":200000}}]}},
				"unique-model": {"cost":{"input":3,"output":4}}
			}},
			"provider-b": {"models": {
				"shared-model": {"cost":{"input":1.5,"output":2.5,"cache_read":0.15,"cache_write":0.25}},
				"same-rule": {"cost":{"input":5,"output":6}}
			}},
			"provider-c": {"models": {
				"same-rule": {"cost":{"output":6,"input":5}}
			}},
			"provider-empty": {"models": {"uncosted": {"limit":{"context":1000}}}}
		}`))
	}))
	t.Cleanup(source.Close)

	prices, skipped, err := fetchModelsDevModelPrices(context.Background(), source.URL, source.Client())
	if err != nil {
		t.Fatalf("fetch models.dev prices: %v", err)
	}
	if skipped != 1 {
		t.Fatalf("skipped = %d", skipped)
	}

	shared, ok := prices["provider-a/shared-model"]
	if !ok {
		t.Fatalf("missing provider-scoped model: %#v", prices)
	}
	if shared.Prompt != 1 || shared.Completion != 2 || shared.CacheRead != 0.1 || shared.CacheCreation != 0.2 ||
		!shared.PromptConfigured || !shared.CompletionConfigured || !shared.CacheReadConfigured || !shared.CacheCreationConfigured {
		t.Fatalf("base price mapping = %#v", shared)
	}
	if shared.Source != SyncSourceModelsDev || shared.SourceModelID != "provider-a/shared-model" {
		t.Fatalf("source metadata = %#v", shared)
	}
	if !strings.Contains(shared.RawJSON, `"tiers"`) {
		t.Fatalf("raw model metadata was not retained: %s", shared.RawJSON)
	}

	for _, alias := range []string{"shared-model", "unique-model", "same-rule"} {
		if _, ok := prices[alias]; ok {
			t.Fatalf("fetch catalog unexpectedly materialized alias %q: %#v", alias, prices[alias])
		}
	}
	selection := selectModelPrices(prices, []string{"unique-model", "same-rule"})
	unique, ok := selection.Prices["unique-model"]
	if !ok || unique.SourceModelID != "provider-a/unique-model" {
		t.Fatalf("unique alias = %#v", unique)
	}
	sameRule, ok := selection.Prices["same-rule"]
	if !ok || sameRule.SourceModelID != "provider-b/same-rule" {
		t.Fatalf("same-rule alias = %#v", sameRule)
	}
	if len(selection.Candidates) != 0 || len(selection.Unmatched) != 0 {
		t.Fatalf("unexpected selection result = %#v", selection)
	}
}

func TestModelsDevPriceCacheReusesETagConcurrently(t *testing.T) {
	const etag = `"catalog-v1"`
	var requestCount atomic.Int32
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestNumber := requestCount.Add(1)
		if requestNumber == 1 {
			if received := r.Header.Get("If-None-Match"); received != "" {
				http.Error(w, "unexpected conditional request", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("ETag", etag)
			_, _ = w.Write([]byte(`{
				"provider-a":{"models":{
					"cached":{"cost":{"input":1,"output":2}},
					"uncosted":{"limit":{"context":1000}}
				}}
			}`))
			return
		}
		if received := r.Header.Get("If-None-Match"); received != etag {
			http.Error(w, "missing cache validator", http.StatusPreconditionFailed)
			return
		}
		w.Header().Set("ETag", etag)
		w.WriteHeader(http.StatusNotModified)
	}))
	t.Cleanup(source.Close)

	cache := &modelsDevPriceCache{}
	prices, skipped, err := cache.fetch(context.Background(), source.URL, source.Client())
	if err != nil {
		t.Fatalf("prime models.dev cache: %v", err)
	}
	if skipped != 1 || prices["provider-a/cached"].Prompt != 1 {
		t.Fatalf("primed prices = %#v, skipped = %d", prices, skipped)
	}

	const workers = 8
	type fetchResult struct {
		prices  map[string]store.ModelPrice
		skipped int
		err     error
	}
	results := make(chan fetchResult, workers)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cachedPrices, cachedSkipped, fetchErr := cache.fetch(context.Background(), source.URL, source.Client())
			results <- fetchResult{prices: cachedPrices, skipped: cachedSkipped, err: fetchErr}
		}()
	}
	wg.Wait()
	close(results)
	for result := range results {
		if result.err != nil {
			t.Fatalf("reuse models.dev cache: %v", result.err)
		}
		if result.skipped != 1 || result.prices["provider-a/cached"].Completion != 2 {
			t.Fatalf("cached prices = %#v, skipped = %d", result.prices, result.skipped)
		}
	}
	if got := requestCount.Load(); got != workers+1 {
		t.Fatalf("request count = %d", got)
	}
}

func TestModelsDevPriceCacheDoesNotServeStaleDataAndInvalidatesURL(t *testing.T) {
	var invalidResponse atomic.Bool
	firstSource := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if invalidResponse.Load() {
			w.Header().Set("ETag", `"catalog-v2"`)
			_, _ = w.Write([]byte(`{"provider-a":`))
			return
		}
		w.Header().Set("ETag", `"catalog-v1"`)
		_, _ = w.Write([]byte(`{"provider-a":{"models":{"cached":{"cost":{"input":1}}}}}`))
	}))
	t.Cleanup(firstSource.Close)

	cache := &modelsDevPriceCache{}
	if _, _, err := cache.fetch(context.Background(), firstSource.URL, firstSource.Client()); err != nil {
		t.Fatalf("prime models.dev cache: %v", err)
	}
	invalidResponse.Store(true)
	prices, skipped, err := cache.fetch(context.Background(), firstSource.URL, firstSource.Client())
	if err == nil || prices != nil || skipped != 0 {
		t.Fatalf("stale cache served after parse failure: prices=%#v skipped=%d err=%v", prices, skipped, err)
	}

	secondSource := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if received := r.Header.Get("If-None-Match"); received != "" {
			http.Error(w, "etag leaked across URLs", http.StatusPreconditionFailed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("ETag", `"other-catalog"`)
		_, _ = w.Write([]byte(`{"provider-b":{"models":{"fresh":{"cost":{"input":9}}}}}`))
	}))
	t.Cleanup(secondSource.Close)

	prices, skipped, err = cache.fetch(context.Background(), secondSource.URL, secondSource.Client())
	if err != nil {
		t.Fatalf("fetch changed models.dev URL: %v", err)
	}
	if skipped != 0 || prices["provider-b/fresh"].Prompt != 9 {
		t.Fatalf("changed URL prices = %#v, skipped = %d", prices, skipped)
	}
}

func TestModelsDevCacheFailureFallsBackWithoutStalePrices(t *testing.T) {
	var invalidResponse atomic.Bool
	modelsDev := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if invalidResponse.Load() {
			w.Header().Set("ETag", `"catalog-v2"`)
			_, _ = w.Write([]byte(`{"openai":`))
			return
		}
		w.Header().Set("ETag", `"catalog-v1"`)
		_, _ = w.Write([]byte(`{"openai":{"models":{"gpt-test":{"cost":{"input":9,"output":10}}}}}`))
	}))
	t.Cleanup(modelsDev.Close)

	var liteLLMRequests atomic.Int32
	liteLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		liteLLMRequests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"gpt-test":{"input_cost_per_token":0.000001,"output_cost_per_token":0.000002}}`))
	}))
	t.Cleanup(liteLLM.Close)

	modelsDevURL := modelsDev.URL
	liteLLMURL := liteLLM.URL
	service := NewMultiSourceWithModelsDev(nil, &modelsDevURL, &liteLLMURL, nil)
	prices, _, sources, _, err := service.fetchAllModelPrices(context.Background(), modelsDev.Client(), []string{"gpt-test"})
	if err != nil {
		t.Fatalf("prime models.dev source: %v", err)
	}
	if len(sources) != 1 || sources[0] != SyncSourceModelsDev || prices["openai/gpt-test"].Prompt != 9 {
		t.Fatalf("primed sources = %#v, prices = %#v", sources, prices)
	}
	if got := liteLLMRequests.Load(); got != 0 {
		t.Fatalf("LiteLLM requests during prime = %d", got)
	}

	invalidResponse.Store(true)
	prices, _, sources, sourceResults, err := service.fetchAllModelPrices(context.Background(), modelsDev.Client(), []string{"gpt-test"})
	if err != nil {
		t.Fatalf("fallback after models.dev failure: %v", err)
	}
	if len(sources) != 1 || sources[0] != SyncSourceLiteLLM {
		t.Fatalf("fallback sources = %#v", sources)
	}
	if len(sourceResults) != 2 || sourceResults[0].Source != SyncSourceModelsDev || sourceResults[0].Error == "" || sourceResults[1].Source != SyncSourceLiteLLM {
		t.Fatalf("fallback source results = %#v", sourceResults)
	}
	price := prices["gpt-test"]
	if price.Source != SyncSourceLiteLLM || price.Prompt != 1 {
		t.Fatalf("fallback price = %#v", price)
	}
	if _, exists := prices["openai/gpt-test"]; exists {
		t.Fatalf("stale models.dev price was reused: %#v", prices)
	}
}

func TestSelectModelPricesRequiresConfirmationForScopedIdentityCollision(t *testing.T) {
	prices := map[string]store.ModelPrice{
		"openai/gpt-test": {
			Prompt:           1,
			Completion:       2,
			Source:           SyncSourceModelsDev,
			SourceModelID:    "openai/gpt-test",
			RawJSON:          `{"cost":{"input":1,"output":2}}`,
			PromptConfigured: true,
		},
		"crossmodel/openai/gpt-test": {
			Prompt:           3,
			Completion:       4,
			Source:           SyncSourceModelsDev,
			SourceModelID:    "crossmodel/openai/gpt-test",
			RawJSON:          `{"cost":{"input":3,"output":4}}`,
			PromptConfigured: true,
		},
	}

	selection := selectModelPrices(prices, []string{"openai/gpt-test"})
	if len(selection.Prices) != 0 || len(selection.Candidates) != 1 {
		t.Fatalf("collision selection = %#v", selection)
	}
	if !hasCandidate(selection, "openai/gpt-test", "openai/gpt-test") ||
		!hasCandidate(selection, "openai/gpt-test", "crossmodel/openai/gpt-test") {
		t.Fatalf("collision candidates = %#v", selection.Candidates)
	}

	scoped := selectModelPrices(prices, []string{"crossmodel/openai/gpt-test"})
	if scoped.Prices["crossmodel/openai/gpt-test"].SourceModelID != "crossmodel/openai/gpt-test" {
		t.Fatalf("scoped selection = %#v", scoped)
	}

	all := selectModelPrices(prices, nil)
	if _, ok := all.Prices["openai/gpt-test"]; ok {
		t.Fatalf("unsafe colliding alias imported by empty sync: %#v", all.Prices)
	}
	if all.Prices["gpt-test"].SourceModelID != "openai/gpt-test" {
		t.Fatalf("safe direct alias missing from empty sync: %#v", all.Prices)
	}
}

func TestSelectModelPricesTreatsAdvancedPricingDifferencesAsAmbiguous(t *testing.T) {
	prices := map[string]store.ModelPrice{
		"provider-a/shared": {
			Prompt:               1,
			Completion:           2,
			PromptConfigured:     true,
			CompletionConfigured: true,
			Source:               SyncSourceModelsDev,
			SourceModelID:        "provider-a/shared",
			RawJSON:              `{"cost":{"input":1,"output":2,"tiers":[{"input":2,"output":4,"tier":{"type":"context","size":200000}}]}}`,
		},
		"provider-b/shared": {
			Prompt:               1,
			Completion:           2,
			PromptConfigured:     true,
			CompletionConfigured: true,
			Source:               SyncSourceModelsDev,
			SourceModelID:        "provider-b/shared",
			RawJSON:              `{"cost":{"input":1,"output":2}}`,
		},
	}

	selection := selectModelPrices(prices, []string{"shared"})
	if len(selection.Prices) != 0 || len(selection.Candidates) != 1 ||
		!hasCandidate(selection, "shared", "provider-a/shared") ||
		!hasCandidate(selection, "shared", "provider-b/shared") {
		t.Fatalf("advanced price conflict = %#v", selection)
	}
}

func TestModelsDevAmbiguityBlocksLowerPriorityBareFallback(t *testing.T) {
	modelsDev := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"provider-a":{"models":{"shared":{"cost":{"input":1,"output":2}}}},
			"provider-b":{"models":{"shared":{"cost":{"input":3,"output":4}}}}
		}`))
	}))
	t.Cleanup(modelsDev.Close)
	liteLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"shared":{"input_cost_per_token":0.000009,"output_cost_per_token":0.000009},"fallback-only":{"input_cost_per_token":0.000001}}`))
	}))
	t.Cleanup(liteLLM.Close)

	modelsDevURL := modelsDev.URL
	liteLLMURL := liteLLM.URL
	service := NewMultiSourceWithModelsDev(nil, &modelsDevURL, &liteLLMURL, nil)
	prices, _, sources, _, err := service.fetchAllModelPrices(context.Background(), modelsDev.Client(), nil)
	if err != nil {
		t.Fatalf("fetch all prices: %v", err)
	}
	if len(sources) != 2 || sources[0] != SyncSourceModelsDev || sources[1] != SyncSourceLiteLLM {
		t.Fatalf("sources = %#v", sources)
	}
	if _, ok := prices["shared"]; ok {
		t.Fatalf("lower-priority bare fallback bypassed ambiguity protection: %#v", prices["shared"])
	}
	if _, ok := prices["fallback-only"]; !ok {
		t.Fatalf("unrelated fallback model missing: %#v", prices)
	}
}

func TestFetchAllModelPricesStopsAfterRequestedModelsAreCovered(t *testing.T) {
	modelsDevPrices := map[string]store.ModelPrice{
		"provider-a/primary": {
			Prompt:           1,
			PromptConfigured: true,
			Source:           SyncSourceModelsDev,
			SourceModelID:    "provider-a/primary",
		},
		"provider-a/shared": {
			Prompt:           2,
			PromptConfigured: true,
			Source:           SyncSourceModelsDev,
			SourceModelID:    "provider-a/shared",
			RawJSON:          `{"cost":{"input":2}}`,
		},
		"provider-b/shared": {
			Prompt:           3,
			PromptConfigured: true,
			Source:           SyncSourceModelsDev,
			SourceModelID:    "provider-b/shared",
			RawJSON:          `{"cost":{"input":3}}`,
		},
	}
	liteLLMPrices := map[string]store.ModelPrice{
		"lite-only": {
			Prompt:           4,
			PromptConfigured: true,
			Source:           SyncSourceLiteLLM,
			SourceModelID:    "lite-only",
		},
	}
	openRouterPrices := map[string]store.ModelPrice{
		"router-only": {
			Prompt:           5,
			PromptConfigured: true,
			Source:           SyncSourceOpenRouter,
			SourceModelID:    "router-only",
		},
	}

	tests := []struct {
		name        string
		models      []string
		wantSources string
		wantCalls   [3]int32
	}{
		{name: "models.dev coverage", models: []string{"primary"}, wantSources: SyncSourceModelsDev, wantCalls: [3]int32{1, 0, 0}},
		{name: "models.dev ambiguity", models: []string{"shared"}, wantSources: SyncSourceModelsDev, wantCalls: [3]int32{1, 0, 0}},
		{name: "LiteLLM completes coverage", models: []string{"primary", "lite-only"}, wantSources: SyncSourceModelsDev + "," + SyncSourceLiteLLM, wantCalls: [3]int32{1, 1, 0}},
		{name: "OpenRouter still required", models: []string{"router-only"}, wantSources: SyncSourceModelsDev + "," + SyncSourceLiteLLM + "," + SyncSourceOpenRouter, wantCalls: [3]int32{1, 1, 1}},
		{name: "empty request fetches all", models: nil, wantSources: SyncSourceModelsDev + "," + SyncSourceLiteLLM + "," + SyncSourceOpenRouter, wantCalls: [3]int32{1, 1, 1}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var calls [3]atomic.Int32
			syncURL := "https://example.test/prices"
			service := &Service{syncSources: []priceSyncSource{
				{
					Source: SyncSourceModelsDev,
					URL:    &syncURL,
					Fetch: func(context.Context, string, *http.Client) (map[string]store.ModelPrice, int, error) {
						calls[0].Add(1)
						return modelsDevPrices, 0, nil
					},
				},
				{
					Source: SyncSourceLiteLLM,
					URL:    &syncURL,
					Fetch: func(context.Context, string, *http.Client) (map[string]store.ModelPrice, int, error) {
						calls[1].Add(1)
						return liteLLMPrices, 0, nil
					},
				},
				{
					Source: SyncSourceOpenRouter,
					URL:    &syncURL,
					Fetch: func(context.Context, string, *http.Client) (map[string]store.ModelPrice, int, error) {
						calls[2].Add(1)
						return openRouterPrices, 0, nil
					},
				},
			}}

			prices, _, sources, sourceResults, err := service.fetchAllModelPrices(context.Background(), nil, test.models)
			if err != nil {
				t.Fatalf("fetch model prices: %v", err)
			}
			if got := strings.Join(sources, ","); got != test.wantSources {
				t.Fatalf("sources = %q", got)
			}
			if len(sourceResults) != len(sources) {
				t.Fatalf("source results = %#v", sourceResults)
			}
			for index, want := range test.wantCalls {
				if got := calls[index].Load(); got != want {
					t.Fatalf("source %d calls = %d, want %d", index, got, want)
				}
			}
			if test.name == "models.dev ambiguity" {
				selection := selectModelPrices(prices, test.models)
				if len(selection.Prices) != 0 || len(selection.Candidates) != 1 {
					t.Fatalf("ambiguity selection = %#v", selection)
				}
			}
		})
	}
}

func TestUsageSummaryUsesConfiguredRecentLimit(t *testing.T) {
	cfg := testutil.NewConfig(t)
	st := testutil.NewStore(t, cfg)
	if _, err := st.UsageEvents.InsertBatch(context.Background(), []usage.Event{
		{EventHash: "older", TimestampMS: 100, Timestamp: "2026-01-01T00:00:00Z", Model: "gpt-old", CreatedAtMS: 100},
		{EventHash: "newer", TimestampMS: 200, Timestamp: "2026-01-01T00:00:01Z", Model: "gpt-new", ResolvedModel: "gpt-resolved", CreatedAtMS: 200},
	}); err != nil {
		t.Fatalf("insert events: %v", err)
	}

	summary, err := New(st, nil).UsageSummary(context.Background(), 1)
	if err != nil {
		t.Fatalf("usage summary: %v", err)
	}
	if summary.SampledEvents != 1 || summary.TotalEvents != 2 || !summary.Truncated {
		t.Fatalf("summary metadata = %#v", summary)
	}
	if len(summary.Models) != 2 || summary.Models[0].Model != "gpt-new" || summary.Models[1].Model != "gpt-resolved" {
		t.Fatalf("models = %#v", summary.Models)
	}
}

func TestSelectModelPricesIncludesResolvedAndProviderVariants(t *testing.T) {
	remote := map[string]store.ModelPrice{
		"anthropic/claude-sonnet-4-5": {
			Prompt:        3,
			Completion:    15,
			Cache:         0.3,
			Source:        SyncSource,
			SourceModelID: "anthropic/claude-sonnet-4-5",
		},
		"openai/GPT-4.1": {
			Prompt:        2,
			Completion:    8,
			Source:        SyncSource,
			SourceModelID: "openai/GPT-4.1",
		},
	}

	selection := selectModelPrices(remote, []string{"claude-sonnet-4-5", "gpt-4.1"})

	if len(selection.Prices) != 2 {
		t.Fatalf("selected prices = %#v", selection.Prices)
	}
	if selection.Prices["claude-sonnet-4-5"].SourceModelID != "anthropic/claude-sonnet-4-5" {
		t.Fatalf("claude source = %#v", selection.Prices["claude-sonnet-4-5"])
	}
	if selection.Prices["gpt-4.1"].SourceModelID != "openai/GPT-4.1" {
		t.Fatalf("gpt source = %#v", selection.Prices["gpt-4.1"])
	}
	if len(selection.Candidates) != 0 || len(selection.Unmatched) != 0 {
		t.Fatalf("unexpected candidates/unmatched = %#v %#v", selection.Candidates, selection.Unmatched)
	}
}

func TestFetchOpenRouterModelPrices(t *testing.T) {
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"data": [
				{
					"id": "openai/gpt-test",
					"pricing": {
						"prompt": "0.000001",
						"completion": "0.000002",
						"input_cache_read": "0.00000025"
					}
				},
				{"id": "skip-no-pricing"}
			]
		}`))
	}))
	t.Cleanup(source.Close)

	prices, skipped, err := fetchOpenRouterModelPrices(context.Background(), source.URL, source.Client())
	if err != nil {
		t.Fatalf("fetch openrouter prices: %v", err)
	}
	if skipped != 1 {
		t.Fatalf("skipped = %d", skipped)
	}
	price := prices["openai/gpt-test"]
	if price.Source != SyncSourceOpenRouter || price.SourceModelID != "openai/gpt-test" {
		t.Fatalf("source metadata = %#v", price)
	}
	if !closePrice(price.Prompt, 1) || !closePrice(price.Completion, 2) || !closePrice(price.Cache, 0.25) ||
		!price.PromptConfigured || !price.CompletionConfigured || !price.CacheReadConfigured || price.CacheCreationConfigured {
		t.Fatalf("price = %#v", price)
	}
}

func TestSelectModelPricesReturnsCandidatesForAmbiguousModels(t *testing.T) {
	remote := map[string]store.ModelPrice{
		"anthropic/claude-sonnet-4-20250514": {
			Prompt:        3,
			Completion:    15,
			SourceModelID: "anthropic/claude-sonnet-4-20250514",
		},
		"anthropic/claude-sonnet-4-20250929": {
			Prompt:        3,
			Completion:    15,
			SourceModelID: "anthropic/claude-sonnet-4-20250929",
		},
		"openai/gpt-4.1": {
			Prompt:        2,
			Completion:    8,
			SourceModelID: "openai/gpt-4.1",
		},
	}

	selection := selectModelPrices(remote, []string{"claude-sonnet-4-latest", "unknown-model"})

	if len(selection.Prices) != 0 {
		t.Fatalf("auto matched prices = %#v", selection.Prices)
	}
	if len(selection.Candidates) != 1 {
		t.Fatalf("candidates = %#v", selection.Candidates)
	}
	if selection.Candidates[0].Model != "claude-sonnet-4-latest" || len(selection.Candidates[0].Candidates) == 0 {
		t.Fatalf("candidate set = %#v", selection.Candidates[0])
	}
	if selection.Candidates[0].Candidates[0].Score < minCandidateScore {
		t.Fatalf("candidate score = %#v", selection.Candidates[0].Candidates[0])
	}
	if len(selection.Unmatched) != 1 || selection.Unmatched[0] != "unknown-model" {
		t.Fatalf("unmatched = %#v", selection.Unmatched)
	}
}

func TestSelectModelPricesReturnsWeakFamilyCandidates(t *testing.T) {
	remote := map[string]store.ModelPrice{
		"google/gemini-2.5-flash-lite": {
			Prompt:        0.3,
			Completion:    2.5,
			Source:        SyncSourceOpenRouter,
			SourceModelID: "google/gemini-2.5-flash-lite",
		},
		"qwen/qwen3.5-flash": {
			Prompt:        0.2,
			Completion:    0.8,
			Source:        SyncSourceOpenRouter,
			SourceModelID: "qwen/qwen3.5-flash",
		},
		"minimax/m2.5": {
			Prompt:        0.4,
			Completion:    1.6,
			Source:        SyncSourceOpenRouter,
			SourceModelID: "minimax/m2.5",
		},
		"openai/codex-mini": {
			Prompt:        1.5,
			Completion:    6,
			Source:        SyncSourceOpenRouter,
			SourceModelID: "openai/codex-mini",
		},
	}

	selection := selectModelPrices(remote, []string{
		"gemini-3.5-flash-low",
		"qwen3.6-plus-preview",
		"mimo-v2.5",
		"codex-auto-review",
	})

	if !hasCandidate(selection, "gemini-3.5-flash-low", "google/gemini-2.5-flash-lite") {
		t.Fatalf("gemini candidates = %#v", selection.Candidates)
	}
	if !hasCandidate(selection, "qwen3.6-plus-preview", "qwen/qwen3.5-flash") {
		t.Fatalf("qwen candidates = %#v", selection.Candidates)
	}
	if !hasCandidate(selection, "mimo-v2.5", "minimax/m2.5") {
		t.Fatalf("mimo candidates = %#v", selection.Candidates)
	}
	if len(selection.Unmatched) != 1 || selection.Unmatched[0] != "codex-auto-review" {
		t.Fatalf("unmatched = %#v", selection.Unmatched)
	}
}

func hasCandidate(selection priceSelectionResult, model string, sourceModelID string) bool {
	for _, set := range selection.Candidates {
		if set.Model != model {
			continue
		}
		for _, candidate := range set.Candidates {
			if candidate.SourceModelID == sourceModelID {
				return true
			}
		}
	}
	return false
}

func closePrice(left float64, right float64) bool {
	if left > right {
		return left-right < 0.0000001
	}
	return right-left < 0.0000001
}
