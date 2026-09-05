package usageevent

import (
	"context"
	"database/sql"
	"sort"
	"strings"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usageidentity"
)

// SQLQueryer is the read-only subset shared by *sql.DB and *sql.Tx. Keeping
// the identity check on this narrow interface lets account-history and
// account-window readers evaluate the same evidence inside their own snapshot
// transaction.
type SQLQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

type legacyAccountIdentityPredicate struct {
	sql  string
	args []any
}

// ResolveCodexLegacyAccountKey returns the file/index account key only when
// every matching usage event remains attributable to the requested Codex
// account. A false result is intentionally non-error: callers must fail
// closed and continue with the stable key only.
func ResolveCodexLegacyAccountKey(
	ctx context.Context,
	queryer SQLQueryer,
	fields usageidentity.Fields,
) (string, bool, error) {
	legacyKey, targetAccountID, targetMember, authFile, authIndex, valid := codexLegacyTarget(fields)
	if !valid {
		return "", false, nil
	}

	events := make([]legacyAccountIdentityEvent, 0)
	for _, predicate := range legacyAccountIdentityPredicates(authFile, authIndex) {
		rows, err := queryer.QueryContext(ctx, `select
			e.id,
			coalesce(e.provider, ''),
			coalesce(e.auth_provider_snapshot, ''),
			coalesce(e.auth_account_id_snapshot, ''),
			coalesce(e.auth_project_id_snapshot, ''),
			coalesce(e.account_snapshot, '')
		from usage_events e
		where `+predicate.sql, predicate.args...)
		if err != nil {
			return "", false, err
		}
		predicateEvents, err := scanLegacyAccountIdentityRows(rows)
		if err != nil {
			return "", false, err
		}
		events = append(events, predicateEvents...)
	}
	sort.Slice(events, func(i, j int) bool { return events[i].id < events[j].id })
	if !legacyAccountIdentityAllowed(events, targetAccountID, targetMember) {
		return "", false, nil
	}
	return legacyKey, true, nil
}

// ResolveCodexLegacyAccountKey evaluates the same check through a short
// read-only transaction for service-layer account-history requests.
func (r *repository) ResolveCodexLegacyAccountKey(
	ctx context.Context,
	fields usageidentity.Fields,
) (string, bool, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return "", false, err
	}
	defer func() { _ = tx.Rollback() }()
	key, allowed, err := ResolveCodexLegacyAccountKey(ctx, tx, fields)
	if err != nil {
		return "", false, err
	}
	if err := tx.Commit(); err != nil {
		return "", false, err
	}
	return key, allowed, nil
}

func codexLegacyTarget(fields usageidentity.Fields) (string, string, string, string, string, bool) {
	provider := normalizeIdentityProvider(fields.AuthProviderSnapshot)
	targetAccountID, workspaceOK := usageidentity.ResolveCodexWorkspace(fields)
	targetMember, memberOK := usageidentity.NormalizeCodexMemberSnapshot(fields.AccountSnapshot)
	// A legacy alias is allowed only for a target with explicit direct
	// Workspace evidence. A marker in the historical project column can
	// validate that evidence, but cannot by itself authorize a new alias.
	if provider != "codex" || strings.TrimSpace(fields.AuthAccountIDSnapshot) == "" || !workspaceOK || !memberOK {
		return "", "", "", "", "", false
	}

	authFile := strings.TrimSpace(fields.AuthFileSnapshot)
	if authFile == "" {
		source := strings.TrimSpace(fields.Source)
		account := strings.TrimSpace(fields.AccountSnapshot)
		label := strings.TrimSpace(fields.AuthLabelSnapshot)
		if source != "" && !strings.EqualFold(source, account) && !strings.EqualFold(source, label) {
			authFile = source
		}
	}
	authIndex := strings.TrimSpace(fields.AuthIndex)
	if authFile == "" || authIndex == "" {
		return "", "", "", "", "", false
	}
	legacyKey, valid := usageidentity.LegacyAccountKey(fields)
	if !valid {
		return "", "", "", "", "", false
	}
	return legacyKey, targetAccountID, targetMember, authFile, authIndex, true
}

func legacyAccountIdentityPredicates(authFile, authIndex string) []legacyAccountIdentityPredicate {
	predicates := make([]legacyAccountIdentityPredicate, 0, 3)
	appendIndexPredicate := func(base string, baseArgs []any) {
		args := append(append([]any{}, baseArgs...), authIndex)
		predicates = append(predicates, legacyAccountIdentityPredicate{
			sql:  base + ` and e.auth_index collate nocase = ?`,
			args: args,
		})
	}

	appendIndexPredicate(`e.auth_file_snapshot collate nocase = ?`, []any{authFile})
	legacySourceBase := `e.auth_file_snapshot is null and e.source collate nocase = ?` + legacySourceIdentityGuards()
	appendIndexPredicate(legacySourceBase, []any{authFile})
	legacyEmptySourceBase := `e.auth_file_snapshot = '' and e.source collate nocase = ?` + legacySourceIdentityGuards()
	appendIndexPredicate(legacyEmptySourceBase, []any{authFile})
	return predicates
}

func legacySourceIdentityGuards() string {
	// source is used as a physical file only when it is not merely the display
	// account or label. Keep the indexed source/auth_index predicates intact and
	// apply these guards as residual filters.
	return `
		and (e.account_snapshot is null or lower(trim(e.source)) <> lower(trim(e.account_snapshot)))
		and (e.auth_label_snapshot is null or lower(trim(e.source)) <> lower(trim(e.auth_label_snapshot)))`
}

type legacyAccountIdentityEvent struct {
	id              int64
	provider        string
	authProvider    string
	accountID       string
	projectID       string
	accountSnapshot string
}

func scanLegacyAccountIdentityRows(rows *sql.Rows) ([]legacyAccountIdentityEvent, error) {
	defer rows.Close()
	events := make([]legacyAccountIdentityEvent, 0)
	for rows.Next() {
		var event legacyAccountIdentityEvent
		if err := rows.Scan(
			&event.id,
			&event.provider,
			&event.authProvider,
			&event.accountID,
			&event.projectID,
			&event.accountSnapshot,
		); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

func legacyAccountIdentityAllowed(
	events []legacyAccountIdentityEvent,
	targetAccountID, targetMember string,
) bool {
	strongWorkspaceFound := false
	for _, event := range events {
		hasProvider := false
		for _, value := range []string{event.provider, event.authProvider} {
			normalized := normalizeIdentityProvider(value)
			if normalized == "" {
				continue
			}
			hasProvider = true
			if normalized != "codex" {
				return false
			}
		}
		if !hasProvider {
			return false
		}

		member, memberOK := usageidentity.NormalizeCodexMemberSnapshot(event.accountSnapshot)
		if !memberOK || member != targetMember {
			return false
		}

		directWorkspacePresent := strings.Trim(event.accountID, " ") != ""
		markedWorkspacePresent := usageidentity.HasCodexAccountIDSnapshotMarker(event.projectID)
		workspace, workspaceOK := usageidentity.ResolveCodexWorkspace(usageidentity.Fields{
			AuthAccountIDSnapshot: event.accountID,
			AuthProjectIDSnapshot: event.projectID,
			AccountSnapshot:       event.accountSnapshot,
		})
		if directWorkspacePresent || markedWorkspacePresent {
			if !workspaceOK || workspace != targetAccountID {
				return false
			}
			if directWorkspacePresent {
				strongWorkspaceFound = true
			}
			continue
		}

		// A fully legacy event with no Workspace provenance is eligible only
		// as a leading prefix. Once direct Workspace evidence has established
		// the member identity, a later regression to weak evidence is
		// ambiguous credential reuse and must fail closed.
		if strongWorkspaceFound {
			return false
		}
	}
	return strongWorkspaceFound
}

func normalizeIdentityProvider(value string) string {
	normalized := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), "_", "-"))
	switch normalized {
	case "x-ai", "grok":
		return "xai"
	default:
		return normalized
	}
}
