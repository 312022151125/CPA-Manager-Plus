import type { CodexQuotaState } from '@/types';
import type {
  AccountQuotaSnapshotQueryAccount,
  AccountQuotaSnapshotTarget,
  AccountQuotaSnapshotWindow,
  AccountQuotaSnapshotWindowInput,
  AccountQuotaSnapshotWriteEntry,
} from '@/services/api/usageService';
import { buildAccountHistoryTargetEntries } from './accountHistoryRows';
import type { AccountRow } from './accountRows';
import type {
  AccountQuotaBoundaryAccuracy,
  AccountQuotaWindowDefinition,
} from './accountQuotaWindowDefinitions';
import type {
  AccountQuotaDisplayWindow,
  AccountQuotaWindowKind,
  AccountQuotaWindowSource,
} from './accountQuotaDisplayWindows';

const toSnapshotTarget = (
  row: AccountRow,
  target: ReturnType<typeof buildAccountHistoryTargetEntries>[number]['target']
): AccountQuotaSnapshotTarget => ({
  account_snapshot: target.account_snapshot,
  auth_label_snapshot: target.auth_label_snapshot,
  auth_file_snapshot: target.auth_file_snapshot,
  auth_provider_snapshot: target.auth_provider_snapshot ?? row.provider,
  auth_project_id_snapshot: target.auth_project_id_snapshot,
  auth_index: target.auth_index,
  source: target.source,
});

const toResetCredits = (quota: CodexQuotaState | undefined) =>
  (quota?.rateLimitResetCredits ?? [])
    .map((credit) => ({ id: credit.id.trim(), expires_at_ms: Date.parse(credit.expiresAt) }))
    .filter(
      (credit) => credit.id && Number.isFinite(credit.expires_at_ms) && credit.expires_at_ms > 0
    );

const snapshotFieldObservedAt = (snapshot: AccountQuotaSnapshotWindow, field: string) =>
  snapshot.field_sources?.[field]?.observed_at_ms ?? snapshot.observed_at_ms;

export const mergeCodexResetCreditsFromQuotaSnapshots = (
  quota: CodexQuotaState | undefined,
  snapshots: AccountQuotaSnapshotWindow[]
): CodexQuotaState | undefined => {
  const localObservedAt = quota?.fetchedAtMs ?? quota?.observedAtMs ?? 0;
  const countSnapshot = snapshots
    .filter(
      (snapshot) =>
        typeof snapshot.reset_credits_available === 'number' &&
        Number.isFinite(snapshot.reset_credits_available) &&
        snapshot.reset_credits_available >= 0
    )
    .sort(
      (left, right) =>
        snapshotFieldObservedAt(right, 'reset_credits_available') -
        snapshotFieldObservedAt(left, 'reset_credits_available')
    )[0];
  const creditsSnapshot = snapshots
    .filter((snapshot) => (snapshot.reset_credits?.length ?? 0) > 0)
    .sort(
      (left, right) =>
        snapshotFieldObservedAt(right, 'reset_credits') -
        snapshotFieldObservedAt(left, 'reset_credits')
    )[0];
  const countObservedAt = countSnapshot
    ? snapshotFieldObservedAt(countSnapshot, 'reset_credits_available')
    : 0;
  const creditsObservedAt = creditsSnapshot
    ? snapshotFieldObservedAt(creditsSnapshot, 'reset_credits')
    : 0;
  const useSnapshotCount =
    countSnapshot !== undefined &&
    (quota?.rateLimitResetCreditsAvailableCount === undefined ||
      countObservedAt >= localObservedAt);
  const useSnapshotCredits =
    creditsSnapshot !== undefined &&
    (quota?.rateLimitResetCredits === undefined || creditsObservedAt >= localObservedAt);
  if (!useSnapshotCount && !useSnapshotCredits) return quota;

  const base: CodexQuotaState = quota ?? { status: 'success', windows: [] };
  const next: CodexQuotaState = {
    ...base,
    rateLimitResetCreditsAvailableCount: useSnapshotCount
      ? (countSnapshot.reset_credits_available ?? null)
      : base.rateLimitResetCreditsAvailableCount,
    rateLimitResetCredits: useSnapshotCredits
      ? (creditsSnapshot.reset_credits ?? []).map((credit) => ({
          id: credit.id,
          status: 'available',
          grantedAt: '',
          expiresAt: new Date(credit.expires_at_ms).toISOString(),
        }))
      : base.rateLimitResetCredits,
  };
  if (useSnapshotCount && countSnapshot.reset_credits_available === 0 && !useSnapshotCredits) {
    next.rateLimitResetCredits = [];
  }
  return next;
};

const toSnapshotWindow = (
  definition: AccountQuotaWindowDefinition,
  nowMs: number,
  codexQuota?: CodexQuotaState
): AccountQuotaSnapshotWindowInput => {
  const scopeComplete = definition.modelScope.complete !== false;
  const hasModels =
    definition.modelScope.kind !== 'models' || (definition.modelScope.models?.length ?? 0) > 0;
  const boundaryAccuracy =
    scopeComplete && hasModels ? definition.boundaryAccuracy : ('unknown' as const);
  const windowMode = scopeComplete && hasModels ? definition.windowMode : ('unknown' as const);
  const resetCredits = definition.provider === 'codex' ? toResetCredits(codexQuota) : [];
  return {
    provider_window_id: definition.providerWindowId,
    window_kind: definition.kind,
    window_mode: windowMode,
    model_scope_kind:
      definition.modelScope.kind === 'models' && !hasModels
        ? 'feature'
        : definition.modelScope.kind,
    model_scope_key:
      definition.modelScope.kind === 'models' && !hasModels
        ? 'scope_unknown'
        : definition.modelScope.key,
    model_ids: hasModels ? definition.modelScope.models : undefined,
    source: definition.observationSource,
    observed_at_ms: definition.observedAtMs ?? nowMs,
    boundary_accuracy: boundaryAccuracy,
    cycle_start_ms: definition.cycleStartMs ?? undefined,
    cycle_end_ms: definition.cycleEndMs ?? undefined,
    duration_seconds: definition.durationSeconds ?? undefined,
    used_percent: definition.usedPercent ?? undefined,
    remaining_percent: definition.remainingPercent ?? undefined,
    reset_credits_available:
      definition.provider === 'codex'
        ? (codexQuota?.rateLimitResetCreditsAvailableCount ?? undefined)
        : undefined,
    reset_credits: resetCredits.length > 0 ? resetCredits : undefined,
    plan_type: definition.provider === 'codex' ? (codexQuota?.planType ?? undefined) : undefined,
  };
};

export const buildAccountQuotaSnapshotWriteEntries = (
  rows: AccountRow[],
  definitionsByRowKey: ReadonlyMap<string, AccountQuotaWindowDefinition[]>,
  options: {
    nowMs?: number;
    getCodexQuota?: (row: AccountRow) => CodexQuotaState | undefined;
  } = {}
): AccountQuotaSnapshotWriteEntry[] => {
  const targets = new Map(
    buildAccountHistoryTargetEntries(rows).map((entry) => [entry.rowKey, entry.target])
  );
  const nowMs = options.nowMs ?? Date.now();
  return rows.flatMap((row) => {
    const definitions = definitionsByRowKey.get(row.selectionKey) ?? [];
    const target = targets.get(row.selectionKey);
    if (
      !target ||
      definitions.length === 0 ||
      !definitions.some((item) => item.provider !== 'summary')
    ) {
      return [];
    }
    const windows = definitions
      .filter((definition) => definition.provider !== 'summary')
      .map((definition) => toSnapshotWindow(definition, nowMs, options.getCodexQuota?.(row)));
    if (windows.length === 0) return [];
    return [
      {
        row_key: row.selectionKey,
        provider: row.provider,
        account: toSnapshotTarget(row, target),
        windows,
      },
    ];
  });
};

export const buildAccountQuotaSnapshotQueryAccounts = (
  rows: AccountRow[]
): AccountQuotaSnapshotQueryAccount[] => {
  const targets = new Map(
    buildAccountHistoryTargetEntries(rows).map((entry) => [entry.rowKey, entry.target])
  );
  return rows.flatMap((row) => {
    const target = targets.get(row.selectionKey);
    if (!target || !['codex', 'claude', 'antigravity', 'kimi', 'xai'].includes(row.provider)) {
      return [];
    }
    return [
      {
        row_key: row.selectionKey,
        provider: row.provider,
        account: toSnapshotTarget(row, target),
      },
    ];
  });
};

const snapshotScopeKey = (window: {
  provider_window_id: string;
  model_scope_kind: string;
  model_scope_key?: string;
}) =>
  `${window.provider_window_id}\u0000${window.model_scope_kind}\u0000${window.model_scope_key ?? ''}`;

export const mergeAccountQuotaSnapshotWindows = (
  definitions: AccountQuotaWindowDefinition[],
  snapshots: AccountQuotaSnapshotWindow[],
  options: {
    provider?: string;
    getLabel?: (snapshot: AccountQuotaSnapshotWindow) => string;
  } = {}
): AccountQuotaWindowDefinition[] => {
  const snapshotsByKey = new Map(
    snapshots.map((snapshot) => [snapshotScopeKey(snapshot), snapshot])
  );
  const matchedSnapshotKeys = new Set<string>();
  const merged = definitions.map((definition) => {
    const key = snapshotScopeKey({
      provider_window_id: definition.providerWindowId,
      model_scope_kind: definition.modelScope.kind,
      model_scope_key: definition.modelScope.key,
    });
    const snapshot = snapshotsByKey.get(key);
    if (!snapshot) return definition;
    matchedSnapshotKeys.add(key);
    return {
      ...definition,
      windowMode: snapshot.window_mode,
      observationSource: snapshot.source,
      observedAtMs: snapshot.observed_at_ms,
      boundaryAccuracy: snapshot.boundary_accuracy,
      cycleStartMs: snapshot.cycle_start_ms ?? null,
      cycleEndMs: snapshot.cycle_end_ms ?? null,
      durationSeconds: snapshot.duration_seconds ?? null,
      remainingPercent: snapshot.remaining_percent ?? definition.remainingPercent,
      usedPercent: snapshot.used_percent ?? definition.usedPercent,
      modelScope: snapshotModelScope(snapshot),
      stale: snapshot.stale,
    };
  });
  const appended = snapshots
    .filter((snapshot) => !matchedSnapshotKeys.has(snapshotScopeKey(snapshot)))
    .map((snapshot) => snapshotDefinition(snapshot, options));
  return [...merged, ...appended].sort((left, right) => {
    const leftRank = definitionSortRank(left);
    const rightRank = definitionSortRank(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.providerWindowId.localeCompare(right.providerWindowId);
  });
};

const snapshotModelScope = (snapshot: AccountQuotaSnapshotWindow) => ({
  kind: snapshot.model_scope_kind,
  key: snapshot.model_scope_key,
  models: snapshot.model_ids,
  complete: snapshot.model_scope_kind !== 'models' || (snapshot.model_ids?.length ?? 0) > 0,
});

const snapshotWindowKind = (value: string): AccountQuotaWindowKind => {
  switch (value) {
    case 'five_hour':
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'billing':
    case 'payg':
    case 'product':
    case 'summary':
      return value;
    default:
      return 'unknown';
  }
};

const snapshotResetAccuracy = (
  accuracy: AccountQuotaBoundaryAccuracy
): AccountQuotaDisplayWindow['resetAccuracy'] => {
  if (accuracy === 'exact') return 'exact';
  if (accuracy === 'derived' || accuracy === 'estimated') return 'estimated';
  return 'unknown';
};

const definitionSortRank = (definition: AccountQuotaWindowDefinition): number => {
  if (definition.windowMode === 'non_window' || definition.windowMode === 'unknown') {
    return Number.MAX_SAFE_INTEGER;
  }
  return definition.durationSeconds ?? Number.MAX_SAFE_INTEGER - 1;
};

const snapshotDefinition = (
  snapshot: AccountQuotaSnapshotWindow,
  options: {
    provider?: string;
    getLabel?: (snapshot: AccountQuotaSnapshotWindow) => string;
  }
): AccountQuotaWindowDefinition => {
  const provider: AccountQuotaWindowSource =
    options.provider === 'codex' ||
    options.provider === 'claude' ||
    options.provider === 'antigravity' ||
    options.provider === 'kimi' ||
    options.provider === 'xai'
      ? options.provider
      : 'summary';
  const resetAtMs = snapshot.cycle_end_ms ?? null;
  const modelScope = snapshotModelScope(snapshot);
  const display: AccountQuotaDisplayWindow = {
    key: snapshot.provider_window_id,
    label: options.getLabel?.(snapshot) ?? snapshot.provider_window_id,
    kind: snapshotWindowKind(snapshot.window_kind),
    remainingPercent: snapshot.remaining_percent ?? null,
    usedPercent: snapshot.used_percent ?? null,
    resetLabel: '-',
    resetAtMs,
    resetAccuracy: snapshotResetAccuracy(snapshot.boundary_accuracy),
    limitWindowSeconds: snapshot.duration_seconds ?? null,
    fromMs: snapshot.cycle_start_ms ?? null,
    toMs: resetAtMs,
    amountLabel:
      snapshot.used_value !== undefined && snapshot.limit_value !== undefined
        ? `${snapshot.used_value} / ${snapshot.limit_value}${snapshot.quota_unit ? ` ${snapshot.quota_unit}` : ''}`
        : undefined,
    source: provider,
    observationSource: snapshot.source,
    observedAtMs: snapshot.observed_at_ms,
    windowMode: snapshot.window_mode,
    cycleStartMs: snapshot.cycle_start_ms ?? null,
    cycleEndMs: resetAtMs,
    modelScope,
  };
  return {
    key: snapshot.provider_window_id,
    providerWindowId: snapshot.provider_window_id,
    provider,
    label: display.label,
    kind: display.kind ?? 'unknown',
    windowMode: snapshot.window_mode,
    modelScope,
    observationSource: snapshot.source,
    observedAtMs: snapshot.observed_at_ms,
    boundaryAccuracy: snapshot.boundary_accuracy,
    cycleStartMs: snapshot.cycle_start_ms ?? null,
    cycleEndMs: resetAtMs,
    durationSeconds: snapshot.duration_seconds ?? null,
    remainingPercent: snapshot.remaining_percent ?? null,
    usedPercent: snapshot.used_percent ?? null,
    stale: snapshot.stale,
    display,
  };
};
