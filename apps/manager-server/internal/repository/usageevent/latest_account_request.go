package usageevent

import (
	"context"
	"database/sql"
	"sort"
	"strings"
)

// LatestAccountRequestQuery identifies one credential using the immutable
// snapshot captured with a request. AuthFileSnapshot is the primary identity;
// Source is used only for records created before auth-file snapshots existed.
type LatestAccountRequestQuery struct {
	RequestIndex     int
	AuthFileSnapshot string
	AuthIndex        string
}

// LatestAccountRequest contains the safe diagnostics needed by the credential
// list. Sensitive database-only fields such as fail_body and raw_json are
// deliberately not represented here.
type LatestAccountRequest struct {
	RequestIndex    int
	TimestampMS     int64
	Failed          bool
	FailStatusCode  sql.NullInt64
	FailSummary     string
	HeaderErrorKind string
	HeaderErrorCode string
	HeaderTraceID   string
}

type rankedAccountRequest struct {
	LatestAccountRequest
	id int64
}

func (r *repository) RecentAccountRequests(
	ctx context.Context,
	targets []LatestAccountRequestQuery,
	limit int,
) ([]LatestAccountRequest, error) {
	if len(targets) == 0 || limit <= 0 {
		return []LatestAccountRequest{}, nil
	}

	requests := make([]LatestAccountRequest, 0, len(targets)*limit)
	for _, target := range targets {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		authFileSnapshot := strings.TrimSpace(target.AuthFileSnapshot)
		if authFileSnapshot == "" {
			continue
		}
		authIndex := strings.TrimSpace(target.AuthIndex)
		snapshot, err := r.recentAccountRequestsByPredicate(
			ctx,
			target.RequestIndex,
			limit,
			`e.auth_file_snapshot collate nocase = ?
				and coalesce(e.auth_index, '') collate nocase = ?`,
			authFileSnapshot,
			authIndex,
		)
		if err != nil {
			return nil, err
		}
		legacy, err := r.recentAccountRequestsByPredicate(
			ctx,
			target.RequestIndex,
			limit,
			`coalesce(e.auth_file_snapshot, '') = ''
				and e.source collate nocase = ?
				and coalesce(e.auth_index, '') collate nocase = ?`,
			authFileSnapshot,
			authIndex,
		)
		if err != nil {
			return nil, err
		}
		requests = append(requests, mergeRecentAccountRequests(limit, snapshot, legacy)...)
	}
	return requests, nil
}

func (r *repository) recentAccountRequestsByPredicate(
	ctx context.Context,
	requestIndex int,
	limit int,
	predicate string,
	args ...any,
) ([]rankedAccountRequest, error) {
	queryArgs := append([]any{}, args...)
	queryArgs = append(queryArgs, limit)
	rows, err := r.db.QueryContext(ctx, `select
	e.id,
	e.timestamp_ms,
	e.failed,
	e.fail_status_code,
	coalesce(e.fail_summary, ''),
	coalesce(e.header_error_kind, ''),
	coalesce(e.header_error_code, ''),
	coalesce(e.header_trace_id, '')
from usage_events e
where `+predicate+`
order by e.timestamp_ms desc, e.id desc
limit ?`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := make([]rankedAccountRequest, 0, limit)
	for rows.Next() {
		var request rankedAccountRequest
		var failed int
		if err := rows.Scan(
			&request.id,
			&request.TimestampMS,
			&failed,
			&request.FailStatusCode,
			&request.FailSummary,
			&request.HeaderErrorKind,
			&request.HeaderErrorCode,
			&request.HeaderTraceID,
		); err != nil {
			return nil, err
		}
		request.RequestIndex = requestIndex
		request.Failed = failed != 0
		requests = append(requests, request)
	}
	return requests, rows.Err()
}

func mergeRecentAccountRequests(limit int, parts ...[]rankedAccountRequest) []LatestAccountRequest {
	total := 0
	for _, part := range parts {
		total += len(part)
	}
	if total == 0 {
		return nil
	}
	merged := make([]rankedAccountRequest, 0, total)
	for _, part := range parts {
		merged = append(merged, part...)
	}
	sort.SliceStable(merged, func(i, j int) bool {
		if merged[i].TimestampMS != merged[j].TimestampMS {
			return merged[i].TimestampMS > merged[j].TimestampMS
		}
		return merged[i].id > merged[j].id
	})
	if len(merged) > limit {
		merged = merged[:limit]
	}
	requests := make([]LatestAccountRequest, len(merged))
	for i, request := range merged {
		requests[i] = request.LatestAccountRequest
	}
	return requests
}
