import type {
  MonitoringAnalyticsAccountStatRow,
  MonitoringAnalyticsTimelinePoint,
} from '@/services/api/usageService';
import type { AccountRow } from './accountRows';

export type UsageValueRange = '24h' | '7d' | '30d';

export type UsageValueSource = 'monitoring' | 'recent';

export interface UsageValueRow {
  key: string;
  accountLabel: string;
  fileName: string;
  provider: string;
  requests: number;
  successRate: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  lastSeenMs: number | null;
  rating: 'high' | 'normal' | 'low';
  source: UsageValueSource;
  row?: AccountRow;
}

export interface UsageValueSummary {
  weeklyValue: number;
  historicalValue: number;
  highValueAccounts: number;
  lowActivityAccounts: number;
  averageSuccessRate: number | null;
  source: UsageValueSource;
}

const FALLBACK_REQUEST_VALUE = 0.018;

const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const buildRowKeyCandidates = (row: AccountRow): string[] =>
  [
    row.fileName,
    row.authIndex,
    row.accountLabel,
    row.raw.account,
    row.raw.email,
    row.raw.label,
    row.raw.note,
  ]
    .map(normalizeText)
    .filter(Boolean);

const buildMonitoringKeyCandidates = (stat: MonitoringAnalyticsAccountStatRow): string[] =>
  [
    stat.id,
    stat.account_snapshot,
    stat.auth_label_snapshot,
    stat.auth_provider_snapshot,
    ...(stat.auth_indices ?? []),
    ...(stat.sources ?? []),
  ]
    .map(normalizeText)
    .filter(Boolean);

const resolveRating = (requests: number, successRate: number | null, cost: number) => {
  if (requests === 0) return 'low';
  if (cost >= 1 || requests >= 100 || (successRate !== null && successRate >= 95 && requests >= 20)) {
    return 'high';
  }
  if (requests < 3 || (successRate !== null && successRate < 60)) return 'low';
  return 'normal';
};

export const buildUsageValueRowsFromMonitoring = (
  accountRows: AccountRow[],
  stats: MonitoringAnalyticsAccountStatRow[]
): UsageValueRow[] => {
  const rowsByKey = new Map<string, AccountRow>();
  accountRows.forEach((row) => {
    buildRowKeyCandidates(row).forEach((key) => rowsByKey.set(key, row));
  });

  return stats.map((stat) => {
    const row = buildMonitoringKeyCandidates(stat)
      .map((key) => rowsByKey.get(key))
      .find(Boolean);
    const requests = stat.calls;
    const successRate = Number.isFinite(stat.success_rate) ? stat.success_rate * 100 : null;
    const provider =
      row?.provider || normalizeText(stat.auth_provider_snapshot) || stat.sources?.[0] || 'unknown';
    const accountLabel = row?.accountLabel || stat.account_snapshot || stat.auth_label_snapshot || stat.id;
    const fileName = row?.fileName || stat.auth_indices?.[0] || stat.id;
    return {
      key: `monitoring:${stat.id}`,
      accountLabel,
      fileName,
      provider,
      requests,
      successRate,
      inputTokens: stat.input_tokens,
      outputTokens: stat.output_tokens,
      estimatedCost: stat.cost,
      lastSeenMs: stat.last_seen_ms || null,
      rating: resolveRating(requests, successRate, stat.cost),
      source: 'monitoring',
      row,
    };
  });
};

export const buildUsageValueRowsFromRecent = (accountRows: AccountRow[]): UsageValueRow[] =>
  accountRows.map((row) => {
    const requests = row.usage.success + row.usage.failure;
    const estimatedCost = requests * FALLBACK_REQUEST_VALUE;
    return {
      key: `recent:${row.fileName}`,
      accountLabel: row.accountLabel,
      fileName: row.fileName,
      provider: row.provider,
      requests,
      successRate: row.usage.successRate,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost,
      lastSeenMs: null,
      rating: resolveRating(requests, row.usage.successRate, estimatedCost),
      source: 'recent',
      row,
    };
  });

export const buildUsageValueSummary = (
  rows: UsageValueRow[],
  source: UsageValueSource
): UsageValueSummary => {
  const requestTotals = rows.reduce(
    (acc, row) => {
      acc.cost += row.estimatedCost;
      acc.requests += row.requests;
      if (row.successRate !== null) {
        acc.successWeighted += row.successRate * row.requests;
        acc.successRequests += row.requests;
      }
      return acc;
    },
    { cost: 0, requests: 0, successWeighted: 0, successRequests: 0 }
  );

  return {
    weeklyValue: requestTotals.cost,
    historicalValue: requestTotals.cost,
    highValueAccounts: rows.filter((row) => row.rating === 'high').length,
    lowActivityAccounts: rows.filter((row) => row.rating === 'low').length,
    averageSuccessRate:
      requestTotals.successRequests > 0
        ? requestTotals.successWeighted / requestTotals.successRequests
        : null,
    source,
  };
};

export const filterUsageValueRows = (
  rows: UsageValueRow[],
  filters: { provider: string; search: string }
) => {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.provider !== 'all' && row.provider !== filters.provider) return false;
    if (!search) return true;
    return [row.accountLabel, row.fileName, row.provider]
      .map((value) => value.toLowerCase())
      .some((value) => value.includes(search));
  });
};

export const buildFallbackTimeline = (rows: UsageValueRow[]): MonitoringAnalyticsTimelinePoint[] => [
  {
    bucket_ms: Date.now(),
    label: 'current',
    calls: rows.reduce((total, row) => total + row.requests, 0),
    tokens: rows.reduce((total, row) => total + row.inputTokens + row.outputTokens, 0),
    success: rows.reduce((total, row) => {
      if (row.successRate === null) return total;
      return total + Math.round((row.requests * row.successRate) / 100);
    }, 0),
    failure: rows.reduce((total, row) => {
      if (row.successRate === null) return total;
      return total + row.requests;
    }, 0),
  },
];
