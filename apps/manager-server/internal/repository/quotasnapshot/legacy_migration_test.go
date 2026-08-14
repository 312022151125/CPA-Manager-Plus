package quotasnapshot_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	quotasnapshotrepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/quotasnapshot"
	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
)

func TestBackfillLegacySnapshotsBatchProcessesWholeGroupsAndResumes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "usage.sqlite")
	db, err := sqliterepo.Open(path)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	seedLegacySnapshot(t, db, "account-codex", "codex", "weekly", "weekly", "inspection", "codex-1", 1000)
	seedLegacySnapshot(t, db, "account-codex", "codex", "five-hour", "five_hour", "inspection", "codex-1", 1000)
	seedLegacySnapshot(t, db, "account-xai", "xai", "included-free-rolling-24h", "rolling_24h", "response_body", "xai-1", 2000)
	repository := quotasnapshotrepo.New(db)
	candidates, err := repository.ListCandidates(context.Background(), "account-codex", "codex", 10)
	if err != nil {
		t.Fatalf("list legacy candidates before backfill: %v", err)
	}
	if len(candidates) != 2 || candidates[0].ObservationID != 0 || candidates[1].ObservationID != 0 {
		t.Fatalf("legacy candidate fallback before backfill = %#v", candidates)
	}

	result, err := quotasnapshotrepo.BackfillLegacySnapshotsBatch(context.Background(), db, 10)
	if err != nil {
		t.Fatalf("backfill first legacy group: %v", err)
	}
	if result.Processed != 2 || result.LastSnapshotID != 2 || !result.Pending || result.Completed {
		t.Fatalf("first legacy group result = %#v", result)
	}
	assertLegacySnapshotAttachment(t, db, 1, true)
	assertLegacySnapshotAttachment(t, db, 2, true)
	assertLegacySnapshotAttachment(t, db, 3, false)
	candidates, err = repository.ListCandidates(context.Background(), "account-codex", "codex", 10)
	if err != nil {
		t.Fatalf("list candidates after first backfill: %v", err)
	}
	if len(candidates) != 2 || candidates[0].ObservationID == 0 || candidates[1].ObservationID == 0 {
		t.Fatalf("candidate fallback after first backfill = %#v", candidates)
	}
	var relationshipKind, containerID string
	if err := db.QueryRow(`select coalesce(relationship_kind, ''),
		coalesce(container_provider_window_id, '') from account_quota_windows
		where account_key = 'account-codex' and provider_window_id = 'five-hour'`).Scan(
		&relationshipKind,
		&containerID,
	); err != nil {
		t.Fatalf("read migrated Codex relationship: %v", err)
	}
	if relationshipKind != "concurrent_subwindow" || containerID != "weekly" {
		t.Fatalf("migrated Codex relationship = %q/%q", relationshipKind, containerID)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close interrupted migration database: %v", err)
	}

	db, err = sqliterepo.Open(path)
	if err != nil {
		t.Fatalf("reopen interrupted migration database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	result, err = quotasnapshotrepo.BackfillLegacySnapshotsBatch(context.Background(), db, 10)
	if err != nil {
		t.Fatalf("resume legacy migration: %v", err)
	}
	if result.Processed != 1 || result.LastSnapshotID != 3 || result.Pending || !result.Completed {
		t.Fatalf("resumed legacy group result = %#v", result)
	}
	assertLegacySnapshotAttachment(t, db, 3, true)
	var inventoryScope string
	if err := db.QueryRow(`select inventory_scope_key from account_quota_windows
		where account_key = 'account-xai'`).Scan(&inventoryScope); err != nil {
		t.Fatalf("read migrated xAI inventory scope: %v", err)
	}
	if inventoryScope != "xai:included-free" {
		t.Fatalf("migrated xAI inventory scope = %q, want xai:included-free", inventoryScope)
	}

	result, err = quotasnapshotrepo.BackfillLegacySnapshotsBatch(context.Background(), db, 10)
	if err != nil {
		t.Fatalf("repeat completed legacy migration: %v", err)
	}
	if result.Processed != 0 || !result.Completed {
		t.Fatalf("repeated completed migration result = %#v", result)
	}
	var observations, snapshots, processedRows int
	var status string
	if err := db.QueryRow(`select count(*) from account_quota_observations`).Scan(&observations); err != nil {
		t.Fatalf("count migrated observations: %v", err)
	}
	if err := db.QueryRow(`select count(*) from account_quota_snapshots`).Scan(&snapshots); err != nil {
		t.Fatalf("count preserved snapshots: %v", err)
	}
	if err := db.QueryRow(`select status, processed_rows from usage_data_migrations where name = ?`,
		quotasnapshotrepo.LegacySnapshotMigrationName,
	).Scan(&status, &processedRows); err != nil {
		t.Fatalf("read completed migration state: %v", err)
	}
	if observations != 2 || snapshots != 3 || status != "completed" || processedRows != 3 {
		t.Fatalf("completed migration = observations:%d snapshots:%d status:%q processed:%d", observations, snapshots, status, processedRows)
	}
}

func TestBackfillLegacySnapshotsBatchRejectsOversizedGroupAtomically(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	seedLegacySnapshot(t, db, "account-1", "codex", "weekly", "weekly", "inspection", "group-1", 1000)
	seedLegacySnapshot(t, db, "account-1", "codex", "five-hour", "five_hour", "inspection", "group-1", 1000)

	_, err = quotasnapshotrepo.BackfillLegacySnapshotsBatch(context.Background(), db, 1)
	if err == nil || !strings.Contains(err.Error(), "exceeds safe batch limit 1") {
		t.Fatalf("oversized group error = %v", err)
	}
	var attached, observations int
	if err := db.QueryRow(`select count(*) from account_quota_snapshots where observation_id is not null`).Scan(&attached); err != nil {
		t.Fatalf("count partially attached snapshots: %v", err)
	}
	if err := db.QueryRow(`select count(*) from account_quota_observations`).Scan(&observations); err != nil {
		t.Fatalf("count partially inserted observations: %v", err)
	}
	if attached != 0 || observations != 0 {
		t.Fatalf("oversized group partially migrated snapshots:%d observations:%d", attached, observations)
	}

	result, err := quotasnapshotrepo.BackfillLegacySnapshotsBatch(context.Background(), db, 2)
	if err != nil {
		t.Fatalf("retry oversized group with sufficient limit: %v", err)
	}
	if result.Processed != 2 || !result.Completed {
		t.Fatalf("retried group result = %#v", result)
	}
}

func TestBackfillLegacySnapshotsBatchUsesLifecycleOrderInsteadOfInsertionOrder(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	seedLegacySnapshot(t, db, "account-1", "codex", "weekly", "weekly", "inspection", "newer", 2000)
	seedLegacySnapshot(t, db, "account-1", "codex", "weekly", "weekly", "response_body", "older", 1000)

	result, err := quotasnapshotrepo.BackfillLegacySnapshotsBatch(context.Background(), db, 10)
	if err != nil {
		t.Fatalf("backfill earliest lifecycle group: %v", err)
	}
	if result.Processed != 1 || result.LastSnapshotID != 2 || !result.Pending {
		t.Fatalf("earliest lifecycle group result = %#v", result)
	}
	assertLegacySnapshotAttachment(t, db, 1, false)
	assertLegacySnapshotAttachment(t, db, 2, true)

	result, err = quotasnapshotrepo.BackfillLegacySnapshotsBatch(context.Background(), db, 10)
	if err != nil {
		t.Fatalf("backfill later lifecycle group: %v", err)
	}
	if result.Processed != 1 || !result.Completed {
		t.Fatalf("later lifecycle group result = %#v", result)
	}
	var appliedRows int
	if err := db.QueryRow(`select count(*) from account_quota_observations where lifecycle_applied = 1`).Scan(&appliedRows); err != nil {
		t.Fatalf("count lifecycle-applied observations: %v", err)
	}
	if appliedRows != 2 {
		t.Fatalf("lifecycle-applied observations = %d, want 2", appliedRows)
	}
}

func seedLegacySnapshot(
	t *testing.T,
	db *sql.DB,
	accountKey, provider, providerWindowID, windowKind, source, sourceObservationID string,
	observedAtMS int64,
) {
	t.Helper()
	if _, err := db.Exec(`insert into account_quota_snapshots (
		account_key, provider, provider_window_id, window_kind, window_mode,
		model_scope_kind, source, source_observation_id, observed_at_ms,
		boundary_accuracy, duration_seconds, used_percent, remaining_percent,
		created_at_ms
	) values (?, ?, ?, ?, 'fixed', 'all', ?, ?, ?, 'exact', 3600, 25, 75, ?)`,
		accountKey,
		provider,
		providerWindowID,
		windowKind,
		source,
		sourceObservationID,
		observedAtMS,
		observedAtMS,
	); err != nil {
		t.Fatalf("seed legacy snapshot %s: %v", providerWindowID, err)
	}
}

func assertLegacySnapshotAttachment(t *testing.T, db *sql.DB, id int64, wantAttached bool) {
	t.Helper()
	var observationID sql.NullInt64
	if err := db.QueryRow(`select observation_id from account_quota_snapshots where id = ?`, id).Scan(&observationID); err != nil {
		t.Fatalf("read legacy snapshot %d: %v", id, err)
	}
	if observationID.Valid != wantAttached {
		t.Fatalf("legacy snapshot %d attachment = %v, want %t", id, observationID, wantAttached)
	}
}
