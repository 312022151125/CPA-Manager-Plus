package usageevent

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func TestRecentAccountRequestsUseSnapshotIdentityLimitAndConservativeLegacyFallback(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	repo := New(db)
	ctx := context.Background()
	baseMS := int64(1_700_000_000_000)

	oldest := latestAccountRequestEvent("oldest", baseMS+500, "credential-a.json", "auth-a", "source-a")
	current := latestAccountRequestEvent("current", baseMS+1_000, "credential-a.json", "auth-a", "source-a")
	latest := latestAccountRequestEvent("latest", baseMS+2_000, "Credential-A.JSON", "AUTH-A", "source-a")
	latest.Failed = true
	latest.FailStatusCode = 429
	latest.FailBody = "Authorization: Bearer hidden-request-token"
	latest.HeaderErrorKind = "rate_limit"
	latest.HeaderErrorCode = "quota_exceeded"
	latest.HeaderTraceID = "trace-latest-a"
	wrongFile := latestAccountRequestEvent("wrong-file", baseMS+9_000, "credential-b.json", "auth-a", "source-b")
	wrongIndex := latestAccountRequestEvent("wrong-index", baseMS+10_000, "credential-a.json", "auth-b", "source-a")
	emailCollision := latestAccountRequestEvent("email-collision", baseMS+11_000, "", "auth-a", "alice@example.com")
	emailCollision.AccountSnapshot = "alice@example.com"
	legacy := latestAccountRequestEvent("legacy", baseMS+3_000, "", "legacy.json", "legacy.json")
	legacy.Failed = true
	legacy.FailStatusCode = 503
	legacy.FailSummary = "upstream unavailable"
	legacyWithSnapshot := latestAccountRequestEvent("legacy-with-snapshot", baseMS+12_000, "other.json", "legacy.json", "legacy.json")
	noIndexOld := latestAccountRequestEvent("no-index-old", baseMS+4_000, "credential-empty.json", "", "credential-empty.json")
	noIndexLatest := latestAccountRequestEvent("no-index-latest", baseMS+6_000, "credential-empty.json", "", "credential-empty.json")
	legacyNoIndex := latestAccountRequestEvent("legacy-no-index", baseMS+5_000, "", "", "credential-empty.json")

	if _, err := repo.InsertBatch(ctx, []usage.Event{
		oldest,
		current,
		latest,
		wrongFile,
		wrongIndex,
		emailCollision,
		legacy,
		legacyWithSnapshot,
		noIndexOld,
		noIndexLatest,
		legacyNoIndex,
	}); err != nil {
		t.Fatalf("insert events: %v", err)
	}
	if _, err := db.Exec(`update usage_events set auth_index = '' where event_hash = ?`, noIndexLatest.EventHash); err != nil {
		t.Fatalf("preserve explicit empty auth index fixture: %v", err)
	}

	requests, err := repo.RecentAccountRequests(ctx, []LatestAccountRequestQuery{
		{RequestIndex: 0, AuthFileSnapshot: "credential-a.json", AuthIndex: "auth-a"},
		{RequestIndex: 1, AuthFileSnapshot: "legacy.json", AuthIndex: "legacy.json"},
		{RequestIndex: 2, AuthFileSnapshot: "missing.json", AuthIndex: "auth-missing"},
		{RequestIndex: 3, AuthFileSnapshot: "credential-empty.json"},
	}, 2)
	if err != nil {
		t.Fatalf("recent account requests: %v", err)
	}
	if len(requests) != 5 {
		t.Fatalf("requests = %#v", requests)
	}

	byIndex := make(map[int][]LatestAccountRequest, len(requests))
	for _, request := range requests {
		byIndex[request.RequestIndex] = append(byIndex[request.RequestIndex], request)
	}

	primaryRequests := byIndex[0]
	if len(primaryRequests) != 2 {
		t.Fatalf("primary requests = %#v", primaryRequests)
	}
	primary := primaryRequests[0]
	if primary.TimestampMS != latest.TimestampMS || !primary.Failed || !primary.FailStatusCode.Valid || primary.FailStatusCode.Int64 != 429 {
		t.Fatalf("primary latest request = %#v", primary)
	}
	if primary.HeaderErrorKind != "rate_limit" || primary.HeaderErrorCode != "quota_exceeded" || primary.HeaderTraceID != "trace-latest-a" {
		t.Fatalf("primary diagnostics = %#v", primary)
	}
	if strings.Contains(primary.FailSummary, "hidden-request-token") || !strings.Contains(primary.FailSummary, "[redacted]") {
		t.Fatalf("primary failure summary was not safely reduced: %q", primary.FailSummary)
	}
	if primaryRequests[1].TimestampMS != current.TimestampMS {
		t.Fatalf("primary request order = %#v", primaryRequests)
	}
	for _, request := range primaryRequests {
		if request.TimestampMS == oldest.TimestampMS {
			t.Fatalf("per-credential limit was not applied: %#v", primaryRequests)
		}
	}

	legacyRequests := byIndex[1]
	if len(legacyRequests) != 1 {
		t.Fatalf("legacy requests = %#v", legacyRequests)
	}
	legacyResult := legacyRequests[0]
	if legacyResult.TimestampMS != legacy.TimestampMS || !legacyResult.Failed || !legacyResult.FailStatusCode.Valid || legacyResult.FailStatusCode.Int64 != 503 {
		t.Fatalf("legacy fallback = %#v", legacyResult)
	}
	if _, ok := byIndex[2]; ok {
		t.Fatalf("missing credential unexpectedly matched: %#v", byIndex[2])
	}
	emptyIndexRequests := byIndex[3]
	if len(emptyIndexRequests) != 2 ||
		emptyIndexRequests[0].TimestampMS != noIndexLatest.TimestampMS ||
		emptyIndexRequests[1].TimestampMS != legacyNoIndex.TimestampMS {
		t.Fatalf("empty auth index requests = %#v", emptyIndexRequests)
	}
}

func TestRecentAccountRequestsUsesBothLatestRequestIndexesWithBoundedBranches(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := sqliterepo.RunDerivedStartupMaintenance(context.Background(), db); err != nil {
		t.Fatalf("prepare latest request indexes: %v", err)
	}

	snapshotWithAuthIndex := explainLatestAccountRequestPlan(
		t,
		db,
		recentAccountRequestQuery(false, false, false),
		recentAccountRequestArgs("credential-a.json", "auth-a", false, nil, 10)...,
	)
	snapshotWithAuthIndexText := strings.Join(snapshotWithAuthIndex, "\n")
	for _, want := range []string{
		"idx_usage_events_latest_request_auth_file",
		"auth_file_snapshot=? AND auth_index=?",
	} {
		if !strings.Contains(snapshotWithAuthIndexText, want) {
			t.Fatalf("latest snapshot request plan with auth index = %v, missing %q", snapshotWithAuthIndex, want)
		}
	}
	if strings.Contains(snapshotWithAuthIndexText, "SCAN usage_events") {
		t.Fatalf("latest snapshot request plan with auth index scans usage_events: %v", snapshotWithAuthIndex)
	}

	cutoff := &recentAccountRequestCandidate{id: 99}
	cutoff.request.TimestampMS = 1800000000099
	legacyWithAuthIndex := explainLatestAccountRequestPlan(
		t,
		db,
		recentAccountRequestQuery(true, false, true),
		recentAccountRequestArgs("credential-a.json", "auth-a", false, cutoff, 10)...,
	)
	legacyWithAuthIndexText := strings.Join(legacyWithAuthIndex, "\n")
	for _, want := range []string{
		"idx_usage_events_latest_request_source",
		"source=? AND auth_index=? AND timestamp_ms>?",
	} {
		if !strings.Contains(legacyWithAuthIndexText, want) {
			t.Fatalf("latest legacy request plan with auth index = %v, missing %q", legacyWithAuthIndex, want)
		}
	}
	if strings.Contains(legacyWithAuthIndexText, "SCAN usage_events") {
		t.Fatalf("latest legacy request plan with auth index scans usage_events: %v", legacyWithAuthIndex)
	}

	for _, plan := range [][]string{
		explainLatestAccountRequestPlan(
			t,
			db,
			recentAccountRequestQuery(false, true, false),
			recentAccountRequestArgs("credential-a.json", "", true, nil, 10)...,
		),
		explainLatestAccountRequestPlan(
			t,
			db,
			recentAccountRequestQuery(true, true, true),
			recentAccountRequestArgs("credential-a.json", "", true, cutoff, 10)...,
		),
	} {
		planText := strings.Join(plan, "\n")
		if strings.Contains(planText, "SCAN usage_events") {
			t.Fatalf("latest account request plan without auth index scans usage_events: %v", plan)
		}
	}
}

func BenchmarkRecentAccountRequestsDenseCredential(b *testing.B) {
	db, err := sqliterepo.Open(filepath.Join(b.TempDir(), "usage.sqlite"))
	if err != nil {
		b.Fatalf("open database: %v", err)
	}
	b.Cleanup(func() { _ = db.Close() })
	if err := sqliterepo.RunDerivedStartupMaintenance(context.Background(), db); err != nil {
		b.Fatalf("prepare latest request indexes: %v", err)
	}
	if _, err := db.Exec(`with recursive ids(id) as (
		select 1
		union all
		select id + 1 from ids where id < 100000
	) insert into usage_events (
		event_hash, timestamp_ms, timestamp, model,
		auth_index, source, auth_file_snapshot, created_at_ms
	) select
		printf('dense-account-%06d', id),
		1800000000000 + id,
		'2027-01-15T08:00:00Z',
		'gpt-test',
		'auth-a',
		'credential-a.json',
		'credential-a.json',
		1800000000000 + id
	from ids`); err != nil {
		b.Fatalf("seed dense credential history: %v", err)
	}
	repo := New(db)
	targets := []LatestAccountRequestQuery{{
		RequestIndex:     0,
		AuthFileSnapshot: "credential-a.json",
		AuthIndex:        "auth-a",
	}}

	b.ReportAllocs()
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		requests, err := repo.RecentAccountRequests(context.Background(), targets, 10)
		if err != nil {
			b.Fatalf("recent account requests: %v", err)
		}
		if len(requests) != 10 {
			b.Fatalf("recent account requests = %d, want 10", len(requests))
		}
	}
}

func latestAccountRequestEvent(
	hash string,
	timestampMS int64,
	authFileSnapshot string,
	authIndex string,
	source string,
) usage.Event {
	return usage.Event{
		EventHash:        hash,
		TimestampMS:      timestampMS,
		Timestamp:        time.UnixMilli(timestampMS).UTC().Format(time.RFC3339Nano),
		Model:            "gpt-test",
		Endpoint:         "POST /v1/responses",
		Method:           "POST",
		Path:             "/v1/responses",
		AuthIndex:        authIndex,
		Source:           source,
		AuthFileSnapshot: authFileSnapshot,
		InputTokens:      1,
		OutputTokens:     2,
		TotalTokens:      3,
		CreatedAtMS:      timestampMS,
	}
}

func explainLatestAccountRequestPlan(t *testing.T, db *sql.DB, query string, args ...any) []string {
	t.Helper()
	rows, err := db.Query("explain query plan "+query, args...)
	if err != nil {
		t.Fatalf("explain latest account request plan: %v", err)
	}
	defer rows.Close()

	details := make([]string, 0, 16)
	for rows.Next() {
		var id, parent, unused int
		var detail string
		if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
			t.Fatalf("scan latest account request plan: %v", err)
		}
		details = append(details, detail)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read latest account request plan: %v", err)
	}
	return details
}
