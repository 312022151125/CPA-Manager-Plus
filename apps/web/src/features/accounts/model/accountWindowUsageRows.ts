import type {
  MonitoringAccountWindowModelScope,
  MonitoringAccountWindowUsageItem,
  MonitoringAccountWindowUsageTarget,
} from '@/services/api/usageService';
import type { AccountRow } from './accountRows';
import { buildAccountHistoryTargetEntries } from './accountHistoryRows';
import {
  buildAccountQuotaUsageRanges,
  type AccountQuotaUsagePeriod,
  type AccountQuotaWindowDefinition,
} from './accountQuotaWindowDefinitions';

export interface AccountWindowUsageWindow {
  key: string;
  fromMs: number | null;
  toMs: number | null;
  providerWindowId?: string;
  period?: AccountQuotaUsagePeriod;
  modelScope?: MonitoringAccountWindowModelScope;
}

export interface AccountWindowUsageTargetEntry {
  rowKey: string;
  windowKey: string;
  providerWindowId: string;
  period: AccountQuotaUsagePeriod;
  requestKey: string;
  target: MonitoringAccountWindowUsageTarget;
}

const modelScopeRequestPart = (scope: MonitoringAccountWindowModelScope | undefined) =>
  [scope?.kind ?? 'all', scope?.key ?? '', ...(scope?.models ?? []).map((model) => model.trim())]
    .join(':')
    .toLowerCase();

export const accountWindowUsageRequestKey = (
  rowKey: string,
  providerWindowId: string,
  period: AccountQuotaUsagePeriod = 'current',
  scope?: MonitoringAccountWindowModelScope
) => `${rowKey}\u0000${providerWindowId}\u0000${modelScopeRequestPart(scope)}\u0000${period}`;

const isQuotaWindowDefinition = (
  window: AccountWindowUsageWindow | AccountQuotaWindowDefinition
): window is AccountQuotaWindowDefinition => 'windowMode' in window;

const hasQueryableModelScope = (definition: AccountQuotaWindowDefinition): boolean => {
  const scope = definition.modelScope;
  if (scope.complete === false) return false;
  if (scope.kind === 'all') return true;
  if (scope.kind === 'models') return (scope.models?.length ?? 0) > 0;
  return Boolean(scope.key) || (scope.models?.length ?? 0) > 0;
};

export const buildAccountWindowUsageTargetEntries = (
  rows: AccountRow[],
  windowsByRowKey: Map<string, Array<AccountWindowUsageWindow | AccountQuotaWindowDefinition>>,
  nowMs = Date.now()
): AccountWindowUsageTargetEntry[] => {
  const targetByRowKey = new Map(
    buildAccountHistoryTargetEntries(rows).map((entry) => [entry.rowKey, entry.target])
  );
  const entries: AccountWindowUsageTargetEntry[] = [];

  rows.forEach((row) => {
    const accountTarget = targetByRowKey.get(row.selectionKey);
    if (!accountTarget) return;
    const windows = windowsByRowKey.get(row.selectionKey) ?? [];
    windows.forEach((window) => {
      if (isQuotaWindowDefinition(window) && !hasQueryableModelScope(window)) return;
      const providerWindowId = isQuotaWindowDefinition(window)
        ? window.providerWindowId
        : (window.providerWindowId ?? window.key);
      const modelScope: MonitoringAccountWindowModelScope = isQuotaWindowDefinition(window)
        ? {
            kind: window.modelScope.kind,
            key: window.modelScope.key,
            models: window.modelScope.models,
          }
        : (window.modelScope ?? { kind: 'all' });
      const ranges = isQuotaWindowDefinition(window)
        ? buildAccountQuotaUsageRanges(window, nowMs)
        : window.fromMs && window.toMs && window.fromMs < window.toMs
          ? [
              {
                period: window.period ?? ('current' as const),
                fromMs: window.fromMs,
                toMs: window.toMs,
              },
            ]
          : [];
      ranges.forEach((range) => {
        const requestKey = accountWindowUsageRequestKey(
          row.selectionKey,
          providerWindowId,
          range.period,
          modelScope
        );
        entries.push({
          rowKey: row.selectionKey,
          windowKey: window.key,
          providerWindowId,
          period: range.period,
          requestKey,
          target: {
            request_key: requestKey,
            row_key: row.selectionKey,
            window_key: window.key,
            provider_window_id: providerWindowId,
            period: range.period,
            from_ms: range.fromMs,
            to_ms: range.toMs,
            model_scope: modelScope,
            account_snapshot: accountTarget.account_snapshot,
            auth_label_snapshot: accountTarget.auth_label_snapshot,
            auth_index: accountTarget.auth_index,
            source: accountTarget.source,
          },
        });
      });
    });
  });

  return entries;
};

export const buildAccountWindowUsageByKey = (
  entries: AccountWindowUsageTargetEntry[],
  items: MonitoringAccountWindowUsageItem[]
): Map<string, MonitoringAccountWindowUsageItem> => {
  const result = new Map<string, MonitoringAccountWindowUsageItem>();
  entries.forEach((entry, index) => {
    const item =
      items.find((candidate) => candidate.request_key === entry.requestKey) ??
      items.find(
        (candidate) =>
          candidate.row_key === entry.rowKey &&
          (candidate.provider_window_id === entry.providerWindowId ||
            candidate.window_key === entry.windowKey) &&
          (candidate.period ?? 'current') === entry.period
      ) ??
      items[index];
    if (item) {
      result.set(entry.requestKey, item);
    }
  });
  return result;
};
