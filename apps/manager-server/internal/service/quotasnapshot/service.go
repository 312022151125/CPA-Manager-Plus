package quotasnapshot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usageidentity"
)

const (
	maxWriteEntries      = 400
	maxQueryAccounts     = 200
	maxModelIDs          = 200
	maxSnapshotsPerQuery = 2000
)

var (
	validProviders = stringSet("codex", "claude", "antigravity", "kimi", "xai")
	validModes     = stringSet("fixed", "calendar", "rolling", "non_window", "unknown")
	validScopes    = stringSet("all", "family", "models", "product", "feature")
	validSources   = stringSet("api_query", "response_header", "response_body", "inspection")
	validAccuracy  = stringSet("exact", "derived", "estimated", "unknown")
)

type Service struct {
	store *store.Store
	now   func() time.Time
}

func New(st *store.Store) *Service {
	return &Service{store: st, now: time.Now}
}

type AccountTarget struct {
	AccountSnapshot       string `json:"account_snapshot,omitempty"`
	AuthLabelSnapshot     string `json:"auth_label_snapshot,omitempty"`
	AuthFileSnapshot      string `json:"auth_file_snapshot,omitempty"`
	AuthProviderSnapshot  string `json:"auth_provider_snapshot,omitempty"`
	AuthProjectIDSnapshot string `json:"auth_project_id_snapshot,omitempty"`
	AuthIndex             string `json:"auth_index,omitempty"`
	Source                string `json:"source,omitempty"`
}

type ResetCredit struct {
	ID          string `json:"id"`
	ExpiresAtMS int64  `json:"expires_at_ms"`
}

type WindowInput struct {
	ProviderWindowID      string        `json:"provider_window_id"`
	WindowKind            string        `json:"window_kind"`
	WindowMode            string        `json:"window_mode"`
	ModelScopeKind        string        `json:"model_scope_kind"`
	ModelScopeKey         string        `json:"model_scope_key,omitempty"`
	ModelIDs              []string      `json:"model_ids,omitempty"`
	Source                string        `json:"source"`
	SourceObservationID   string        `json:"source_observation_id,omitempty"`
	ObservedAtMS          int64         `json:"observed_at_ms"`
	BoundaryAccuracy      string        `json:"boundary_accuracy"`
	CycleStartMS          *int64        `json:"cycle_start_ms,omitempty"`
	CycleEndMS            *int64        `json:"cycle_end_ms,omitempty"`
	DurationSeconds       *int64        `json:"duration_seconds,omitempty"`
	UsedPercent           *float64      `json:"used_percent,omitempty"`
	RemainingPercent      *float64      `json:"remaining_percent,omitempty"`
	UsedValue             *float64      `json:"used_value,omitempty"`
	LimitValue            *float64      `json:"limit_value,omitempty"`
	QuotaUnit             string        `json:"quota_unit,omitempty"`
	ResetCreditsAvailable *int64        `json:"reset_credits_available,omitempty"`
	ResetCredits          []ResetCredit `json:"reset_credits,omitempty"`
	PlanType              string        `json:"plan_type,omitempty"`
}

type WriteEntry struct {
	RowKey   string        `json:"row_key,omitempty"`
	Provider string        `json:"provider"`
	Account  AccountTarget `json:"account"`
	Windows  []WindowInput `json:"windows"`
}

type WriteRequest struct {
	Entries []WriteEntry `json:"entries"`
}

type WriteItem struct {
	RowKey        string `json:"row_key,omitempty"`
	AccountKey    string `json:"account_key"`
	Provider      string `json:"provider"`
	InsertedCount int    `json:"inserted_count"`
}

type WriteResponse struct {
	ObservedAtMS int64       `json:"observed_at_ms"`
	Items        []WriteItem `json:"items"`
}

type QueryAccount struct {
	RowKey   string        `json:"row_key"`
	Provider string        `json:"provider"`
	Account  AccountTarget `json:"account"`
}

type QueryRequest struct {
	Accounts []QueryAccount `json:"accounts"`
	NowMS    int64          `json:"now_ms,omitempty"`
}

type FieldSource struct {
	Source       string `json:"source"`
	ObservedAtMS int64  `json:"observed_at_ms"`
}

type Window struct {
	ProviderWindowID      string                 `json:"provider_window_id"`
	WindowKind            string                 `json:"window_kind"`
	WindowMode            string                 `json:"window_mode"`
	ModelScopeKind        string                 `json:"model_scope_kind"`
	ModelScopeKey         string                 `json:"model_scope_key,omitempty"`
	ModelIDs              []string               `json:"model_ids,omitempty"`
	Source                string                 `json:"source"`
	SourceObservationID   string                 `json:"source_observation_id,omitempty"`
	ObservedAtMS          int64                  `json:"observed_at_ms"`
	BoundaryAccuracy      string                 `json:"boundary_accuracy"`
	CycleStartMS          *int64                 `json:"cycle_start_ms,omitempty"`
	CycleEndMS            *int64                 `json:"cycle_end_ms,omitempty"`
	DurationSeconds       *int64                 `json:"duration_seconds,omitempty"`
	UsedPercent           *float64               `json:"used_percent,omitempty"`
	RemainingPercent      *float64               `json:"remaining_percent,omitempty"`
	UsedValue             *float64               `json:"used_value,omitempty"`
	LimitValue            *float64               `json:"limit_value,omitempty"`
	QuotaUnit             string                 `json:"quota_unit,omitempty"`
	ResetCreditsAvailable *int64                 `json:"reset_credits_available,omitempty"`
	ResetCredits          []ResetCredit          `json:"reset_credits,omitempty"`
	PlanType              string                 `json:"plan_type,omitempty"`
	Stale                 bool                   `json:"stale"`
	FieldSources          map[string]FieldSource `json:"field_sources,omitempty"`
}

type QueryItem struct {
	RowKey     string   `json:"row_key"`
	AccountKey string   `json:"account_key"`
	Provider   string   `json:"provider"`
	Windows    []Window `json:"windows"`
}

type QueryResponse struct {
	GeneratedAtMS int64       `json:"generated_at_ms"`
	Items         []QueryItem `json:"items"`
}

func (s *Service) Write(ctx context.Context, req WriteRequest) (WriteResponse, error) {
	if len(req.Entries) == 0 {
		return WriteResponse{}, errors.New("entries are required")
	}
	if len(req.Entries) > maxWriteEntries {
		return WriteResponse{}, fmt.Errorf("entries must be less than or equal to %d", maxWriteEntries)
	}
	nowMS := s.now().UnixMilli()
	all := make([]model.AccountQuotaSnapshot, 0)
	items := make([]WriteItem, 0, len(req.Entries))
	for _, entry := range req.Entries {
		provider := normalizeProvider(entry.Provider)
		if !validProviders[provider] {
			return WriteResponse{}, fmt.Errorf("unsupported provider %q", entry.Provider)
		}
		accountKey, ok := usageidentity.AccountKey(entry.Account.identityFields(provider))
		if !ok {
			return WriteResponse{}, errors.New("account identity is required")
		}
		if len(entry.Windows) == 0 {
			return WriteResponse{}, errors.New("windows are required")
		}
		startCount := len(all)
		for _, input := range entry.Windows {
			snapshot, err := normalizeWindowInput(accountKey, provider, input, nowMS)
			if err != nil {
				return WriteResponse{}, err
			}
			all = append(all, snapshot)
		}
		items = append(items, WriteItem{
			RowKey: entry.RowKey, AccountKey: accountKey, Provider: provider,
			InsertedCount: len(all) - startCount,
		})
	}
	if len(all) > maxWriteEntries {
		return WriteResponse{}, fmt.Errorf("windows must be less than or equal to %d", maxWriteEntries)
	}
	if err := s.store.QuotaSnapshots.InsertMany(ctx, all); err != nil {
		return WriteResponse{}, err
	}
	return WriteResponse{ObservedAtMS: nowMS, Items: items}, nil
}

func (s *Service) Query(ctx context.Context, req QueryRequest) (QueryResponse, error) {
	if len(req.Accounts) == 0 {
		return QueryResponse{}, errors.New("accounts are required")
	}
	if len(req.Accounts) > maxQueryAccounts {
		return QueryResponse{}, fmt.Errorf("accounts must be less than or equal to %d", maxQueryAccounts)
	}
	nowMS := req.NowMS
	if nowMS <= 0 {
		nowMS = s.now().UnixMilli()
	}
	items := make([]QueryItem, 0, len(req.Accounts))
	for _, account := range req.Accounts {
		if strings.TrimSpace(account.RowKey) == "" {
			return QueryResponse{}, errors.New("row_key is required")
		}
		provider := normalizeProvider(account.Provider)
		if !validProviders[provider] {
			return QueryResponse{}, fmt.Errorf("unsupported provider %q", account.Provider)
		}
		accountKey, ok := usageidentity.AccountKey(account.Account.identityFields(provider))
		if !ok {
			return QueryResponse{}, errors.New("account identity is required")
		}
		candidates, err := s.store.QuotaSnapshots.ListCandidates(ctx, accountKey, provider, maxSnapshotsPerQuery)
		if err != nil {
			return QueryResponse{}, err
		}
		items = append(items, QueryItem{
			RowKey: account.RowKey, AccountKey: accountKey, Provider: provider,
			Windows: selectWindows(candidates, nowMS),
		})
	}
	return QueryResponse{GeneratedAtMS: nowMS, Items: items}, nil
}

func normalizeWindowInput(accountKey, provider string, input WindowInput, nowMS int64) (model.AccountQuotaSnapshot, error) {
	providerWindowID := strings.TrimSpace(input.ProviderWindowID)
	if providerWindowID == "" {
		return model.AccountQuotaSnapshot{}, errors.New("provider_window_id is required")
	}
	mode := strings.ToLower(strings.TrimSpace(input.WindowMode))
	if !validModes[mode] {
		return model.AccountQuotaSnapshot{}, fmt.Errorf("unsupported window_mode %q", input.WindowMode)
	}
	scopeKind := strings.ToLower(strings.TrimSpace(input.ModelScopeKind))
	if !validScopes[scopeKind] {
		return model.AccountQuotaSnapshot{}, fmt.Errorf("unsupported model_scope_kind %q", input.ModelScopeKind)
	}
	source := strings.ToLower(strings.TrimSpace(input.Source))
	if !validSources[source] {
		return model.AccountQuotaSnapshot{}, fmt.Errorf("unsupported source %q", input.Source)
	}
	accuracy := strings.ToLower(strings.TrimSpace(input.BoundaryAccuracy))
	if !validAccuracy[accuracy] {
		return model.AccountQuotaSnapshot{}, fmt.Errorf("unsupported boundary_accuracy %q", input.BoundaryAccuracy)
	}
	observedAtMS := input.ObservedAtMS
	if observedAtMS <= 0 {
		observedAtMS = nowMS
	}
	if observedAtMS > nowMS+5*60*1000 {
		return model.AccountQuotaSnapshot{}, errors.New("observed_at_ms is too far in the future")
	}
	cycleStart, cycleEnd, duration, err := normalizeBoundaries(mode, accuracy, input.CycleStartMS, input.CycleEndMS, input.DurationSeconds)
	if err != nil {
		return model.AccountQuotaSnapshot{}, err
	}
	for name, value := range map[string]*float64{
		"used_percent": input.UsedPercent, "remaining_percent": input.RemainingPercent,
	} {
		if value != nil && (math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || *value > 100) {
			return model.AccountQuotaSnapshot{}, fmt.Errorf("%s must be between 0 and 100", name)
		}
	}
	for name, value := range map[string]*float64{"used_value": input.UsedValue, "limit_value": input.LimitValue} {
		if value != nil && (math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0) {
			return model.AccountQuotaSnapshot{}, fmt.Errorf("%s must be greater than or equal to 0", name)
		}
	}
	modelIDs, err := normalizeStringList(input.ModelIDs, maxModelIDs)
	if err != nil {
		return model.AccountQuotaSnapshot{}, err
	}
	if scopeKind == "models" && len(modelIDs) == 0 {
		return model.AccountQuotaSnapshot{}, errors.New("model_ids are required for models scope")
	}
	modelIDsJSON := marshalAllowlist(modelIDs)
	resetCredits, err := normalizeResetCredits(input.ResetCredits)
	if err != nil {
		return model.AccountQuotaSnapshot{}, err
	}
	return model.AccountQuotaSnapshot{
		AccountKey: accountKey, Provider: provider, ProviderWindowID: providerWindowID,
		WindowKind: strings.TrimSpace(input.WindowKind), WindowMode: mode,
		ModelScopeKind: scopeKind, ModelScopeKey: strings.TrimSpace(input.ModelScopeKey),
		ModelIDsJSON: modelIDsJSON, Source: source,
		SourceObservationID: strings.TrimSpace(input.SourceObservationID), ObservedAtMS: observedAtMS,
		BoundaryAccuracy: accuracy, CycleStartMS: cycleStart, CycleEndMS: cycleEnd,
		DurationSeconds: duration, UsedPercent: input.UsedPercent,
		RemainingPercent: input.RemainingPercent, UsedValue: input.UsedValue,
		LimitValue: input.LimitValue, QuotaUnit: strings.TrimSpace(input.QuotaUnit),
		ResetCreditsAvailable: input.ResetCreditsAvailable,
		ResetCreditsJSON:      marshalAllowlist(resetCredits), PlanType: strings.TrimSpace(input.PlanType),
		CreatedAtMS: nowMS,
	}, nil
}

func normalizeBoundaries(mode, accuracy string, start, end, duration *int64) (*int64, *int64, *int64, error) {
	if duration != nil && *duration <= 0 {
		return nil, nil, nil, errors.New("duration_seconds must be greater than 0")
	}
	if start != nil && end != nil && *start >= *end {
		return nil, nil, nil, errors.New("cycle_start_ms must be less than cycle_end_ms")
	}
	if mode == "rolling" && duration == nil {
		return nil, nil, nil, errors.New("duration_seconds is required for rolling windows")
	}
	if (mode == "fixed" || mode == "calendar") && (accuracy == "exact" || accuracy == "derived") {
		if end == nil || (start == nil && duration == nil) {
			return nil, nil, nil, errors.New("reliable fixed/calendar windows require cycle_end_ms and cycle_start_ms or duration_seconds")
		}
	}
	if start == nil && end != nil && duration != nil {
		value := *end - *duration*1000
		start = &value
	}
	if duration == nil && start != nil && end != nil {
		value := (*end - *start) / 1000
		duration = &value
	}
	return start, end, duration, nil
}

func selectWindows(candidates []model.AccountQuotaSnapshot, nowMS int64) []Window {
	groups := make(map[string][]model.AccountQuotaSnapshot)
	for _, candidate := range candidates {
		key := strings.Join([]string{
			candidate.ProviderWindowID, candidate.ModelScopeKind, candidate.ModelScopeKey,
		}, "\x00")
		groups[key] = append(groups[key], candidate)
	}
	result := make([]Window, 0, len(groups))
	for _, group := range groups {
		sort.SliceStable(group, func(i, j int) bool {
			leftRank := candidateRank(group[i], nowMS)
			rightRank := candidateRank(group[j], nowMS)
			if leftRank != rightRank {
				return leftRank > rightRank
			}
			if group[i].ObservedAtMS != group[j].ObservedAtMS {
				return group[i].ObservedAtMS > group[j].ObservedAtMS
			}
			return group[i].ID > group[j].ID
		})
		selected := group[0]
		window := snapshotWindow(selected, isStale(selected, nowMS))
		window.FieldSources = map[string]FieldSource{
			"quota": {Source: selected.Source, ObservedAtMS: selected.ObservedAtMS},
		}
		if selected.Provider == "codex" {
			for _, candidate := range group {
				if window.ResetCreditsAvailable == nil && candidate.ResetCreditsAvailable != nil {
					window.ResetCreditsAvailable = candidate.ResetCreditsAvailable
					window.FieldSources["reset_credits_available"] = FieldSource{Source: candidate.Source, ObservedAtMS: candidate.ObservedAtMS}
				}
				if len(window.ResetCredits) == 0 && candidate.ResetCreditsJSON != "" {
					window.ResetCredits = unmarshalResetCredits(candidate.ResetCreditsJSON)
					window.FieldSources["reset_credits"] = FieldSource{Source: candidate.Source, ObservedAtMS: candidate.ObservedAtMS}
				}
				if window.PlanType == "" && candidate.PlanType != "" {
					window.PlanType = candidate.PlanType
					window.FieldSources["plan_type"] = FieldSource{Source: candidate.Source, ObservedAtMS: candidate.ObservedAtMS}
				}
			}
		}
		result = append(result, window)
	}
	sort.SliceStable(result, func(i, j int) bool {
		left, right := windowSortRank(result[i]), windowSortRank(result[j])
		if left != right {
			return left < right
		}
		return result[i].ProviderWindowID < result[j].ProviderWindowID
	})
	return result
}

func candidateRank(snapshot model.AccountQuotaSnapshot, nowMS int64) int {
	rank := 0
	if !isStale(snapshot, nowMS) {
		rank += 4
	}
	if boundaryComplete(snapshot) {
		rank += 2
	}
	if snapshot.BoundaryAccuracy == "exact" || snapshot.BoundaryAccuracy == "derived" {
		rank++
	}
	return rank
}

func boundaryComplete(snapshot model.AccountQuotaSnapshot) bool {
	switch snapshot.WindowMode {
	case "fixed", "calendar":
		return snapshot.CycleStartMS != nil && snapshot.CycleEndMS != nil && snapshot.DurationSeconds != nil
	case "rolling":
		return snapshot.DurationSeconds != nil
	default:
		return true
	}
}

func isStale(snapshot model.AccountQuotaSnapshot, nowMS int64) bool {
	if snapshot.CycleEndMS != nil && (snapshot.WindowMode == "fixed" || snapshot.WindowMode == "calendar") {
		return *snapshot.CycleEndMS <= nowMS
	}
	if snapshot.WindowMode == "rolling" && snapshot.DurationSeconds != nil {
		return snapshot.ObservedAtMS+*snapshot.DurationSeconds*1000 < nowMS
	}
	return false
}

func snapshotWindow(snapshot model.AccountQuotaSnapshot, stale bool) Window {
	return Window{
		ProviderWindowID: snapshot.ProviderWindowID, WindowKind: snapshot.WindowKind,
		WindowMode: snapshot.WindowMode, ModelScopeKind: snapshot.ModelScopeKind,
		ModelScopeKey: snapshot.ModelScopeKey, ModelIDs: unmarshalStringList(snapshot.ModelIDsJSON),
		Source: snapshot.Source, SourceObservationID: snapshot.SourceObservationID,
		ObservedAtMS: snapshot.ObservedAtMS, BoundaryAccuracy: snapshot.BoundaryAccuracy,
		CycleStartMS: snapshot.CycleStartMS, CycleEndMS: snapshot.CycleEndMS,
		DurationSeconds: snapshot.DurationSeconds, UsedPercent: snapshot.UsedPercent,
		RemainingPercent: snapshot.RemainingPercent, UsedValue: snapshot.UsedValue,
		LimitValue: snapshot.LimitValue, QuotaUnit: snapshot.QuotaUnit,
		ResetCreditsAvailable: snapshot.ResetCreditsAvailable,
		ResetCredits:          unmarshalResetCredits(snapshot.ResetCreditsJSON), PlanType: snapshot.PlanType,
		Stale: stale,
	}
}

func windowSortRank(window Window) int64 {
	if window.WindowMode == "non_window" || window.WindowMode == "unknown" {
		return math.MaxInt64
	}
	if window.DurationSeconds == nil {
		return math.MaxInt64 - 1
	}
	return *window.DurationSeconds
}

func (target AccountTarget) identityFields(provider string) usageidentity.Fields {
	providerSnapshot := strings.TrimSpace(target.AuthProviderSnapshot)
	if providerSnapshot == "" {
		providerSnapshot = provider
	}
	return usageidentity.Fields{
		AuthFileSnapshot:      strings.TrimSpace(target.AuthFileSnapshot),
		AuthIndex:             strings.TrimSpace(target.AuthIndex),
		AuthProviderSnapshot:  providerSnapshot,
		AuthProjectIDSnapshot: strings.TrimSpace(target.AuthProjectIDSnapshot),
		AccountSnapshot:       strings.TrimSpace(target.AccountSnapshot),
		AuthLabelSnapshot:     strings.TrimSpace(target.AuthLabelSnapshot),
		Source:                strings.TrimSpace(target.Source),
	}
}

func normalizeProvider(value string) string {
	normalized := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), "_", "-"))
	switch normalized {
	case "x-ai", "grok":
		return "xai"
	default:
		return normalized
	}
}

func normalizeStringList(values []string, limit int) ([]string, error) {
	if len(values) > limit {
		return nil, fmt.Errorf("list must be less than or equal to %d", limit)
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result, nil
}

func normalizeResetCredits(values []ResetCredit) ([]ResetCredit, error) {
	if len(values) > 100 {
		return nil, errors.New("reset_credits must be less than or equal to 100")
	}
	result := make([]ResetCredit, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value.ID = strings.TrimSpace(value.ID)
		if value.ID == "" || value.ExpiresAtMS <= 0 {
			return nil, errors.New("reset credit id and expires_at_ms are required")
		}
		if _, ok := seen[value.ID]; ok {
			continue
		}
		seen[value.ID] = struct{}{}
		result = append(result, value)
	}
	return result, nil
}

func marshalAllowlist(value any) string {
	data, err := json.Marshal(value)
	if err != nil || string(data) == "[]" || string(data) == "null" {
		return ""
	}
	return string(data)
}

func unmarshalStringList(raw string) []string {
	var result []string
	if json.Unmarshal([]byte(raw), &result) != nil {
		return nil
	}
	return result
}

func unmarshalResetCredits(raw string) []ResetCredit {
	var result []ResetCredit
	if json.Unmarshal([]byte(raw), &result) != nil {
		return nil
	}
	return result
}

func stringSet(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}
