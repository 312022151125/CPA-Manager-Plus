package quotasnapshot

import (
	"context"
	"database/sql"
	"strings"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
)

const (
	defaultCandidateLimit  = 1000
	candidateRowsPerSource = 8
)

type Repository interface {
	InsertMany(ctx context.Context, snapshots []model.AccountQuotaSnapshot) error
	ListCandidates(ctx context.Context, accountKey, provider string, limit int) ([]model.AccountQuotaSnapshot, error)
}

type repository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &repository{db: db}
}

func (r *repository) InsertMany(ctx context.Context, snapshots []model.AccountQuotaSnapshot) error {
	if len(snapshots) == 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `insert into account_quota_snapshots (
		account_key, provider, provider_window_id, window_kind, window_mode,
		model_scope_kind, model_scope_key, model_ids_json, source,
		source_observation_id, observed_at_ms, boundary_accuracy,
		cycle_start_ms, cycle_end_ms, duration_seconds, used_percent,
		remaining_percent, used_value, limit_value, quota_unit,
		reset_credits_available, reset_credits_json, plan_type, created_at_ms
	) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, snapshot := range snapshots {
		if _, err := stmt.ExecContext(
			ctx,
			snapshot.AccountKey,
			snapshot.Provider,
			snapshot.ProviderWindowID,
			snapshot.WindowKind,
			snapshot.WindowMode,
			snapshot.ModelScopeKind,
			nullString(snapshot.ModelScopeKey),
			nullString(snapshot.ModelIDsJSON),
			snapshot.Source,
			nullString(snapshot.SourceObservationID),
			snapshot.ObservedAtMS,
			snapshot.BoundaryAccuracy,
			snapshot.CycleStartMS,
			snapshot.CycleEndMS,
			snapshot.DurationSeconds,
			snapshot.UsedPercent,
			snapshot.RemainingPercent,
			snapshot.UsedValue,
			snapshot.LimitValue,
			nullString(snapshot.QuotaUnit),
			snapshot.ResetCreditsAvailable,
			nullString(snapshot.ResetCreditsJSON),
			nullString(snapshot.PlanType),
			snapshot.CreatedAtMS,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *repository) ListCandidates(ctx context.Context, accountKey, provider string, limit int) ([]model.AccountQuotaSnapshot, error) {
	if limit <= 0 {
		limit = defaultCandidateLimit
	}
	rows, err := r.db.QueryContext(ctx, `with ranked as (
	select
		id, account_key, provider, provider_window_id, window_kind, window_mode,
		model_scope_kind, coalesce(model_scope_key, '') as model_scope_key,
		coalesce(model_ids_json, '') as model_ids_json,
		source, coalesce(source_observation_id, '') as source_observation_id, observed_at_ms,
		boundary_accuracy, cycle_start_ms, cycle_end_ms, duration_seconds,
		used_percent, remaining_percent, used_value, limit_value,
		coalesce(quota_unit, '') as quota_unit, reset_credits_available,
		coalesce(reset_credits_json, '') as reset_credits_json,
		coalesce(plan_type, '') as plan_type, created_at_ms,
		row_number() over (
			partition by provider_window_id, model_scope_kind, coalesce(model_scope_key, ''), source
			order by observed_at_ms desc, id desc
		) as source_rank
	from account_quota_snapshots
	where account_key = ? and provider = ?
	)
	select
		id, account_key, provider, provider_window_id, window_kind, window_mode,
		model_scope_kind, coalesce(model_scope_key, ''), coalesce(model_ids_json, ''),
		source, coalesce(source_observation_id, ''), observed_at_ms,
		boundary_accuracy, cycle_start_ms, cycle_end_ms, duration_seconds,
		used_percent, remaining_percent, used_value, limit_value,
		coalesce(quota_unit, ''), reset_credits_available,
		coalesce(reset_credits_json, ''), coalesce(plan_type, ''), created_at_ms
	from ranked
	where source_rank <= ?
	order by observed_at_ms desc, id desc
	limit ?`, strings.TrimSpace(accountKey), strings.TrimSpace(provider), candidateRowsPerSource, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.AccountQuotaSnapshot, 0)
	for rows.Next() {
		var item model.AccountQuotaSnapshot
		var cycleStart, cycleEnd, duration sql.NullInt64
		var usedPercent, remainingPercent, usedValue, limitValue sql.NullFloat64
		var resetCreditsAvailable sql.NullInt64
		if err := rows.Scan(
			&item.ID,
			&item.AccountKey,
			&item.Provider,
			&item.ProviderWindowID,
			&item.WindowKind,
			&item.WindowMode,
			&item.ModelScopeKind,
			&item.ModelScopeKey,
			&item.ModelIDsJSON,
			&item.Source,
			&item.SourceObservationID,
			&item.ObservedAtMS,
			&item.BoundaryAccuracy,
			&cycleStart,
			&cycleEnd,
			&duration,
			&usedPercent,
			&remainingPercent,
			&usedValue,
			&limitValue,
			&item.QuotaUnit,
			&resetCreditsAvailable,
			&item.ResetCreditsJSON,
			&item.PlanType,
			&item.CreatedAtMS,
		); err != nil {
			return nil, err
		}
		item.CycleStartMS = int64Pointer(cycleStart)
		item.CycleEndMS = int64Pointer(cycleEnd)
		item.DurationSeconds = int64Pointer(duration)
		item.UsedPercent = float64Pointer(usedPercent)
		item.RemainingPercent = float64Pointer(remainingPercent)
		item.UsedValue = float64Pointer(usedValue)
		item.LimitValue = float64Pointer(limitValue)
		item.ResetCreditsAvailable = int64Pointer(resetCreditsAvailable)
		items = append(items, item)
	}
	return items, rows.Err()
}

func nullString(value string) any {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func int64Pointer(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	result := value.Int64
	return &result
}

func float64Pointer(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	result := value.Float64
	return &result
}
