package sqlite

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/usageprojection"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usageidentity"
)

func TestDerivedIndexesAreDeferredUntilPostListenMaintenance(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	for _, index := range derivedIndexStatements {
		var count int
		if err := db.QueryRow(`select count(*) from sqlite_master where type = 'index' and name = ?`, index.name).Scan(&count); err != nil {
			t.Fatalf("inspect deferred index %s: %v", index.name, err)
		}
		if count != 0 {
			t.Fatalf("deferred index %s exists before post-listen maintenance", index.name)
		}
	}

	if err := RunDerivedStartupMaintenance(context.Background(), db); err != nil {
		t.Fatalf("run post-listen startup maintenance: %v", err)
	}
	for _, index := range derivedIndexStatements {
		var count int
		if err := db.QueryRow(`select count(*) from sqlite_master where type = 'index' and name = ?`, index.name).Scan(&count); err != nil {
			t.Fatalf("inspect post-listen index %s: %v", index.name, err)
		}
		if count != 1 {
			t.Fatalf("post-listen index %s count = %d, want 1", index.name, count)
		}
	}
}

func TestDerivedIndexesCanBePreparedForNonEmptyUpgradeTables(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`insert into usage_monitoring_selector_daily_rollups_v1 (
		model_format_revision, bucket_ms, model, api_key_hash, provider,
		auth_file_snapshot, account_snapshot, auth_label_snapshot,
		auth_index, source, source_hash, updated_at_ms
	) values (?, 0, 'model', '', '', '', '', '', '', '', '', 1)`, usageidentity.ModelFormatVersion); err != nil {
		t.Fatalf("seed non-empty upgrade table: %v", err)
	}

	if err := RunDerivedStartupMaintenance(context.Background(), db); err != nil {
		t.Fatalf("prepare indexes for non-empty upgrade table: %v", err)
	}
	var count int
	if err := db.QueryRow(`select count(*) from sqlite_master where type = 'index'
		and name = 'idx_usage_monitoring_selector_revision_bucket'`).Scan(&count); err != nil {
		t.Fatalf("inspect revision index: %v", err)
	}
	if count != 1 {
		t.Fatalf("revision index count = %d, want 1", count)
	}
}

func TestDerivedIndexPreparationReclaimsNamesFromParkedTables(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`create index idx_usage_monitoring_selector_daily_bucket
		on usage_monitoring_selector_daily_rollups_v1(bucket_ms)`); err != nil {
		t.Fatalf("create v1.11.12 selector index: %v", err)
	}
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin selector park: %v", err)
	}
	if err := parkAndRecreateDerivedTable(tx, usageMonitoringSelectorDailyTable, usageMonitoringSelectorLegacy); err != nil {
		_ = tx.Rollback()
		t.Fatalf("park v1.11.12 selector table: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit selector park: %v", err)
	}
	var indexedTable string
	if err := db.QueryRow(`select tbl_name from sqlite_master where type = 'index'
		and name = 'idx_usage_monitoring_selector_daily_bucket'`).Scan(&indexedTable); err != nil {
		t.Fatalf("inspect parked selector index: %v", err)
	}
	if indexedTable != usageMonitoringSelectorLegacy {
		t.Fatalf("parked selector index table = %q, want %q", indexedTable, usageMonitoringSelectorLegacy)
	}

	if err := RunDerivedStartupMaintenance(context.Background(), db); err != nil {
		t.Fatalf("prepare indexes after selector park: %v", err)
	}
	if err := db.QueryRow(`select tbl_name from sqlite_master where type = 'index'
		and name = 'idx_usage_monitoring_selector_daily_bucket'`).Scan(&indexedTable); err != nil {
		t.Fatalf("inspect reclaimed selector index: %v", err)
	}
	if indexedTable != usageMonitoringSelectorDailyTable {
		t.Fatalf("reclaimed selector index table = %q, want %q", indexedTable, usageMonitoringSelectorDailyTable)
	}
}

func TestCleanupDerivedBatchIsBoundedAndResumable(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`create table ` + usageAccountModelRollupsLegacy + ` (id integer primary key)`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}
	if _, err := db.Exec(`with recursive ids(id) as (
		select 1 union all select id + 1 from ids where id < 2501
	) insert into ` + usageAccountModelRollupsLegacy + ` (id) select id from ids`); err != nil {
		t.Fatalf("seed legacy rows: %v", err)
	}

	ctx := context.Background()
	for index, wantProcessed := range []int64{1000, 1000, 501} {
		processed, pending, err := cleanupDerivedBatch(ctx, db, 1000)
		if err != nil {
			t.Fatalf("cleanup batch %d: %v", index+1, err)
		}
		if processed != wantProcessed || !pending {
			t.Fatalf("cleanup batch %d = processed:%d pending:%t, want %d,true", index+1, processed, pending, wantProcessed)
		}
	}
	processed, pending, err := cleanupDerivedBatch(ctx, db, 1000)
	if err != nil {
		t.Fatalf("drop empty legacy table: %v", err)
	}
	if processed != 0 || !pending {
		t.Fatalf("drop empty legacy table = processed:%d pending:%t", processed, pending)
	}
	exists, err := derivedTableExists(ctx, db, usageAccountModelRollupsLegacy)
	if err != nil {
		t.Fatalf("inspect removed legacy table: %v", err)
	}
	if exists {
		t.Fatal("legacy table still exists after bounded cleanup")
	}
}

func TestMonitoringFTSCleanupIsBoundedAndRequiresOfflineFinalization(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`with recursive ids(id) as (
		select 1 union all select id + 1 from ids where id < 2501
	) insert into usage_events (
		id, request_id, event_hash, timestamp_ms, timestamp, model, created_at_ms
	) select id, 'request-' || id, 'event-' || id, id, cast(id as text), 'model', id from ids`); err != nil {
		t.Fatalf("seed usage events: %v", err)
	}
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin projection seed: %v", err)
	}
	if err := usageprojection.UpsertEventRange(ctx, tx, 0, 2501, 1); err != nil {
		_ = tx.Rollback()
		t.Fatalf("seed projection rows: %v", err)
	}
	if err := dropUsageMonitoringSearchTriggers(tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("drop active search triggers: %v", err)
	}
	ftsTable, projectionTable, err := parkUsageMonitoringSearchGeneration(tx, true)
	if err != nil {
		_ = tx.Rollback()
		t.Fatalf("park monitoring generation: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit parked monitoring generation: %v", err)
	}

	for index, wantProcessed := range []int64{1000, 1000, 501} {
		processed, pending, err := cleanupDerivedBatch(ctx, db, 1000)
		if err != nil {
			t.Fatalf("cleanup monitoring batch %d: %v", index+1, err)
		}
		if processed != wantProcessed || !pending {
			t.Fatalf("cleanup monitoring batch %d = processed:%d pending:%t, want %d,true", index+1, processed, pending, wantProcessed)
		}
	}
	var status string
	var processedRows int64
	if err := db.QueryRow(`select status, processed_rows from usage_derived_cleanup_jobs
		where fts_table = ?`, ftsTable).Scan(&status, &processedRows); err != nil {
		t.Fatalf("read monitoring cleanup job: %v", err)
	}
	if status != "offline_required" || processedRows != 2501 {
		t.Fatalf("monitoring cleanup job = status:%q processed:%d", status, processedRows)
	}
	assertTableCount(t, db, projectionTable, 0)
	assertTableCount(t, db, "usage_events", 2501)

	result, err := CleanupDerivedOffline(ctx, db)
	if err != nil {
		t.Fatalf("finalize monitoring cleanup offline: %v", err)
	}
	if result.CompletedJobs != 1 || result.ProcessedRows != 0 {
		t.Fatalf("offline cleanup result = %+v", result)
	}
	for _, tableName := range []string{ftsTable, projectionTable} {
		exists, err := derivedTableExists(ctx, db, tableName)
		if err != nil {
			t.Fatalf("inspect finalized table %s: %v", tableName, err)
		}
		if exists {
			t.Fatalf("offline cleanup retained table %s", tableName)
		}
	}
	if err := db.QueryRow(`select status from usage_derived_cleanup_jobs where fts_table = ?`, ftsTable).Scan(&status); err != nil {
		t.Fatalf("read finalized monitoring cleanup job: %v", err)
	}
	if status != "completed" {
		t.Fatalf("finalized monitoring cleanup status = %q", status)
	}
	assertTableCount(t, db, "usage_events", 2501)
}

func TestMonitoringFTSRecoveryAllocatesNewGenerationWhilePriorJobAwaitsOfflineCleanup(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	seedProjectionEvent := func(id int64) {
		t.Helper()
		if _, err := db.Exec(`insert into usage_events (
			id, request_id, event_hash, timestamp_ms, timestamp, model, created_at_ms
		) values (?, ?, ?, ?, ?, 'model', ?)`, id, id, id, id, id, id); err != nil {
			t.Fatalf("seed usage event %d: %v", id, err)
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatalf("begin projection seed %d: %v", id, err)
		}
		if err := usageprojection.UpsertEventRange(ctx, tx, id-1, id, id); err != nil {
			_ = tx.Rollback()
			t.Fatalf("seed projection event %d: %v", id, err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatalf("commit projection event %d: %v", id, err)
		}
	}
	rebuildGeneration := func() {
		t.Helper()
		if _, err := db.Exec(`delete from settings where key = ?`, usageMonitoringModelFormatVersionKey); err != nil {
			t.Fatalf("force monitoring projection recovery: %v", err)
		}
		if err := ensureUsageMonitoringProjectionIdentity(db); err != nil {
			t.Fatalf("recover monitoring projection: %v", err)
		}
	}

	seedProjectionEvent(1)
	rebuildGeneration()
	if _, err := cleanupDerivedUntilIdle(ctx, db); err != nil {
		t.Fatalf("drain first generation online rows: %v", err)
	}
	if err := ensureUsageMonitoringSearchIndex(db); err != nil {
		t.Fatalf("recreate active monitoring search index: %v", err)
	}
	seedProjectionEvent(2)
	rebuildGeneration()

	rows, err := db.Query(`select generation, status, fts_table, projection_table
		from usage_derived_cleanup_jobs where kind = 'monitoring_fts' order by generation`)
	if err != nil {
		t.Fatalf("read monitoring cleanup generations: %v", err)
	}
	defer rows.Close()
	type generationState struct {
		generation      int64
		status          string
		ftsTable        string
		projectionTable string
	}
	states := make([]generationState, 0, 2)
	for rows.Next() {
		var state generationState
		if err := rows.Scan(&state.generation, &state.status, &state.ftsTable, &state.projectionTable); err != nil {
			t.Fatalf("scan monitoring cleanup generation: %v", err)
		}
		states = append(states, state)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate monitoring cleanup generations: %v", err)
	}
	if len(states) != 2 {
		t.Fatalf("monitoring cleanup generations = %#v, want 2", states)
	}
	if states[0].status != "offline_required" || states[1].status != "online_cleanup" {
		t.Fatalf("monitoring cleanup generation states = %#v", states)
	}
	if states[0].generation >= states[1].generation || states[0].ftsTable == states[1].ftsTable || states[0].projectionTable == states[1].projectionTable {
		t.Fatalf("monitoring cleanup generation names were not advanced: %#v", states)
	}
}

func TestMonitoringFTSCleanupDefersInconsistentPairsToOfflineFinalization(t *testing.T) {
	for _, missingTable := range []string{"fts", "projection"} {
		t.Run(missingTable, func(t *testing.T) {
			db, ftsTable, projectionTable := parkSingleMonitoringGeneration(t)
			tableName := ftsTable
			if missingTable == "projection" {
				tableName = projectionTable
			}
			if _, err := db.Exec(`drop table ` + tableName); err != nil {
				t.Fatalf("drop paired %s table: %v", missingTable, err)
			}

			processed, pending, err := cleanupDerivedBatch(context.Background(), db, 1000)
			if err != nil {
				t.Fatalf("inspect inconsistent monitoring cleanup pair: %v", err)
			}
			if processed != 0 || !pending {
				t.Fatalf("inconsistent monitoring cleanup = processed:%d pending:%t", processed, pending)
			}
			var status string
			var detail *string
			if err := db.QueryRow(`select status, last_error from usage_derived_cleanup_jobs
				where fts_table = ?`, ftsTable).Scan(&status, &detail); err != nil {
				t.Fatalf("read inconsistent monitoring cleanup job: %v", err)
			}
			if status != "offline_required" || detail == nil || *detail == "" {
				t.Fatalf("inconsistent monitoring cleanup job = status:%q detail:%v", status, detail)
			}
			if missingTable == "fts" {
				assertTableCount(t, db, projectionTable, 1)
			}
		})
	}
}

func parkSingleMonitoringGeneration(t testing.TB) (*sql.DB, string, string) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`insert into usage_events (
		id, request_id, event_hash, timestamp_ms, timestamp, model, created_at_ms
	) values (1, 'request-1', 'event-1', 1, '1', 'model', 1)`); err != nil {
		t.Fatalf("seed usage event: %v", err)
	}
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin monitoring generation fixture: %v", err)
	}
	if err := usageprojection.UpsertEventRange(ctx, tx, 0, 1, 1); err != nil {
		_ = tx.Rollback()
		t.Fatalf("seed monitoring projection: %v", err)
	}
	if err := dropUsageMonitoringSearchTriggers(tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("drop active search triggers: %v", err)
	}
	ftsTable, projectionTable, err := parkUsageMonitoringSearchGeneration(tx, true)
	if err != nil {
		_ = tx.Rollback()
		t.Fatalf("park monitoring generation: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit monitoring generation fixture: %v", err)
	}
	return db, ftsTable, projectionTable
}

func TestCleanupDerivedBatchKeepsActiveSelectorRevision(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, statement := range []string{
		`insert into usage_monitoring_selector_daily_rollups_v1 (
			model_format_revision, bucket_ms, model, api_key_hash, provider,
			auth_file_snapshot, account_snapshot, auth_label_snapshot,
			auth_index, source, source_hash, updated_at_ms
		) values ('legacy', 0, 'legacy-model', '', '', '', '', '', '', '', '', 1)`,
		`insert into usage_monitoring_selector_daily_rollups_v1 (
			model_format_revision, bucket_ms, model, api_key_hash, provider,
			auth_file_snapshot, account_snapshot, auth_label_snapshot,
			auth_index, source, source_hash, updated_at_ms
		) values ('1', 0, 'current-model', '', '', '', '', '', '', '', '', 1)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed selector revision fixture: %v", err)
		}
	}
	processed, pending, err := cleanupDerivedBatch(context.Background(), db, 1000)
	if err != nil {
		t.Fatalf("cleanup selector revisions: %v", err)
	}
	if processed != 1 || !pending {
		t.Fatalf("cleanup selector revisions = processed:%d pending:%t", processed, pending)
	}
	var currentRows, legacyRows int
	if err := db.QueryRow(`select count(*) from usage_monitoring_selector_daily_rollups_v1 where model_format_revision = ?`, usageidentity.ModelFormatVersion).Scan(&currentRows); err != nil {
		t.Fatalf("count current selector rows: %v", err)
	}
	if err := db.QueryRow(`select count(*) from usage_monitoring_selector_daily_rollups_v1 where model_format_revision <> ?`, usageidentity.ModelFormatVersion).Scan(&legacyRows); err != nil {
		t.Fatalf("count legacy selector rows: %v", err)
	}
	if currentRows != 1 || legacyRows != 0 {
		t.Fatalf("selector rows after cleanup = current:%d legacy:%d", currentRows, legacyRows)
	}
}

func TestCleanupDerivedBatchUsesCurrentPricingAndStatsRevisions(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, statement := range []string{
		`update usage_pricing_rollup_state set structure_revision = 'pricing-current'
			where rollup_name = 'pricing_v1'`,
		`update usage_monitoring_rollup_state set structure_revision = 'stats-current'
			where rollup_name = 'stats_v1'`,
		`insert into usage_pricing_hourly_rollups_v1 (
			structure_revision, bucket_ms, model, billing_model, pricing_model,
			service_tier, context_threshold_tokens, failed, calls, updated_at_ms
		) values
			('pricing-old', 0, 'old', 'old', 'old', '', -1, 0, 1, 1),
			('pricing-current', 0, 'current', 'current', 'current', '', -1, 0, 1, 1)`,
		`insert into usage_monitoring_account_daily_rollups_v1 (
			structure_revision, bucket_ms, account_snapshot, auth_label_snapshot,
			provider, auth_provider_snapshot, auth_index, source, source_hash,
			auth_file_snapshot, api_key_hash, executor_type, model, billing_model,
			pricing_model, service_tier, context_threshold_tokens, failed,
			calls, last_seen_ms, updated_at_ms
		) values
			('stats-old', 0, 'old', '', '', '', '', '', '', '', '', '',
				'old', 'old', 'old', '', -1, 0, 1, 1, 1),
			('stats-current', 0, 'current', '', '', '', '', '', '', '', '', '',
				'current', 'current', 'current', '', -1, 0, 1, 1, 1)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed revision cleanup fixture: %v", err)
		}
	}

	for index := 0; index < 2; index++ {
		processed, pending, err := cleanupDerivedBatch(context.Background(), db, 1000)
		if err != nil {
			t.Fatalf("cleanup revision batch %d: %v", index+1, err)
		}
		if processed != 1 || !pending {
			t.Fatalf("cleanup revision batch %d = processed:%d pending:%t", index+1, processed, pending)
		}
	}
	for tableName, revision := range map[string]string{
		"usage_pricing_hourly_rollups_v1": "pricing-current",
		usageMonitoringAccountDailyTable:  "stats-current",
	} {
		var rows, wrongRows int
		if err := db.QueryRow(`select count(*), count(*) filter (where structure_revision <> ?)
			from `+tableName, revision).Scan(&rows, &wrongRows); err != nil {
			t.Fatalf("inspect active rows in %s: %v", tableName, err)
		}
		if rows != 1 || wrongRows != 0 {
			t.Fatalf("active rows in %s = total:%d wrongRevision:%d", tableName, rows, wrongRows)
		}
	}

	if _, err := db.Exec(`update usage_pricing_rollup_state set structure_revision = 'pricing-next'
		where rollup_name = 'pricing_v1'`); err != nil {
		t.Fatalf("switch pricing revision: %v", err)
	}
	processed, _, err := cleanupDerivedBatch(context.Background(), db, 1000)
	if err != nil {
		t.Fatalf("cleanup after pricing revision switch: %v", err)
	}
	if processed != 1 {
		t.Fatalf("cleanup after pricing revision switch processed = %d, want 1", processed)
	}
	assertTableCount(t, db, "usage_pricing_hourly_rollups_v1", 0)
}
