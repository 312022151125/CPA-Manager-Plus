import type { QuotaModelScope, QuotaObservationSource, QuotaWindowMode } from '@/types';
import type {
  AccountQuotaDisplayWindow,
  AccountQuotaWindowKind,
  AccountQuotaWindowSource,
} from './accountQuotaDisplayWindows';

export type AccountQuotaBoundaryAccuracy = 'exact' | 'derived' | 'estimated' | 'unknown';
export type AccountQuotaUsagePeriod = 'current' | 'previous' | 'previous_equal_range';

export interface AccountQuotaWindowDefinition {
  key: string;
  providerWindowId: string;
  provider: AccountQuotaWindowSource;
  label: string;
  kind: AccountQuotaWindowKind;
  windowMode: QuotaWindowMode;
  modelScope: QuotaModelScope;
  observationSource: QuotaObservationSource;
  observedAtMs: number | null;
  boundaryAccuracy: AccountQuotaBoundaryAccuracy;
  cycleStartMs: number | null;
  cycleEndMs: number | null;
  durationSeconds: number | null;
  remainingPercent: number | null;
  usedPercent: number | null;
  stale: boolean;
  display: AccountQuotaDisplayWindow;
}

export interface AccountQuotaUsageRange {
  period: AccountQuotaUsagePeriod;
  fromMs: number;
  toMs: number;
}

const isReliableBoundary = (accuracy: AccountQuotaBoundaryAccuracy) =>
  accuracy === 'exact' || accuracy === 'derived';

const resolveBoundaryAccuracy = (
  window: AccountQuotaDisplayWindow
): AccountQuotaBoundaryAccuracy => {
  if (window.resetAccuracy === 'exact') return 'exact';
  if (
    window.resetAccuracy === 'estimated' &&
    window.limitWindowSeconds !== null &&
    window.cycleStartMs !== null &&
    window.cycleEndMs !== null &&
    window.observedAtMs !== null
  ) {
    return 'derived';
  }
  return window.resetAccuracy;
};

const definitionSortRank = (definition: AccountQuotaWindowDefinition): number => {
  if (definition.windowMode === 'non_window' || definition.windowMode === 'unknown') {
    return Number.MAX_SAFE_INTEGER;
  }
  return definition.durationSeconds ?? Number.MAX_SAFE_INTEGER - 1;
};

export const buildAccountQuotaWindowDefinitions = (
  windows: AccountQuotaDisplayWindow[],
  nowMs = Date.now()
): AccountQuotaWindowDefinition[] =>
  windows
    .map((window): AccountQuotaWindowDefinition => {
      const boundaryAccuracy = resolveBoundaryAccuracy(window);
      const stale =
        (window.windowMode === 'fixed' || window.windowMode === 'calendar') &&
        typeof window.cycleEndMs === 'number' &&
        window.cycleEndMs <= nowMs;
      return {
        key: window.key,
        providerWindowId: window.key,
        provider: window.source ?? 'summary',
        label: window.label,
        kind: window.kind ?? 'unknown',
        windowMode: window.windowMode ?? 'unknown',
        modelScope: window.modelScope ?? { kind: 'all', complete: false },
        observationSource: window.observationSource ?? 'api_query',
        observedAtMs: window.observedAtMs ?? null,
        boundaryAccuracy,
        cycleStartMs: window.cycleStartMs ?? null,
        cycleEndMs: window.cycleEndMs ?? null,
        durationSeconds: window.limitWindowSeconds,
        remainingPercent: window.remainingPercent,
        usedPercent: window.usedPercent,
        stale,
        display: window,
      };
    })
    .sort((left, right) => {
      const rank = definitionSortRank(left) - definitionSortRank(right);
      if (rank !== 0) return rank;
      return left.providerWindowId.localeCompare(right.providerWindowId);
    });

export const buildAccountQuotaUsageRanges = (
  definition: AccountQuotaWindowDefinition,
  nowMs = Date.now()
): AccountQuotaUsageRange[] => {
  const durationMs = (definition.durationSeconds ?? 0) * 1000;
  if (durationMs <= 0) return [];

  if (definition.windowMode === 'rolling') {
    const ranges: AccountQuotaUsageRange[] = [
      { period: 'current', fromMs: nowMs - durationMs, toMs: nowMs },
      {
        period: 'previous_equal_range',
        fromMs: nowMs - 2 * durationMs,
        toMs: nowMs - durationMs,
      },
    ];
    return ranges.filter((range) => range.fromMs > 0 && range.fromMs < range.toMs);
  }

  if (
    (definition.windowMode !== 'fixed' && definition.windowMode !== 'calendar') ||
    !isReliableBoundary(definition.boundaryAccuracy) ||
    definition.stale ||
    definition.cycleStartMs === null ||
    definition.cycleEndMs === null
  ) {
    return [];
  }

  const currentEnd = Math.min(nowMs, definition.cycleEndMs);
  const ranges: AccountQuotaUsageRange[] = [];
  if (definition.cycleStartMs < currentEnd) {
    ranges.push({
      period: 'current',
      fromMs: definition.cycleStartMs,
      toMs: currentEnd,
    });
  }
  ranges.push({
    period: 'previous',
    fromMs: definition.cycleStartMs - durationMs,
    toMs: definition.cycleStartMs,
  });
  return ranges.filter((range) => range.fromMs > 0 && range.fromMs < range.toMs);
};
