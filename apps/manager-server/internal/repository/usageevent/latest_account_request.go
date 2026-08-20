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

const recentAccountRequestCandidateColumns = `id,
	timestamp_ms,
	failed,
	fail_status_code,
	coalesce(fail_summary, '') as fail_summary,
	coalesce(header_error_kind, '') as header_error_kind,
	coalesce(header_error_code, '') as header_error_code,
	coalesce(header_trace_id, '') as header_trace_id`

type recentAccountRequestCandidate struct {
	id      int64
	request LatestAccountRequest
}

func recentAccountRequestQuery(legacySource, emptyAuthIndex, afterCutoff bool) string {
	identityColumn := "auth_file_snapshot"
	if legacySource {
		identityColumn = "source"
	}
	authIndexConditions := []string{"auth_index collate nocase = ?"}
	if emptyAuthIndex {
		authIndexConditions = []string{"auth_index is null", "auth_index collate nocase = ''"}
	}

	branches := make([]string, 0, len(authIndexConditions))
	for _, authIndexCondition := range authIndexConditions {
		conditions := []string{
			identityColumn + " collate nocase = ?",
			authIndexCondition,
		}
		if legacySource {
			conditions = append(conditions, "coalesce(auth_file_snapshot, '') = ''")
		}
		if afterCutoff {
			conditions = append(conditions, "(timestamp_ms, id) > (?, ?)")
		}
		branches = append(branches, `select `+recentAccountRequestCandidateColumns+`
			from usage_events
			where `+strings.Join(conditions, " and ")+`
			order by timestamp_ms desc, id desc
			limit ?`)
	}
	if len(branches) == 1 {
		return branches[0]
	}
	wrapped := make([]string, 0, len(branches))
	for _, branch := range branches {
		wrapped = append(wrapped, "select * from ("+branch+")")
	}
	return "select * from (" + strings.Join(wrapped, " union all ") + `)
		order by timestamp_ms desc, id desc
		limit ?`
}

func recentAccountRequestArgs(
	identity, authIndex string,
	emptyAuthIndex bool,
	cutoff *recentAccountRequestCandidate,
	limit int,
) []any {
	branchCount := 1
	if emptyAuthIndex {
		branchCount = 2
	}
	args := make([]any, 0, branchCount*5+1)
	for range branchCount {
		args = append(args, identity)
		if !emptyAuthIndex {
			args = append(args, authIndex)
		}
		if cutoff != nil {
			args = append(args, cutoff.request.TimestampMS, cutoff.id)
		}
		args = append(args, limit)
	}
	if emptyAuthIndex {
		args = append(args, limit)
	}
	return args
}

func (r *repository) RecentAccountRequests(
	ctx context.Context,
	targets []LatestAccountRequestQuery,
	limit int,
) ([]LatestAccountRequest, error) {
	if len(targets) == 0 || limit <= 0 {
		return []LatestAccountRequest{}, nil
	}

	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	type preparedQueries struct {
		snapshot *sql.Stmt
		legacy   *sql.Stmt
		after    *sql.Stmt
	}
	prepareQueries := func(emptyAuthIndex bool) (preparedQueries, error) {
		queries := preparedQueries{}
		var prepareErr error
		queries.snapshot, prepareErr = tx.PrepareContext(ctx, recentAccountRequestQuery(false, emptyAuthIndex, false))
		if prepareErr != nil {
			return preparedQueries{}, prepareErr
		}
		queries.legacy, prepareErr = tx.PrepareContext(ctx, recentAccountRequestQuery(true, emptyAuthIndex, false))
		if prepareErr != nil {
			_ = queries.snapshot.Close()
			return preparedQueries{}, prepareErr
		}
		queries.after, prepareErr = tx.PrepareContext(ctx, recentAccountRequestQuery(true, emptyAuthIndex, true))
		if prepareErr != nil {
			_ = queries.snapshot.Close()
			_ = queries.legacy.Close()
			return preparedQueries{}, prepareErr
		}
		return queries, nil
	}
	withAuthIndex, err := prepareQueries(false)
	if err != nil {
		return nil, err
	}
	defer withAuthIndex.snapshot.Close()
	defer withAuthIndex.legacy.Close()
	defer withAuthIndex.after.Close()
	withoutAuthIndex, err := prepareQueries(true)
	if err != nil {
		return nil, err
	}
	defer withoutAuthIndex.snapshot.Close()
	defer withoutAuthIndex.legacy.Close()
	defer withoutAuthIndex.after.Close()

	requests := make([]LatestAccountRequest, 0, len(targets)*limit)
	validTargets := 0
	for _, target := range targets {
		authFileSnapshot := strings.TrimSpace(target.AuthFileSnapshot)
		if authFileSnapshot == "" {
			continue
		}
		validTargets++
		authIndex := strings.TrimSpace(target.AuthIndex)
		emptyAuthIndex := authIndex == ""
		queries := withAuthIndex
		if emptyAuthIndex {
			queries = withoutAuthIndex
		}

		snapshotCandidates, queryErr := queryRecentAccountRequestCandidates(
			ctx,
			queries.snapshot,
			recentAccountRequestArgs(authFileSnapshot, authIndex, emptyAuthIndex, nil, limit),
		)
		if queryErr != nil {
			return nil, queryErr
		}
		var cutoff *recentAccountRequestCandidate
		legacyQuery := queries.legacy
		if len(snapshotCandidates) >= limit {
			cutoff = &snapshotCandidates[limit-1]
			legacyQuery = queries.after
		}
		legacyCandidates, queryErr := queryRecentAccountRequestCandidates(
			ctx,
			legacyQuery,
			recentAccountRequestArgs(authFileSnapshot, authIndex, emptyAuthIndex, cutoff, limit),
		)
		if queryErr != nil {
			return nil, queryErr
		}
		candidates := append(snapshotCandidates, legacyCandidates...)
		sort.Slice(candidates, func(i, j int) bool {
			if candidates[i].request.TimestampMS != candidates[j].request.TimestampMS {
				return candidates[i].request.TimestampMS > candidates[j].request.TimestampMS
			}
			return candidates[i].id > candidates[j].id
		})
		if len(candidates) > limit {
			candidates = candidates[:limit]
		}
		for _, candidate := range candidates {
			candidate.request.RequestIndex = target.RequestIndex
			requests = append(requests, candidate.request)
		}
	}
	if validTargets == 0 {
		return []LatestAccountRequest{}, nil
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	sort.SliceStable(requests, func(i, j int) bool {
		return requests[i].RequestIndex < requests[j].RequestIndex
	})
	return requests, nil
}

func queryRecentAccountRequestCandidates(
	ctx context.Context,
	statement *sql.Stmt,
	args []any,
) ([]recentAccountRequestCandidate, error) {
	rows, err := statement.QueryContext(ctx, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	candidates := make([]recentAccountRequestCandidate, 0)
	for rows.Next() {
		var candidate recentAccountRequestCandidate
		var failed int
		if err := rows.Scan(
			&candidate.id,
			&candidate.request.TimestampMS,
			&failed,
			&candidate.request.FailStatusCode,
			&candidate.request.FailSummary,
			&candidate.request.HeaderErrorKind,
			&candidate.request.HeaderErrorCode,
			&candidate.request.HeaderTraceID,
		); err != nil {
			return nil, err
		}
		candidate.request.Failed = failed != 0
		candidates = append(candidates, candidate)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return candidates, nil
}
