package usageevent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func TestEventHashPersistenceBoundary(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	repo := New(db)
	ctx := context.Background()

	// 1. Canonical lowercase SHA-256 hex
	validLowerHash := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	res, err := repo.InsertBatch(ctx, []usage.Event{
		makeBaseTestEvent(validLowerHash, 1000),
	})
	if err != nil {
		t.Fatalf("insert canonical hash failed: %v", err)
	}
	if res.Inserted != 1 || len(res.InsertedEventHashes) != 1 || res.InsertedEventHashes[0] != validLowerHash {
		t.Fatalf("unexpected insert result: %+v", res)
	}

	// 2. Canonical uppercase SHA-256 hex (must preserve exact value)
	validUpperHash := "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789"
	resUpper, err := repo.InsertBatch(ctx, []usage.Event{
		makeBaseTestEvent(validUpperHash, 2000),
	})
	if err != nil {
		t.Fatalf("insert canonical uppercase hash failed: %v", err)
	}
	if resUpper.Inserted != 1 || resUpper.InsertedEventHashes[0] != validUpperHash {
		t.Fatalf("uppercase hash not preserved exactly: %+v", resUpper)
	}

	// 3. New noncanonical event hash must return ErrInvalidEventHash
	invalidHashes := []string{
		"short-hash",
		"not-a-hash-at-all",
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg", // 'g' is not hex
		"",
	}
	for _, inv := range invalidHashes {
		_, err := repo.InsertBatch(ctx, []usage.Event{
			makeBaseTestEvent(inv, 3000),
		})
		if !errors.Is(err, ErrInvalidEventHash) {
			t.Fatalf("expected ErrInvalidEventHash for hash %q, got: %v", inv, err)
		}
	}

	// 4. Historical noncanonical duplicate: if historical row exists, it must be recognized as duplicate
	historicalHash := "legacy-noncanonical-raw-hash-12345"
	// Seed historical row directly into usage_events table
	_, err = db.ExecContext(ctx, `insert into usage_events (event_hash, timestamp_ms, timestamp, model, total_tokens, created_at_ms)
		values (?, 4000, '2026-01-01T00:00:04Z', 'gpt-test', 10, 4000)`, historicalHash)
	if err != nil {
		t.Fatalf("seed historical event: %v", err)
	}

	// Calling InsertBatch with this historical hash must not fail with ErrInvalidEventHash,
	// and must deduplicate it (Skipped == 1, Inserted == 0) and backfill ledger.
	dupRes, err := repo.InsertBatch(ctx, []usage.Event{
		makeBaseTestEvent(historicalHash, 4000),
	})
	if err != nil {
		t.Fatalf("historical duplicate InsertBatch failed: %v", err)
	}
	if dupRes.Skipped != 1 || dupRes.Inserted != 0 {
		t.Fatalf("expected historical duplicate to be skipped, got: %+v", dupRes)
	}

	// Verify ledger backfill
	var ledgerCount int
	err = db.QueryRowContext(ctx, `select count(*) from usage_event_identity_ledger where event_hash = ?`, historicalHash).Scan(&ledgerCount)
	if err != nil || ledgerCount != 1 {
		t.Fatalf("expected historical ledger entry backfilled, count=%d, err=%v", ledgerCount, err)
	}
}

func TestSensitiveSourcePseudonymizationRoundTrip(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	repo := New(db)
	ctx := context.Background()

	secretKey := "sk-proj-sensitiveApiKeyDirectlyInSource123456789"
	h := sha256.Sum256([]byte(secretKey))
	expectedHex := hex.EncodeToString(h[:])
	expectedPseudonym := "h:" + expectedHex

	hash1 := canonicalTestHash("event-with-secret-source")
	event := makeBaseTestEvent(hash1, 1000)
	event.Source = secretKey
	event.FailBody = `{"cpaManagementKey":"my-super-cpa-key-999","message":"failed"}`

	res, err := repo.InsertBatch(ctx, []usage.Event{event})
	if err != nil {
		t.Fatalf("insert event with sensitive source: %v", err)
	}
	if res.Inserted != 1 {
		t.Fatalf("expected 1 inserted, got: %+v", res)
	}

	// Query from database to verify roundtrip
	events, err := repo.ListRecent(ctx, 10)
	if err != nil {
		t.Fatalf("latest events: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	saved := events[0]
	if saved.Source != expectedPseudonym {
		t.Fatalf("Source not pseudonymized in DB: got %q, want %q", saved.Source, expectedPseudonym)
	}
	if saved.SourceHash != expectedHex {
		t.Fatalf("SourceHash not populated in DB: got %q, want %q", saved.SourceHash, expectedHex)
	}
	if strings.Contains(saved.Source, "sensitiveApiKeyDirectlyInSource") {
		t.Fatalf("Source leaked plaintext credential in DB: %q", saved.Source)
	}
	if strings.Contains(saved.FailBody, "my-super-cpa-key-999") {
		t.Fatalf("FailBody leaked secret in DB: %s", saved.FailBody)
	}
	if strings.Contains(saved.FailSummary, "my-super-cpa-key-999") {
		t.Fatalf("FailSummary leaked secret in DB: %s", saved.FailSummary)
	}
}

func TestInsertBatchDuplicatePreflightOptimization(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	repo := New(db)
	ctx := context.Background()

	hashA := canonicalTestHash("event-batch-a")
	hashB := canonicalTestHash("event-batch-b")
	hashC := canonicalTestHash("event-batch-c")

	// Step 1: Insert A and B
	res1, err := repo.InsertBatch(ctx, []usage.Event{
		makeBaseTestEvent(hashA, 1000),
		makeBaseTestEvent(hashB, 2000),
	})
	if err != nil || res1.Inserted != 2 {
		t.Fatalf("first insert failed: %+v, err: %v", res1, err)
	}

	// Step 2: Insert full duplicate batch [A, B]
	// Preflight should skip without needing to insert anything
	res2, err := repo.InsertBatch(ctx, []usage.Event{
		makeBaseTestEvent(hashA, 1000),
		makeBaseTestEvent(hashB, 2000),
	})
	if err != nil {
		t.Fatalf("duplicate batch insert failed: %v", err)
	}
	if res2.Inserted != 0 || res2.Skipped != 2 || len(res2.InsertedEventHashes) != 0 {
		t.Fatalf("expected all skipped in preflight, got: %+v", res2)
	}

	// Step 3: Mixed batch [A, C] (A is duplicate, C is new)
	res3, err := repo.InsertBatch(ctx, []usage.Event{
		makeBaseTestEvent(hashA, 1000),
		makeBaseTestEvent(hashC, 3000),
	})
	if err != nil {
		t.Fatalf("mixed batch insert failed: %v", err)
	}
	if res3.Inserted != 1 || res3.Skipped != 1 || len(res3.InsertedEventHashes) != 1 || res3.InsertedEventHashes[0] != hashC {
		t.Fatalf("expected 1 inserted (hashC) and 1 skipped, got: %+v", res3)
	}
}

func TestInsertedEventHashesContract(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	repo := New(db)
	ctx := context.Background()

	hashes := []string{
		canonicalTestHash("order-test-1"),
		canonicalTestHash("order-test-2"),
		canonicalTestHash("order-test-3"),
	}
	events := []usage.Event{
		makeBaseTestEvent(hashes[0], 1000),
		makeBaseTestEvent(hashes[1], 2000),
		makeBaseTestEvent(hashes[2], 3000),
	}

	res, err := repo.InsertBatch(ctx, events)
	if err != nil {
		t.Fatalf("insert batch: %v", err)
	}
	if res.Inserted != 3 {
		t.Fatalf("inserted count = %d, want 3", res.Inserted)
	}
	if len(res.InsertedEventHashes) != 3 {
		t.Fatalf("inserted event hashes length = %d, want 3", len(res.InsertedEventHashes))
	}
	for i := range hashes {
		if res.InsertedEventHashes[i] != hashes[i] {
			t.Fatalf("hash at index %d mismatch: got %q want %q", i, res.InsertedEventHashes[i], hashes[i])
		}
	}
}

func TestTransactionAtomicityOnFailure(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	repo := New(db)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately to induce failure during tx

	hash1 := canonicalTestHash("atomicity-test-1")
	events := []usage.Event{
		makeBaseTestEvent(hash1, 1000),
	}

	_, err = repo.InsertBatch(ctx, events)
	if err == nil {
		t.Fatalf("expected error from canceled context")
	}

	// Verify no orphaned ledger record was persisted
	var ledgerCount int
	err = db.QueryRowContext(context.Background(), `select count(*) from usage_event_identity_ledger where event_hash = ?`, hash1).Scan(&ledgerCount)
	if err != nil {
		t.Fatalf("query ledger count: %v", err)
	}
	if ledgerCount != 0 {
		t.Fatalf("orphaned ledger entry survived rollback, count = %d", ledgerCount)
	}
}

func makeBaseTestEvent(hash string, timestampMS int64) usage.Event {
	return usage.Event{
		EventHash:        hash,
		TimestampMS:      timestampMS,
		Timestamp:        time.UnixMilli(timestampMS).UTC().Format(time.RFC3339Nano),
		Provider:         "codex",
		Model:            "gpt-5",
		AuthFileSnapshot: "account.json",
		AuthIndex:        "auth-1",
		Source:           "account.json",
		InputTokens:      10,
		OutputTokens:     5,
		TotalTokens:      15,
		CreatedAtMS:      timestampMS,
	}
}
