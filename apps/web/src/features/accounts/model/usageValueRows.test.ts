import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import type { MonitoringAnalyticsAccountStatRow } from '@/services/api/usageService';
import { buildAccountRows, type AccountQuotaStores } from './accountRows';
import {
  buildUsageValueRowsFromMonitoring,
  buildUsageValueRowsFromRecent,
  buildUsageValueSummary,
  filterUsageValueRows,
} from './usageValueRows';

const emptyStores = (): AccountQuotaStores => ({
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  kimiQuota: {},
  xaiQuota: {},
});

const makeStat = (
  overrides: Partial<MonitoringAnalyticsAccountStatRow> = {}
): MonitoringAnalyticsAccountStatRow => ({
  id: 'stat-1',
  calls: 0,
  success_calls: 0,
  failure_calls: 0,
  success_rate: 0,
  input_tokens: 0,
  output_tokens: 0,
  cached_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  total_tokens: 0,
  cost: 0,
  average_latency_ms: null,
  last_seen_ms: 0,
  ...overrides,
});

describe('usageValueRows', () => {
  it('builds fallback value rows from auth-file recent request buckets', () => {
    const files: AuthFileItem[] = [
      {
        name: 'codex-active.json',
        type: 'codex',
        email: 'active@example.com',
        recent_requests: [
          { success: 4, failed: 1 },
          { success: 5, failed: 0 },
        ],
      },
      {
        name: 'claude-idle.json',
        type: 'claude',
        recent_requests: [{ success: 0, failed: 1 }],
      },
    ];
    const rows = buildUsageValueRowsFromRecent(buildAccountRows(files, emptyStores()));

    expect(rows[0]).toMatchObject({
      key: 'recent:codex-active.json',
      accountLabel: 'active@example.com',
      provider: 'codex',
      requests: 10,
      successRate: 90,
      estimatedCost: 0.18,
      rating: 'normal',
      source: 'recent',
    });
    expect(rows[1]).toMatchObject({
      requests: 1,
      successRate: 0,
      rating: 'low',
    });
  });

  it('matches monitoring stats to account rows by auth index or account snapshot', () => {
    const accountRows = buildAccountRows(
      [
        {
          name: 'codex-a.json',
          type: 'codex',
          authIndex: 'auth-a',
          email: 'a@example.com',
        },
        {
          name: 'claude-b.json',
          type: 'claude',
          email: 'b@example.com',
        },
      ],
      emptyStores()
    );

    const rows = buildUsageValueRowsFromMonitoring(accountRows, [
      makeStat({
        id: 'by-auth-index',
        auth_indices: ['auth-a'],
        calls: 120,
        success_rate: 0.95,
        input_tokens: 1000,
        output_tokens: 400,
        cost: 1.25,
        last_seen_ms: 1000,
      }),
      makeStat({
        id: 'by-account-snapshot',
        account_snapshot: 'b@example.com',
        calls: 10,
        success_rate: 0.8,
        input_tokens: 200,
        output_tokens: 50,
        cost: 0.2,
        last_seen_ms: 2000,
      }),
    ]);

    expect(rows[0]).toMatchObject({
      accountLabel: 'a@example.com',
      fileName: 'codex-a.json',
      provider: 'codex',
      requests: 120,
      successRate: 95,
      rating: 'high',
      row: accountRows[0],
    });
    expect(rows[1]).toMatchObject({
      accountLabel: 'b@example.com',
      fileName: 'claude-b.json',
      provider: 'claude',
      successRate: 80,
      row: accountRows[1],
    });
  });

  it('summarizes value rows with request-weighted average success rate', () => {
    const summary = buildUsageValueSummary(
      [
        {
          key: 'one',
          accountLabel: 'one',
          fileName: 'one.json',
          provider: 'codex',
          requests: 100,
          successRate: 90,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 1,
          lastSeenMs: null,
          rating: 'high',
          source: 'monitoring',
        },
        {
          key: 'two',
          accountLabel: 'two',
          fileName: 'two.json',
          provider: 'claude',
          requests: 10,
          successRate: 50,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0.5,
          lastSeenMs: null,
          rating: 'low',
          source: 'monitoring',
        },
      ],
      'monitoring'
    );

    expect(summary.weeklyValue).toBe(1.5);
    expect(summary.historicalValue).toBe(1.5);
    expect(summary.highValueAccounts).toBe(1);
    expect(summary.lowActivityAccounts).toBe(1);
    expect(summary.averageSuccessRate).toBeCloseTo((90 * 100 + 50 * 10) / 110);
    expect(summary.source).toBe('monitoring');
  });

  it('filters usage rows by provider and search text', () => {
    const rows = buildUsageValueRowsFromRecent(
      buildAccountRows(
        [
          { name: 'codex-a.json', type: 'codex', email: 'alice@example.com' },
          { name: 'claude-b.json', type: 'claude', email: 'bob@example.com' },
        ],
        emptyStores()
      )
    );

    expect(filterUsageValueRows(rows, { provider: 'codex', search: '' })).toHaveLength(1);
    expect(filterUsageValueRows(rows, { provider: 'all', search: 'bob' }).map((row) => row.fileName)).toEqual([
      'claude-b.json',
    ]);
  });
});
