package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usageidentity"
)

const (
	derivedCleanupBatchLimit = 1000
	derivedCleanupPause      = 50 * time.Millisecond
	derivedRetryDelay        = 30 * time.Second
	derivedCheckInterval     = 30 * time.Second
)

var derivedLegacyTables = []string{
	usageAccountModelRollupsLegacy,
	usagePricingAccountLegacy,
	usageDashboardHourlyLegacy,
	usageHourlyAggregateLegacy,
	usageMonitoringAccountLegacy,
	usageMonitoringAPIKeyLegacy,
	usageMonitoringSelectorLegacy,
	usageMonitoringHeaderLegacy,
	usageMonitoringProjectionLegacy,
	usageDashboardHourlySourceLegacy,
	usagePricingHourlySourceLegacy,
	usageCacheChangesSourceLegacy,
	usageAccountModelSourceLegacy,
	usagePricingAccountSourceLegacy,
}

type OfflineCleanupResult struct {
	CompletedJobs int
	ProcessedRows int64
}

func ensureDerivedCleanupJobSchema(db *sql.DB) error {
	if _, err := db.Exec(`create table if not exists usage_derived_cleanup_jobs (
		id integer primary key autoincrement,
		generation integer not null unique,
		kind text not null,
		status text not null,
		projection_table text,
		fts_table text not null unique,
		processed_rows integer not null default 0,
		created_at_ms integer not null,
		updated_at_ms integer not null,
		finished_at_ms integer,
		last_error text
	)`); err != nil {
		return fmt.Errorf("create derived cleanup job schema: %w", err)
	}
	var ftsExists, projectionExists int
	if err := db.QueryRow(`select count(*) from sqlite_master where type = 'table' and name = ?`, usageMonitoringSearchLegacy).Scan(&ftsExists); err != nil {
		return fmt.Errorf("inspect retained legacy monitoring FTS: %w", err)
	}
	if ftsExists == 0 {
		return nil
	}
	if err := db.QueryRow(`select count(*) from sqlite_master where type = 'table' and name = ?`, usageMonitoringProjectionLegacy).Scan(&projectionExists); err != nil {
		return fmt.Errorf("inspect retained legacy monitoring projection: %w", err)
	}
	status := "offline_required"
	projectionTable := any(nil)
	if projectionExists != 0 {
		status = "online_cleanup"
		projectionTable = usageMonitoringProjectionLegacy
	}
	nowMS := time.Now().UnixMilli()
	if _, err := db.Exec(`insert or ignore into usage_derived_cleanup_jobs (
		generation, kind, status, projection_table, fts_table,
		processed_rows, created_at_ms, updated_at_ms
	) values (0, 'monitoring_fts', ?, ?, ?, 0, ?, ?)`,
		status,
		projectionTable,
		usageMonitoringSearchLegacy,
		nowMS,
		nowMS,
	); err != nil {
		return fmt.Errorf("adopt retained legacy monitoring FTS: %w", err)
	}
	return nil
}

var derivedIndexStatements = []struct {
	name      string
	tableName string
	sql       string
}{
	{"idx_usage_events_timestamp", "usage_events", `create index if not exists idx_usage_events_timestamp on usage_events(timestamp_ms)`},
	{"idx_usage_events_request_id", "usage_events", `create index if not exists idx_usage_events_request_id on usage_events(request_id)`},
	{"idx_usage_events_model", "usage_events", `create index if not exists idx_usage_events_model on usage_events(model)`},
	{"idx_usage_events_auth_index", "usage_events", `create index if not exists idx_usage_events_auth_index on usage_events(auth_index)`},
	{"idx_usage_events_endpoint", "usage_events", `create index if not exists idx_usage_events_endpoint on usage_events(endpoint)`},
	{"idx_usage_events_header_quota_recover", "usage_events", `create index if not exists idx_usage_events_header_quota_recover on usage_events(header_quota_recover_at_ms)`},
	{"idx_usage_events_header_error_kind", "usage_events", `create index if not exists idx_usage_events_header_error_kind on usage_events(header_error_kind)`},
	{"idx_usage_events_header_trace_id", "usage_events", `create index if not exists idx_usage_events_header_trace_id on usage_events(header_trace_id)`},
	{"idx_usage_events_latest_request_auth_file", "usage_events", `create index if not exists idx_usage_events_latest_request_auth_file on usage_events(auth_file_snapshot collate nocase, auth_index collate nocase, timestamp_ms desc, id desc)`},
	{"idx_usage_events_latest_request_source", "usage_events", `create index if not exists idx_usage_events_latest_request_source on usage_events(source collate nocase, auth_index collate nocase, timestamp_ms desc, id desc)`},
	{"idx_account_action_candidates_status_seen", "account_action_candidates", `create index if not exists idx_account_action_candidates_status_seen on account_action_candidates(status, last_seen_at_ms)`},
	{"idx_codex_inspection_runs_started_at", "codex_inspection_runs", `create index if not exists idx_codex_inspection_runs_started_at on codex_inspection_runs(started_at_ms)`},
	{"idx_codex_inspection_runs_status", "codex_inspection_runs", `create index if not exists idx_codex_inspection_runs_status on codex_inspection_runs(status)`},
	{"idx_codex_inspection_runs_trigger", "codex_inspection_runs", `create index if not exists idx_codex_inspection_runs_trigger on codex_inspection_runs(trigger_type, trigger_key)`},
	{"idx_codex_inspection_leases_expiry", "codex_inspection_leases", `create index if not exists idx_codex_inspection_leases_expiry on codex_inspection_leases(lease_expires_at_ms)`},
	{"idx_codex_inspection_results_run", "codex_inspection_results", `create index if not exists idx_codex_inspection_results_run on codex_inspection_results(run_id)`},
	{"idx_codex_inspection_logs_run", "codex_inspection_logs", `create index if not exists idx_codex_inspection_logs_run on codex_inspection_logs(run_id, created_at_ms)`},
	{"idx_quota_cooldowns_due", "quota_cooldowns", `create index if not exists idx_quota_cooldowns_due on quota_cooldowns(status, recover_at_ms)`},
	{"idx_quota_cooldowns_active_identity", "quota_cooldowns", `create unique index if not exists idx_quota_cooldowns_active_identity
		on quota_cooldowns (
			auth_file_name,
			owner,
			coalesce(trim(auth_index), ''),
			case
				when coalesce(trim(auth_index), '') <> '' then ''
				else case coalesce(lower(replace(trim(provider), '_', '-')), '')
					when 'x-ai' then 'xai'
					when 'grok' then 'xai'
					else coalesce(lower(replace(trim(provider), '_', '-')), '')
				end
			end,
			case
				when coalesce(trim(auth_index), '') <> '' then ''
				else coalesce(trim(account_snapshot), '')
			end
		)
		where status = 'active'`},
	{"idx_quota_observations_account_time", "account_quota_observations", `create index if not exists idx_quota_observations_account_time on account_quota_observations(account_key, provider, observed_at_ms desc)`},
	{"idx_quota_observations_inventory", "account_quota_observations", `create index if not exists idx_quota_observations_inventory on account_quota_observations(account_key, provider, inventory_scope_key, observed_at_ms desc)`},
	{"idx_quota_observations_lifecycle_watermark", "account_quota_observations", `create index if not exists idx_quota_observations_lifecycle_watermark on account_quota_observations(account_key, provider, inventory_scope_key, lifecycle_applied, observed_at_ms desc)`},
	{"idx_quota_windows_account_state", "account_quota_windows", `create index if not exists idx_quota_windows_account_state on account_quota_windows(account_key, provider, availability, updated_at_ms desc)`},
	{"idx_quota_windows_inventory", "account_quota_windows", `create index if not exists idx_quota_windows_inventory on account_quota_windows(account_key, provider, inventory_scope_key, availability)`},
	{"idx_quota_activations_active", "account_quota_window_activations", `create unique index if not exists idx_quota_activations_active on account_quota_window_activations(window_id) where deactivated_at_ms is null`},
	{"idx_quota_cycles_active", "account_quota_cycles", `create unique index if not exists idx_quota_cycles_active on account_quota_cycles(activation_id) where actual_end_ms is null`},
	{"idx_quota_cycles_history", "account_quota_cycles", `create index if not exists idx_quota_cycles_history on account_quota_cycles(activation_id, actual_start_ms desc)`},
	{"idx_quota_snapshots_latest", "account_quota_snapshots", `create index if not exists idx_quota_snapshots_latest on account_quota_snapshots(account_key, provider, provider_window_id, model_scope_kind, model_scope_key, observed_at_ms desc)`},
	{"idx_quota_snapshots_observation", "account_quota_snapshots", `create index if not exists idx_quota_snapshots_observation on account_quota_snapshots(observation_id)`},
	{"idx_quota_snapshots_window_cycle", "account_quota_snapshots", `create index if not exists idx_quota_snapshots_window_cycle on account_quota_snapshots(logical_window_id, cycle_id, observed_at_ms desc)`},
	{"idx_quota_snapshots_cycle_evidence", "account_quota_snapshots", `create index if not exists idx_quota_snapshots_cycle_evidence on account_quota_snapshots(cycle_id, observed_at_ms, id)`},
	{"idx_quota_snapshots_legacy_migration", "account_quota_snapshots", `create index if not exists idx_quota_snapshots_legacy_migration on account_quota_snapshots(
		account_key, provider, observed_at_ms,
		case lower(trim(source))
			when 'response_body' then 1
			when 'api_query' then 2
			when 'inspection' then 3
			else 0
		end,
		coalesce(source_observation_id, ''), id
	) where observation_id is null`},
	{"idx_usage_account_model_rollups_last_seen", usageAccountModelRollupsTable, `create index if not exists idx_usage_account_model_rollups_last_seen on usage_account_model_rollups(last_seen_ms)`},
	{"idx_usage_account_model_rollups_auth_index", usageAccountModelRollupsTable, `create index if not exists idx_usage_account_model_rollups_auth_index on usage_account_model_rollups(auth_index)`},
	{"idx_usage_pricing_hourly_bucket", "usage_pricing_hourly_rollups_v1", `create index if not exists idx_usage_pricing_hourly_bucket on usage_pricing_hourly_rollups_v1(structure_revision, bucket_ms)`},
	{"idx_usage_pricing_account_key", usagePricingAccountRollupsTable, `create index if not exists idx_usage_pricing_account_key on usage_pricing_account_rollups_v1(structure_revision, account_key)`},
	{"idx_usage_monitoring_account_daily_bucket", usageMonitoringAccountDailyTable, `create index if not exists idx_usage_monitoring_account_daily_bucket on usage_monitoring_account_daily_rollups_v1(structure_revision, bucket_ms)`},
	{"idx_usage_monitoring_account_daily_credential_window", usageMonitoringAccountDailyTable, `create index if not exists idx_usage_monitoring_account_daily_credential_window on usage_monitoring_account_daily_rollups_v1(structure_revision, trim(auth_file_snapshot), trim(auth_index), bucket_ms)`},
	{"idx_usage_monitoring_account_daily_legacy_window", usageMonitoringAccountDailyTable, `create index if not exists idx_usage_monitoring_account_daily_legacy_window on usage_monitoring_account_daily_rollups_v1(structure_revision, trim(source), trim(auth_index), bucket_ms)`},
	{"idx_usage_monitoring_api_key_daily_bucket", usageMonitoringAPIKeyDailyTable, `create index if not exists idx_usage_monitoring_api_key_daily_bucket on usage_monitoring_api_key_daily_rollups_v1(structure_revision, bucket_ms)`},
	{"idx_usage_monitoring_selector_daily_bucket", usageMonitoringSelectorDailyTable, `create index if not exists idx_usage_monitoring_selector_daily_bucket on usage_monitoring_selector_daily_rollups_v1(bucket_ms)`},
	{"idx_usage_monitoring_selector_revision_bucket", usageMonitoringSelectorDailyTable, `create index if not exists idx_usage_monitoring_selector_revision_bucket on usage_monitoring_selector_daily_rollups_v1(model_format_revision, bucket_ms)`},
	{"idx_usage_monitoring_event_projection_timestamp", "usage_monitoring_event_projection_v1", `create index if not exists idx_usage_monitoring_event_projection_timestamp on usage_monitoring_event_projection_v1(timestamp_ms desc, event_id desc)`},
	{"idx_usage_monitoring_event_projection_account_window", "usage_monitoring_event_projection_v1", `create index if not exists idx_usage_monitoring_event_projection_account_window on usage_monitoring_event_projection_v1(account_key, timestamp_ms, event_id)`},
	{"idx_usage_monitoring_event_projection_model_timestamp", "usage_monitoring_event_projection_v1", `create index if not exists idx_usage_monitoring_event_projection_model_timestamp on usage_monitoring_event_projection_v1(analytics_model, timestamp_ms desc, event_id desc)`},
	{"idx_usage_monitoring_header_latest_timestamp", usageMonitoringHeaderLatestTable, `create index if not exists idx_usage_monitoring_header_latest_timestamp on usage_monitoring_header_latest_v1(timestamp_ms desc, event_id desc)`},
	{"idx_usage_event_identity_ledger_raw_event_id", usageEventIdentityLedger, `create index if not exists idx_usage_event_identity_ledger_raw_event_id on usage_event_identity_ledger(raw_event_id)`},
	{"idx_usage_event_identity_ledger_bucket", usageEventIdentityLedger, `create index if not exists idx_usage_event_identity_ledger_bucket on usage_event_identity_ledger(bucket_ms)`},
}

// RunDerivedStartupMaintenance creates indexes only after the listener is
// available and before background writers are started. Legacy-row cleanup is
// deliberately left to StartDerivedMaintenance so its cost cannot delay the
// rest of the service from becoming operational.
func RunDerivedStartupMaintenance(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return nil
	}
	log.Printf("[derived-migration] post-listen index preparation started")
	if err := createDerivedIndexes(ctx, db); err != nil {
		return err
	}
	if err := ensureQuotaCooldownIdentityIndex(db); err != nil {
		return fmt.Errorf("prepare quota cooldown identity index: %w", err)
	}
	var offlineJobs int
	if err := db.QueryRowContext(ctx, `select count(*) from usage_derived_cleanup_jobs
		where kind = 'monitoring_fts' and status = 'offline_required'`).Scan(&offlineJobs); err != nil {
		return fmt.Errorf("inspect offline derived cleanup jobs: %w", err)
	}
	if offlineJobs > 0 {
		log.Printf("[derived-migration] cleanup requires offline finalization jobs=%d command=cleanup-derived", offlineJobs)
	}
	log.Printf("[derived-migration] post-listen index preparation completed")
	return nil
}

// StartDerivedMaintenance periodically removes revisions that become stale
// while the service is running. Index creation and unbounded virtual-table DDL
// are intentionally excluded from this online path.
func StartDerivedMaintenance(ctx context.Context, db *sql.DB) {
	if db == nil {
		return
	}
	go runDerivedMaintenance(ctx, db)
}

func runDerivedMaintenance(ctx context.Context, db *sql.DB) {
	ticker := time.NewTicker(derivedCheckInterval)
	defer ticker.Stop()
	for {
		processed, err := cleanupDerivedUntilIdle(ctx, db)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[derived-migration] periodic cleanup failed: %v", err)
		} else if processed > 0 {
			log.Printf("[derived-migration] periodic cleanup completed processed=%d", processed)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func cleanupDerivedUntilIdle(ctx context.Context, db *sql.DB) (int64, error) {
	processed := int64(0)
	for {
		batchProcessed, pending, err := cleanupDerivedBatch(ctx, db, derivedCleanupBatchLimit)
		if err != nil {
			return processed, err
		}
		processed += batchProcessed
		if batchProcessed > 0 && processed == batchProcessed {
			log.Printf("[derived-migration] cleanup started batchSize=%d", derivedCleanupBatchLimit)
		}
		if batchProcessed > 0 && processed%10000 < batchProcessed {
			log.Printf("[derived-migration] cleanup progress processed=%d", processed)
		}
		if !pending {
			return processed, nil
		}
		if !waitDerivedMaintenance(ctx, derivedCleanupPause) {
			return processed, ctx.Err()
		}
	}
}

func createDerivedIndexes(ctx context.Context, db *sql.DB) error {
	for _, index := range derivedIndexStatements {
		var indexedTable string
		err := db.QueryRowContext(ctx, `select tbl_name from sqlite_master
			where type = 'index' and name = ?`, index.name).Scan(&indexedTable)
		if err == nil && indexedTable == index.tableName {
			continue
		}
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("inspect derived index %s: %w", index.name, err)
		}
		if err == nil {
			log.Printf("[derived-migration] removing stale index %s from %s", index.name, indexedTable)
			if _, err := db.ExecContext(ctx, `drop index `+index.name); err != nil {
				return fmt.Errorf("remove stale derived index %s from %s: %w", index.name, indexedTable, err)
			}
		}
		log.Printf("[derived-migration] creating index %s", index.name)
		if _, err := db.ExecContext(ctx, index.sql); err != nil {
			return fmt.Errorf("create derived index %s: %w", index.name, err)
		}
	}
	return nil
}

func cleanupDerivedBatch(ctx context.Context, db *sql.DB, limit int) (int64, bool, error) {
	if limit <= 0 {
		limit = derivedCleanupBatchLimit
	}
	processed, handled, err := cleanupMonitoringFTSJobBatch(ctx, db, limit)
	if err != nil {
		return 0, false, err
	}
	if handled {
		return processed, true, nil
	}
	for _, tableName := range derivedLegacyTables {
		exists, err := derivedTableExists(ctx, db, tableName)
		if err != nil {
			return 0, false, err
		}
		if !exists {
			continue
		}
		processed, err := deleteDerivedRows(ctx, db, tableName, "", nil, limit)
		if err != nil {
			return 0, false, fmt.Errorf("clean legacy derived table %s: %w", tableName, err)
		}
		if processed > 0 {
			return processed, true, nil
		}
		if _, err := db.ExecContext(ctx, `drop table `+tableName); err != nil {
			return 0, false, fmt.Errorf("drop empty legacy derived table %s: %w", tableName, err)
		}
		log.Printf("[derived-migration] removed empty legacy table %s", tableName)
		return 0, true, nil
	}

	for _, target := range staleDerivedCleanupTargets() {
		processed, err := deleteDerivedRows(ctx, db, target.tableName, target.condition, target.args, limit)
		if err != nil {
			return 0, false, fmt.Errorf("clean stale derived rows in %s: %w", target.tableName, err)
		}
		if processed > 0 {
			return processed, true, nil
		}
	}
	return 0, false, nil
}

func cleanupMonitoringFTSJobBatch(ctx context.Context, db *sql.DB, limit int) (int64, bool, error) {
	var jobID int64
	var projectionTable, ftsTable string
	err := db.QueryRowContext(ctx, `select id, projection_table, fts_table
		from usage_derived_cleanup_jobs
		where kind = 'monitoring_fts' and status = 'online_cleanup'
		order by generation limit 1`).Scan(&jobID, &projectionTable, &ftsTable)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("load monitoring FTS cleanup job: %w", err)
	}
	if !validMonitoringCleanupTable(projectionTable, usageMonitoringProjectionLegacyPrefix, usageMonitoringProjectionLegacy) ||
		!validMonitoringCleanupTable(ftsTable, usageMonitoringSearchLegacyPrefix, usageMonitoringSearchLegacy) {
		return 0, false, fmt.Errorf("monitoring FTS cleanup job %d contains invalid table names", jobID)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, false, err
	}
	defer func() { _ = tx.Rollback() }()
	projectionExists, err := derivedTableExists(ctx, tx, projectionTable)
	if err != nil {
		return 0, false, err
	}
	if !projectionExists {
		if err := markMonitoringCleanupOfflineTx(ctx, tx, jobID, "paired projection table is missing"); err != nil {
			return 0, false, err
		}
		if err := tx.Commit(); err != nil {
			return 0, false, err
		}
		return 0, true, nil
	}
	ftsExists, err := derivedTableExists(ctx, tx, ftsTable)
	if err != nil {
		return 0, false, err
	}
	if !ftsExists {
		if err := markMonitoringCleanupOfflineTx(ctx, tx, jobID, "paired FTS table is missing"); err != nil {
			return 0, false, err
		}
		if err := tx.Commit(); err != nil {
			return 0, false, err
		}
		return 0, true, nil
	}
	var hasRows int
	if err := tx.QueryRowContext(ctx, `select exists(select 1 from `+projectionTable+` limit 1)`).Scan(&hasRows); err != nil {
		return 0, false, fmt.Errorf("inspect monitoring cleanup projection %s: %w", projectionTable, err)
	}
	if hasRows == 0 {
		if err := markMonitoringCleanupOfflineTx(ctx, tx, jobID, ""); err != nil {
			return 0, false, err
		}
		if err := tx.Commit(); err != nil {
			return 0, false, err
		}
		return 0, true, nil
	}
	if _, err := tx.ExecContext(ctx, `insert into `+ftsTable+` (`+ftsTable+`, rowid, search_text)
		select 'delete', event_id, search_text from `+projectionTable+` order by event_id limit ?`, limit); err != nil {
		_ = tx.Rollback()
		if markErr := markMonitoringCleanupOffline(ctx, db, jobID, fmt.Sprintf("paired FTS cleanup failed: %v", err)); markErr != nil {
			return 0, false, errors.Join(err, markErr)
		}
		return 0, true, nil
	}
	result, err := tx.ExecContext(ctx, `delete from `+projectionTable+` where event_id in (
		select event_id from `+projectionTable+` order by event_id limit ?
	)`, limit)
	if err != nil {
		return 0, false, fmt.Errorf("delete paired monitoring projection rows: %w", err)
	}
	processed, err := result.RowsAffected()
	if err != nil {
		return 0, false, fmt.Errorf("count paired monitoring projection rows: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `update usage_derived_cleanup_jobs set
		processed_rows = processed_rows + ?, updated_at_ms = ?, last_error = null
		where id = ?`, processed, time.Now().UnixMilli(), jobID); err != nil {
		return 0, false, err
	}
	if processed < int64(limit) {
		if err := markMonitoringCleanupOfflineTx(ctx, tx, jobID, ""); err != nil {
			return 0, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return processed, true, nil
}

type tableExistenceQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func derivedTableExists(ctx context.Context, db tableExistenceQuerier, tableName string) (bool, error) {
	var count int
	if err := db.QueryRowContext(ctx, `select count(*) from sqlite_master where type = 'table' and name = ?`, tableName).Scan(&count); err != nil {
		return false, err
	}
	return count != 0, nil
}

func markMonitoringCleanupOffline(ctx context.Context, db *sql.DB, jobID int64, detail string) error {
	_, err := db.ExecContext(ctx, `update usage_derived_cleanup_jobs set
		status = 'offline_required', updated_at_ms = ?, last_error = ? where id = ?`,
		time.Now().UnixMilli(), nullableCleanupDetail(detail), jobID)
	return err
}

func markMonitoringCleanupOfflineTx(ctx context.Context, tx *sql.Tx, jobID int64, detail string) error {
	_, err := tx.ExecContext(ctx, `update usage_derived_cleanup_jobs set
		status = 'offline_required', updated_at_ms = ?, last_error = ? where id = ?`,
		time.Now().UnixMilli(), nullableCleanupDetail(detail), jobID)
	return err
}

func nullableCleanupDetail(detail string) any {
	if detail == "" {
		return nil
	}
	return detail
}

func validMonitoringCleanupTable(tableName, generatedPrefix, fixedName string) bool {
	if tableName == fixedName {
		return true
	}
	if !strings.HasPrefix(tableName, generatedPrefix) {
		return false
	}
	suffix := strings.TrimPrefix(tableName, generatedPrefix)
	if len(suffix) != 6 {
		return false
	}
	for _, character := range suffix {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func CleanupDerivedOffline(ctx context.Context, db *sql.DB) (OfflineCleanupResult, error) {
	var result OfflineCleanupResult
	if err := ensureDerivedCleanupJobSchema(db); err != nil {
		return result, err
	}
	for {
		processed, handled, err := cleanupMonitoringFTSJobBatch(ctx, db, derivedCleanupBatchLimit)
		if err != nil {
			return result, err
		}
		result.ProcessedRows += processed
		if !handled {
			break
		}
	}
	rows, err := db.QueryContext(ctx, `select id, projection_table, fts_table
		from usage_derived_cleanup_jobs
		where kind = 'monitoring_fts' and status = 'offline_required'
		order by generation`)
	if err != nil {
		return result, err
	}
	jobs := make([]monitoringOfflineCleanupJob, 0)
	for rows.Next() {
		var job monitoringOfflineCleanupJob
		if err := rows.Scan(&job.id, &job.projectionTable, &job.ftsTable); err != nil {
			_ = rows.Close()
			return result, err
		}
		jobs = append(jobs, job)
	}
	if err := rows.Close(); err != nil {
		return result, err
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	for _, job := range jobs {
		if !validMonitoringCleanupTable(job.ftsTable, usageMonitoringSearchLegacyPrefix, usageMonitoringSearchLegacy) ||
			(job.projectionTable.Valid && !validMonitoringCleanupTable(job.projectionTable.String, usageMonitoringProjectionLegacyPrefix, usageMonitoringProjectionLegacy)) {
			return result, fmt.Errorf("monitoring FTS cleanup job %d contains invalid table names", job.id)
		}
		if err := finalizeMonitoringCleanupJob(ctx, db, job); err != nil {
			return result, err
		}
		result.CompletedJobs++
	}
	return result, nil
}

type monitoringOfflineCleanupJob struct {
	id              int64
	projectionTable sql.NullString
	ftsTable        string
}

func finalizeMonitoringCleanupJob(ctx context.Context, db *sql.DB, job monitoringOfflineCleanupJob) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(context.Background(), `rollback`)
		}
		_ = conn.Close()
	}()
	if _, err := conn.ExecContext(ctx, `begin exclusive`); err != nil {
		return fmt.Errorf("acquire exclusive SQLite cleanup lock: %w", err)
	}
	ftsExists, err := derivedTableExists(ctx, conn, job.ftsTable)
	if err != nil {
		return err
	}
	if ftsExists {
		if _, err := conn.ExecContext(ctx, `drop table `+job.ftsTable); err != nil {
			return fmt.Errorf("drop offline monitoring FTS %s: %w", job.ftsTable, err)
		}
	}
	if job.projectionTable.Valid {
		projectionExists, err := derivedTableExists(ctx, conn, job.projectionTable.String)
		if err != nil {
			return err
		}
		if projectionExists {
			if _, err := conn.ExecContext(ctx, `drop table `+job.projectionTable.String); err != nil {
				return fmt.Errorf("drop offline monitoring projection %s: %w", job.projectionTable.String, err)
			}
		}
	}
	nowMS := time.Now().UnixMilli()
	if _, err := conn.ExecContext(ctx, `update usage_derived_cleanup_jobs set
		status = 'completed', updated_at_ms = ?, finished_at_ms = ?, last_error = null
		where id = ?`, nowMS, nowMS, job.id); err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx, `commit`); err != nil {
		return err
	}
	committed = true
	return nil
}

type derivedCleanupTarget struct {
	tableName string
	condition string
	args      []any
}

func staleDerivedCleanupTargets() []derivedCleanupTarget {
	targets := []derivedCleanupTarget{{
		tableName: usageMonitoringSelectorDailyTable,
		condition: "target.model_format_revision <> ?",
		args:      []any{usageidentity.ModelFormatVersion},
	}}
	for _, state := range []struct {
		tableNames []string
		stateTable string
		stateName  string
	}{
		{[]string{"usage_pricing_hourly_rollups_v1", usagePricingAccountRollupsTable}, "usage_pricing_rollup_state", "pricing_v1"},
		{[]string{usageMonitoringAccountDailyTable, usageMonitoringAPIKeyDailyTable}, usageMonitoringRollupStateTable, usageMonitoringStatsRollupName},
	} {
		for _, tableName := range state.tableNames {
			targets = append(targets, derivedCleanupTarget{
				tableName: tableName,
				condition: `exists (
					select 1 from ` + state.stateTable + ` as state
					where state.rollup_name = ?
						and trim(state.structure_revision) <> ''
						and target.structure_revision <> state.structure_revision
				)`,
				args: []any{state.stateName},
			})
		}
	}
	return targets
}

func deleteDerivedRows(ctx context.Context, db *sql.DB, tableName, condition string, args []any, limit int) (int64, error) {
	whereClause := ""
	if condition != "" {
		whereClause = " where " + condition
	}
	query := `delete from ` + tableName + ` where rowid in (
		select target.rowid from ` + tableName + ` as target` + whereClause + ` limit ?
	)`
	queryArgs := append(append([]any{}, args...), limit)
	result, err := db.ExecContext(ctx, query, queryArgs...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func waitDerivedMaintenance(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
