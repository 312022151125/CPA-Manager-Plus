package quotasnapshot

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func newQuotaSnapshotTestService(t *testing.T, nowMS int64) *Service {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	service := New(st)
	service.now = func() time.Time { return time.UnixMilli(nowMS) }
	return service
}

func quotaSnapshotTestAccount() AccountTarget {
	return AccountTarget{
		AuthFileSnapshot:     "codex.json",
		AuthProviderSnapshot: "codex",
		AuthIndex:            "auth-1",
		AccountSnapshot:      "user@example.com",
	}
}

func TestWriteQuerySelectsLatestCompleteObservationAndMergesCodexResetCredits(t *testing.T) {
	service := newQuotaSnapshotTestService(t, 20_000)
	cycleStart := int64(10_000)
	cycleEnd := int64(30_000)
	duration := int64(20)
	apiUsed := 20.0
	headerUsed := 35.0
	available := int64(2)

	_, err := service.Write(context.Background(), WriteRequest{Entries: []WriteEntry{{
		RowKey: "row-1", Provider: "codex", Account: quotaSnapshotTestAccount(),
		Windows: []WindowInput{{
			ProviderWindowID: "rate_limit:five_hour", WindowKind: "five_hour",
			WindowMode: "fixed", ModelScopeKind: "all", Source: "api_query",
			ObservedAtMS: 15_000, BoundaryAccuracy: "exact",
			CycleStartMS: &cycleStart, CycleEndMS: &cycleEnd, DurationSeconds: &duration,
			UsedPercent: &apiUsed, ResetCreditsAvailable: &available,
			ResetCredits: []ResetCredit{{ID: "credit-1", ExpiresAtMS: 100_000}},
		}},
	}}})
	if err != nil {
		t.Fatalf("write api snapshot: %v", err)
	}
	_, err = service.Write(context.Background(), WriteRequest{Entries: []WriteEntry{{
		RowKey: "row-1", Provider: "codex", Account: quotaSnapshotTestAccount(),
		Windows: []WindowInput{{
			ProviderWindowID: "rate_limit:five_hour", WindowKind: "five_hour",
			WindowMode: "fixed", ModelScopeKind: "all", Source: "response_header",
			ObservedAtMS: 19_000, BoundaryAccuracy: "derived",
			CycleStartMS: &cycleStart, CycleEndMS: &cycleEnd, DurationSeconds: &duration,
			UsedPercent: &headerUsed,
		}},
	}}})
	if err != nil {
		t.Fatalf("write header snapshot: %v", err)
	}

	result, err := service.Query(context.Background(), QueryRequest{Accounts: []QueryAccount{{
		RowKey: "row-1", Provider: "codex", Account: quotaSnapshotTestAccount(),
	}}})
	if err != nil {
		t.Fatalf("query snapshots: %v", err)
	}
	if len(result.Items) != 1 || len(result.Items[0].Windows) != 1 {
		t.Fatalf("query result = %#v", result)
	}
	window := result.Items[0].Windows[0]
	if window.Source != "response_header" || window.UsedPercent == nil || *window.UsedPercent != headerUsed {
		t.Fatalf("selected window = %#v", window)
	}
	if window.ResetCreditsAvailable == nil || *window.ResetCreditsAvailable != available || len(window.ResetCredits) != 1 {
		t.Fatalf("reset credits were not merged: %#v", window)
	}
	if got := window.FieldSources["reset_credits"].Source; got != "api_query" {
		t.Fatalf("reset credit source = %q, want api_query", got)
	}
}

func TestQueryPreservesCodexAPIFieldsBeyondRawCandidateLimit(t *testing.T) {
	service := newQuotaSnapshotTestService(t, 5_000_000)
	cycleStart := int64(1_000_000)
	cycleEnd := int64(6_000_000)
	duration := int64(5_000)
	available := int64(1)
	apiUsed := 10.0
	_, err := service.Write(context.Background(), WriteRequest{Entries: []WriteEntry{{
		Provider: "codex", Account: quotaSnapshotTestAccount(), Windows: []WindowInput{{
			ProviderWindowID: "five-hour", WindowKind: "five_hour", WindowMode: "fixed",
			ModelScopeKind: "all", Source: "api_query", ObservedAtMS: 1_000,
			BoundaryAccuracy: "exact", CycleStartMS: &cycleStart, CycleEndMS: &cycleEnd,
			DurationSeconds: &duration, UsedPercent: &apiUsed, ResetCreditsAvailable: &available,
		}},
	}}})
	if err != nil {
		t.Fatalf("write api snapshot: %v", err)
	}

	for batch := 0; batch < 6; batch++ {
		windows := make([]WindowInput, 400)
		for index := range windows {
			used := 20.0 + float64(batch)
			windows[index] = WindowInput{
				ProviderWindowID: "five-hour", WindowKind: "five_hour", WindowMode: "fixed",
				ModelScopeKind: "all", Source: "response_header",
				ObservedAtMS: 2_000 + int64(batch*400+index), BoundaryAccuracy: "derived",
				CycleStartMS: &cycleStart, CycleEndMS: &cycleEnd, DurationSeconds: &duration,
				UsedPercent: &used,
			}
		}
		if _, err := service.Write(context.Background(), WriteRequest{Entries: []WriteEntry{{
			Provider: "codex", Account: quotaSnapshotTestAccount(), Windows: windows,
		}}}); err != nil {
			t.Fatalf("write header batch %d: %v", batch, err)
		}
	}

	result, err := service.Query(context.Background(), QueryRequest{Accounts: []QueryAccount{{
		RowKey: "row-1", Provider: "codex", Account: quotaSnapshotTestAccount(),
	}}})
	if err != nil {
		t.Fatalf("query snapshots: %v", err)
	}
	window := result.Items[0].Windows[0]
	if window.Source != "response_header" {
		t.Fatalf("latest source = %q, want response_header", window.Source)
	}
	if window.ResetCreditsAvailable == nil || *window.ResetCreditsAvailable != available {
		t.Fatalf("api reset credits were crowded out: %#v", window)
	}
	if got := window.FieldSources["reset_credits_available"].Source; got != "api_query" {
		t.Fatalf("reset credit source = %q, want api_query", got)
	}
}

func TestQueryDoesNotPromoteExpiredOrIncompleteFixedWindow(t *testing.T) {
	service := newQuotaSnapshotTestService(t, 50_000)
	cycleStart := int64(10_000)
	cycleEnd := int64(30_000)
	duration := int64(20)
	used := 80.0
	_, err := service.Write(context.Background(), WriteRequest{Entries: []WriteEntry{{
		Provider: "codex", Account: quotaSnapshotTestAccount(), Windows: []WindowInput{{
			ProviderWindowID: "rate_limit:weekly", WindowKind: "weekly",
			WindowMode: "fixed", ModelScopeKind: "all", Source: "api_query",
			ObservedAtMS: 20_000, BoundaryAccuracy: "exact",
			CycleStartMS: &cycleStart, CycleEndMS: &cycleEnd, DurationSeconds: &duration,
			UsedPercent: &used,
		}},
	}}})
	if err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	result, err := service.Query(context.Background(), QueryRequest{Accounts: []QueryAccount{{
		RowKey: "row-1", Provider: "codex", Account: quotaSnapshotTestAccount(),
	}}})
	if err != nil {
		t.Fatalf("query snapshot: %v", err)
	}
	if !result.Items[0].Windows[0].Stale {
		t.Fatalf("expired fixed snapshot must be stale: %#v", result.Items[0].Windows[0])
	}
}

func TestWriteRejectsReliableFixedWindowWithoutCompleteBoundary(t *testing.T) {
	service := newQuotaSnapshotTestService(t, 20_000)
	_, err := service.Write(context.Background(), WriteRequest{Entries: []WriteEntry{{
		Provider: "claude", Account: AccountTarget{AuthIndex: "auth-1"},
		Windows: []WindowInput{{
			ProviderWindowID: "five_hour", WindowKind: "five_hour", WindowMode: "fixed",
			ModelScopeKind: "all", Source: "api_query", ObservedAtMS: 10_000,
			BoundaryAccuracy: "exact",
		}},
	}}})
	if err == nil {
		t.Fatal("expected incomplete reliable fixed window to be rejected")
	}
}

func TestWriteUsageEventsPersistsCodexHeaderWindows(t *testing.T) {
	const observedAtMS = int64(1_780_000_000_000)
	service := newQuotaSnapshotTestService(t, observedAtMS+1_000)
	used := 35.0
	resetAfter := 600.0
	minutes := 300.0
	resetAtMS := observedAtMS + int64(resetAfter*1000)
	event := usage.Event{
		TimestampMS:          observedAtMS,
		Provider:             "codex",
		AuthFileSnapshot:     "codex.json",
		AuthProviderSnapshot: "codex",
		AuthIndex:            "auth-1",
		AccountSnapshot:      "user@example.com",
		RequestID:            "req-codex-header",
		ResponseMetadata: &usage.ResponseHeaderMetadata{Quota: &usage.HeaderQuotaMetadata{
			PlanType: "plus",
			Primary: &usage.HeaderQuotaWindow{
				UsedPercent:       &used,
				ResetAtMS:         resetAtMS,
				ResetAfterSeconds: &resetAfter,
				WindowMinutes:     &minutes,
			},
		}},
	}
	if err := service.WriteUsageEvents(context.Background(), []usage.Event{event}); err != nil {
		t.Fatalf("write usage evidence: %v", err)
	}
	result, err := service.Query(context.Background(), QueryRequest{Accounts: []QueryAccount{{
		RowKey: "row-1", Provider: "codex", Account: quotaSnapshotTestAccount(),
	}}})
	if err != nil {
		t.Fatalf("query usage evidence: %v", err)
	}
	if len(result.Items) != 1 || len(result.Items[0].Windows) != 1 {
		t.Fatalf("query result = %#v", result)
	}
	window := result.Items[0].Windows[0]
	if window.ProviderWindowID != "five-hour" || window.WindowMode != "fixed" || window.BoundaryAccuracy != "derived" {
		t.Fatalf("codex window = %#v", window)
	}
	if window.CycleEndMS == nil || *window.CycleEndMS != resetAtMS || window.DurationSeconds == nil || *window.DurationSeconds != 18_000 {
		t.Fatalf("codex boundaries = %#v", window)
	}
	if window.Source != "response_header" || window.SourceObservationID != "req-codex-header" {
		t.Fatalf("codex provenance = %#v", window)
	}
}

func TestWriteUsageEventsPersistsOnlyExplicitXAIProviderUsage(t *testing.T) {
	const observedAtMS = int64(1_780_000_000_000)
	service := newQuotaSnapshotTestService(t, observedAtMS+1_000)
	actual := int64(1_000_000)
	limit := int64(1_000_000)
	remaining := int64(0)
	event := usage.Event{
		TimestampMS:          observedAtMS,
		Provider:             "xai",
		AuthFileSnapshot:     "xai.json",
		AuthProviderSnapshot: "xai",
		AuthIndex:            "auth-xai",
		RequestID:            "req-xai-body",
		ResponseMetadata: &usage.ResponseHeaderMetadata{
			RateLimit: &usage.HeaderRateLimitMetadata{Requests: &usage.HeaderRateLimitBucket{}},
			ProviderUsage: &usage.ProviderUsageMetadata{
				Provider: "xai", Kind: usage.ProviderUsageKindIncludedFree,
				WindowKind: usage.ProviderUsageWindowRolling24H,
				Source:     usage.ProviderUsageSourceBody, Model: "grok-4.5-build-free",
				ObservedAtMS: observedAtMS, Actual: &actual, Limit: &limit, Remaining: &remaining,
			},
		},
	}
	if err := service.WriteUsageEvents(context.Background(), []usage.Event{event}); err != nil {
		t.Fatalf("write xai evidence: %v", err)
	}
	result, err := service.Query(context.Background(), QueryRequest{Accounts: []QueryAccount{{
		RowKey: "row-xai", Provider: "xai", Account: AccountTarget{
			AuthFileSnapshot: "xai.json", AuthProviderSnapshot: "xai", AuthIndex: "auth-xai",
		},
	}}})
	if err != nil {
		t.Fatalf("query xai evidence: %v", err)
	}
	if len(result.Items) != 1 || len(result.Items[0].Windows) != 1 {
		t.Fatalf("query result = %#v", result)
	}
	window := result.Items[0].Windows[0]
	if window.WindowMode != "rolling" || window.ProviderWindowID != "included-free-rolling-24h" || window.DurationSeconds == nil || *window.DurationSeconds != 86_400 {
		t.Fatalf("xai window = %#v", window)
	}
	if window.ModelScopeKind != "models" || len(window.ModelIDs) != 1 || window.ModelIDs[0] != "grok-4.5-build-free" {
		t.Fatalf("xai model scope = %#v", window)
	}

	transportOnly := event
	transportOnly.AuthIndex = "auth-transport-only"
	transportOnly.ResponseMetadata = &usage.ResponseHeaderMetadata{
		RateLimit: &usage.HeaderRateLimitMetadata{Requests: &usage.HeaderRateLimitBucket{}},
	}
	if err := service.WriteUsageEvents(context.Background(), []usage.Event{transportOnly}); err != nil {
		t.Fatalf("write transport-only evidence: %v", err)
	}
	transportResult, err := service.Query(context.Background(), QueryRequest{Accounts: []QueryAccount{{
		RowKey: "row-transport", Provider: "xai", Account: AccountTarget{
			AuthFileSnapshot: "xai.json", AuthProviderSnapshot: "xai", AuthIndex: "auth-transport-only",
		},
	}}})
	if err != nil {
		t.Fatalf("query transport-only evidence: %v", err)
	}
	if len(transportResult.Items[0].Windows) != 0 {
		t.Fatalf("transport rate-limit headers became quota snapshots: %#v", transportResult)
	}
}

func TestWriteCodexInspectionResultRequiresNormalizedResetBoundary(t *testing.T) {
	const observedAtMS = int64(1_780_000_000_000)
	service := newQuotaSnapshotTestService(t, observedAtMS+1_000)
	duration := float64(18_000)
	used := 60.0
	result := model.CodexInspectionResult{
		ID: 7, RunID: 3, Provider: "codex", FileName: "codex.json", AuthIndex: "auth-1",
		AccountSnapshot: "user@example.com", CreatedAtMS: observedAtMS, PlanType: "plus",
		QuotaWindows: []model.CodexInspectionQuotaWindow{
			{ID: "five-hour", UsedPercent: &used, ResetLabel: "08/04 12:00", LimitWindowSeconds: &duration},
			{ID: "weekly", UsedPercent: &used, ResetAtMS: observedAtMS + 604_800_000, ResetAccuracy: "exact", LimitWindowSeconds: float64Pointer(604_800)},
		},
	}
	if err := service.WriteCodexInspectionResult(context.Background(), result); err != nil {
		t.Fatalf("write inspection evidence: %v", err)
	}
	query, err := service.Query(context.Background(), QueryRequest{Accounts: []QueryAccount{{
		RowKey: "row-1", Provider: "codex", Account: quotaSnapshotTestAccount(),
	}}})
	if err != nil {
		t.Fatalf("query inspection evidence: %v", err)
	}
	if len(query.Items[0].Windows) != 2 {
		t.Fatalf("inspection windows = %#v", query)
	}
	byID := map[string]Window{}
	for _, window := range query.Items[0].Windows {
		byID[window.ProviderWindowID] = window
	}
	if byID["five-hour"].WindowMode != "unknown" || byID["five-hour"].BoundaryAccuracy != "unknown" {
		t.Fatalf("label-only boundary was trusted: %#v", byID["five-hour"])
	}
	if byID["weekly"].WindowMode != "fixed" || byID["weekly"].BoundaryAccuracy != "exact" {
		t.Fatalf("normalized boundary was not trusted: %#v", byID["weekly"])
	}
}

func float64Pointer(value float64) *float64 {
	return &value
}
