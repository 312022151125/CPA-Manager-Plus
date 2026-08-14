package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"log"
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

var derivedIndexStatements = []struct {
	name      string
	tableName string
	sql       string
}{
	{"idx_usage_events_latest_request_auth_file", "usage_events", `create index if not exists idx_usage_events_latest_request_auth_file on usage_events(auth_file_snapshot collate nocase, auth_index collate nocase, timestamp_ms desc, id desc)`},
	{"idx_usage_events_latest_request_source", "usage_events", `create index if not exists idx_usage_events_latest_request_source on usage_events(source collate nocase, auth_index collate nocase, timestamp_ms desc, id desc)`},
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
	if exists, err := derivedTableExists(ctx, db, usageMonitoringSearchLegacy); err != nil {
		return err
	} else if exists {
		log.Printf("[derived-migration] retained legacy FTS table %s for explicit offline cleanup", usageMonitoringSearchLegacy)
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

func derivedTableExists(ctx context.Context, db *sql.DB, tableName string) (bool, error) {
	var exists int
	err := db.QueryRowContext(ctx, `select count(*) from sqlite_master where type = 'table' and name = ?`, tableName).Scan(&exists)
	return exists != 0, err
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
