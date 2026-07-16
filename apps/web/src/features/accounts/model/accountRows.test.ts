import { describe, expect, it } from 'vitest';
import type { AuthFileItem, CodexQuotaState } from '@/types';
import type { CodexInspectionResult, UsageHeaderSnapshot } from '@/services/api/usageService';
import {
  buildAccountMetrics,
  buildAccountRows,
  filterAccountRows,
  sortAccountRows,
  type AccountQuotaStores,
} from './accountRows';

const emptyStores = (): AccountQuotaStores => ({
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  kimiQuota: {},
  xaiQuota: {},
});

describe('accountRows', () => {
  it('normalizes Codex quota usage into remaining percent and risk status', () => {
    const files: AuthFileItem[] = [
      {
        name: 'codex-low.json',
        type: 'codex',
        authIndex: '1',
      },
    ];
    const rows = buildAccountRows(files, {
      ...emptyStores(),
      codexQuota: {
        'codex-low.json': {
          status: 'success',
          planType: 'plus',
          windows: [
            {
              id: 'weekly',
              label: 'Weekly',
              usedPercent: 87,
              resetLabel: 'Mon',
            },
          ],
        },
      },
    });

    expect(rows[0].quota.remainingPercent).toBe(13);
    expect(rows[0].quota.usedPercent).toBe(87);
    expect(rows[0].quota.status).toBe('low');
    expect(rows[0].planType).toBe('plus');
  });

  it('marks observed Codex usage header quota and searches header diagnostics', () => {
    const rows = buildAccountRows(
      [
        {
          name: 'codex-observed.json',
          type: 'codex',
          authIndex: '2',
          account: 'observed@example.com',
        },
      ],
      {
        ...emptyStores(),
        codexQuota: {
          'codex-observed.json': {
            status: 'success',
            planType: 'plus',
            windows: [
              {
                id: 'usage-header-observed',
                label: 'Latest request',
                usedPercent: 100,
                resetLabel: '2026-06-25 10:00',
              },
            ],
            observedFromUsageHeaders: true,
            observedAtMs: 1000,
            observedTraceId: 'trace-observed',
            observedErrorKind: 'rate_limit',
            observedErrorCode: 'usage_limit',
            activeLimit: 'primary',
            rateLimitReachedType: 'primary',
          },
        },
      }
    );

    expect(rows[0].quota.source).toBe('observed-header');
    expect(rows[0].quota.status).toBe('exhausted');
    expect(rows[0].quota.observedTraceId).toBe('trace-observed');
    expect(rows[0].quota.observedErrorCode).toBe('usage_limit');

    expect(
      filterAccountRows(rows, {
        provider: 'all',
        status: 'all',
        plan: 'all',
        quotaBand: 'all',
        search: 'trace-observed',
      }).map((row) => row.fileName)
    ).toEqual(['codex-observed.json']);

    expect(
      filterAccountRows(rows, {
        provider: 'all',
        status: 'all',
        plan: 'all',
        quotaBand: 'all',
        search: 'usage_limit',
      }).map((row) => row.fileName)
    ).toEqual(['codex-observed.json']);
  });

  it('builds selection keys with auth indexes for shared auth rows', () => {
    const rows = buildAccountRows(
      [
        { name: 'shared.codex.json', type: 'codex', authIndex: '0' },
        { name: 'plain.codex.json', type: 'codex' },
      ],
      emptyStores()
    );

    expect(rows[0].selectionKey).toBe('shared.codex.json\u00000');
    expect(rows[1].selectionKey).toBe('plain.codex.json\u0000-');
  });

  it('uses selection-key Codex quota overrides for shared auth rows', () => {
    const rows = buildAccountRows(
      [
        { name: 'shared.codex.json', type: 'codex', authIndex: '0' },
        { name: 'shared.codex.json', type: 'codex', authIndex: '1' },
      ],
      emptyStores(),
      undefined,
      {
        codexQuotaBySelectionKey: new Map<string, CodexQuotaState>([
          [
            'shared.codex.json\u00000',
            {
              status: 'success',
              windows: [{ id: 'a', label: 'A', usedPercent: 10, resetLabel: 'A reset' }],
            },
          ],
          [
            'shared.codex.json\u00001',
            {
              status: 'success',
              windows: [{ id: 'b', label: 'B', usedPercent: 90, resetLabel: 'B reset' }],
              observedFromUsageHeaders: true,
              observedTraceId: 'trace-auth-index-1',
            },
          ],
        ]),
      }
    );

    expect(rows[0].quota.usedPercent).toBe(10);
    expect(rows[0].quota.source).toBe('cache');
    expect(rows[1].quota.usedPercent).toBe(90);
    expect(rows[1].quota.source).toBe('observed-header');
    expect(rows[1].quota.observedTraceId).toBe('trace-auth-index-1');
  });

  it('matches Codex inspection results by auth index for shared auth rows', () => {
    const inspection: CodexInspectionResult = {
      id: 10,
      runId: 1,
      accountKey: 'second',
      fileName: 'shared.codex.json',
      displayAccount: 'second@example.com',
      authIndex: '1',
      provider: 'codex',
      disabled: false,
      action: 'reauth',
      actionReason: 'expired',
      statusCode: 401,
      isQuota: false,
      createdAtMs: 1000,
    };
    const rows = buildAccountRows(
      [
        { name: 'shared.codex.json', type: 'codex', authIndex: '0' },
        { name: 'shared.codex.json', type: 'codex', authIndex: '1' },
      ],
      emptyStores(),
      [inspection]
    );

    expect(rows[0].inspection).toBeNull();
    expect(rows[1].inspection?.action).toBe('reauth');
    expect(rows[1].inspection?.statusCode).toBe(401);
  });

  it('surfaces diagnostic-only Codex header snapshots without quota cache', () => {
    const snapshot: UsageHeaderSnapshot = {
      event_hash: 'diagnostic-only',
      timestamp_ms: 1700000000000,
      header_trace_id: 'trace-diagnostic-only',
      header_error_kind: 'rate_limit',
      header_error_code: 'usage_limit_reached',
    };
    const rows = buildAccountRows(
      [
        {
          name: 'codex-diagnostic.json',
          type: 'codex',
          authIndex: '2',
          account: 'diagnostic@example.com',
        },
      ],
      emptyStores(),
      undefined,
      {
        codexHeaderSnapshotBySelectionKey: new Map<string, UsageHeaderSnapshot>([
          ['codex-diagnostic.json\u00002', snapshot],
        ]),
      }
    );

    expect(rows[0].quota.source).toBe('observed-header');
    expect(rows[0].quota.status).toBe('unknown');
    expect(rows[0].quota.usedPercent).toBeNull();
    expect(rows[0].quota.observedAtMs).toBe(1700000000000);
    expect(rows[0].quota.observedTraceId).toBe('trace-diagnostic-only');
    expect(rows[0].quota.observedErrorKind).toBe('rate_limit');
    expect(rows[0].quota.observedErrorCode).toBe('usage_limit_reached');

    expect(
      filterAccountRows(rows, {
        provider: 'all',
        status: 'all',
        plan: 'all',
        quotaBand: 'all',
        search: 'trace-diagnostic-only',
      }).map((row) => row.fileName)
    ).toEqual(['codex-diagnostic.json']);

    expect(
      filterAccountRows(rows, {
        provider: 'all',
        status: 'all',
        plan: 'all',
        quotaBand: 'all',
        search: 'usage_limit_reached',
      }).map((row) => row.fileName)
    ).toEqual(['codex-diagnostic.json']);
  });

  it('uses Antigravity quota buckets and subscription plan in account rows', () => {
    const rows = buildAccountRows([{ name: 'antigravity.json', type: 'antigravity' }], {
      ...emptyStores(),
      antigravityQuota: {
        'antigravity.json': {
          status: 'success',
          subscription: {
            plan: 'pro',
            tierName: 'Pro',
            tierId: 'pro',
          },
          groups: [
            {
              id: 'primary',
              label: 'Primary',
              buckets: [
                {
                  id: 'weekly',
                  label: 'Weekly',
                  remainingFraction: 0.42,
                  resetTime: '07-11 12:00',
                },
              ],
            },
          ],
        },
      },
    });

    expect(rows[0].planType).toBe('pro');
    expect(rows[0].quota.remainingPercent).toBe(42);
    expect(rows[0].quota.usedPercent).toBe(58);
    expect(rows[0].quota.resetLabel).toBe('07-11 12:00');
  });

  it('uses the tightest Kimi quota row for account summary and reset label', () => {
    const rows = buildAccountRows([{ name: 'kimi.json', type: 'kimi' }], {
      ...emptyStores(),
      kimiQuota: {
        'kimi.json': {
          status: 'success',
          rows: [
            {
              id: 'daily',
              label: 'Daily',
              used: 1,
              limit: 10,
              resetHint: '1d',
            },
            {
              id: 'weekly',
              label: 'Weekly',
              used: 9,
              limit: 10,
              resetHint: '6d',
            },
          ],
        },
      },
    });

    expect(rows[0].quota.remainingPercent).toBe(10);
    expect(rows[0].quota.usedPercent).toBe(90);
    expect(rows[0].quota.resetLabel).toBe('6d');
    expect(rows[0].quota.status).toBe('low');
  });

  it('keeps xAI account available while pay-as-you-go quota remains', () => {
    const rows = buildAccountRows([{ name: 'xai.json', type: 'xai' }], {
      ...emptyStores(),
      xaiQuota: {
        'xai.json': {
          status: 'success',
          billing: {
            periodType: 'monthly',
            usagePercent: null,
            productUsage: [],
            monthlyLimitCents: 10_000,
            usedCents: 12_500,
            includedUsedCents: 10_000,
            onDemandCapCents: 5_000,
            onDemandUsedCents: 2_500,
            onDemandUsedPercent: 50,
            billingPeriodEnd: '2026-07-31T00:00:00Z',
            usedPercent: 100,
          },
        },
      },
    });

    expect(rows[0].quota.remainingPercent).toBeCloseTo(16.667, 2);
    expect(rows[0].quota.usedPercent).toBeCloseTo(83.333, 2);
    expect(rows[0].quota.resetLabel).toBe('2026-07-31T00:00:00Z');
    expect(rows[0].quota.status).toBe('low');
  });

  it('uses xAI weekly credits when they are the tightest quota window', () => {
    const rows = buildAccountRows([{ name: 'xai.json', type: 'xai' }], {
      ...emptyStores(),
      xaiQuota: {
        'xai.json': {
          status: 'success',
          billing: {
            periodType: 'weekly',
            usagePercent: 92,
            periodEnd: '2026-07-08T00:00:00Z',
            productUsage: [{ product: 'Grok Code Fast', usagePercent: 92 }],
            monthlyLimitCents: 10_000,
            usedCents: 2_000,
            includedUsedCents: 2_000,
            onDemandCapCents: null,
            onDemandUsedCents: null,
            onDemandUsedPercent: null,
            billingPeriodEnd: '2026-07-31T00:00:00Z',
            usedPercent: 20,
          },
        },
      },
    });

    expect(rows[0].quota.remainingPercent).toBe(8);
    expect(rows[0].quota.usedPercent).toBe(92);
    expect(rows[0].quota.resetLabel).toBe('2026-07-08T00:00:00Z');
    expect(rows[0].quota.status).toBe('low');
  });

  it('uses xAI product usage when period usage is not available', () => {
    const rows = buildAccountRows([{ name: 'xai.json', type: 'xai' }], {
      ...emptyStores(),
      xaiQuota: {
        'xai.json': {
          status: 'success',
          billing: {
            periodType: 'weekly',
            usagePercent: null,
            periodEnd: '2026-07-08T00:00:00Z',
            productUsage: [{ product: 'Grok Code Fast', usagePercent: 100 }],
            monthlyLimitCents: 10_000,
            usedCents: 2_000,
            includedUsedCents: 2_000,
            onDemandCapCents: null,
            onDemandUsedCents: null,
            onDemandUsedPercent: null,
            billingPeriodEnd: '2026-07-31T00:00:00Z',
            usedPercent: 20,
          },
        },
      },
    });

    expect(rows[0].quota.remainingPercent).toBe(0);
    expect(rows[0].quota.usedPercent).toBe(100);
    expect(rows[0].quota.resetLabel).toBe('2026-07-08T00:00:00Z');
    expect(rows[0].quota.status).toBe('exhausted');
  });

  it('keeps cached Codex quota source while appending header diagnostics', () => {
    const rows = buildAccountRows(
      [
        {
          name: 'codex-cache.json',
          type: 'codex',
          authIndex: 'auth-cache',
        },
      ],
      {
        ...emptyStores(),
        codexQuota: {
          'codex-cache.json': {
            status: 'success',
            planType: 'plus',
            windows: [
              {
                id: 'weekly',
                label: 'Weekly',
                usedPercent: 25,
                resetLabel: 'Mon',
              },
            ],
          },
        },
      },
      undefined,
      {
        codexHeaderSnapshotBySelectionKey: new Map<string, UsageHeaderSnapshot>([
          [
            'codex-cache.json\u0000auth-cache',
            {
              event_hash: 'cache-diagnostic',
              timestamp_ms: 1700000000100,
              header_trace_id: 'trace-cache-diagnostic',
              header_error_code: 'quota_warning',
            },
          ],
        ]),
      }
    );

    expect(rows[0].quota.source).toBe('cache');
    expect(rows[0].quota.usedPercent).toBe(25);
    expect(rows[0].quota.observedTraceId).toBe('trace-cache-diagnostic');
    expect(rows[0].quota.observedErrorCode).toBe('quota_warning');
  });

  it('builds account metrics from quota, disabled state, usage, and inspection results', () => {
    const files: AuthFileItem[] = [
      {
        name: 'codex-low.json',
        type: 'codex',
        recent_requests: [{ success: 9, failed: 1 }],
      },
      {
        name: 'codex-disabled.json',
        type: 'codex',
        disabled: true,
        recent_requests: [{ success: 0, failed: 2 }],
      },
    ];
    const inspection: CodexInspectionResult[] = [
      {
        id: 10,
        runId: 1,
        accountKey: 'codex-low.json',
        fileName: 'codex-low.json',
        displayAccount: 'codex-low.json',
        provider: 'codex',
        disabled: false,
        action: 'disable',
        actionReason: 'low quota',
        actionStatus: 'pending',
        statusCode: 200,
        usedPercent: 96,
        isQuota: true,
        createdAtMs: 1000,
      },
    ];

    const rows = buildAccountRows(
      files,
      {
        ...emptyStores(),
        codexQuota: {
          'codex-low.json': {
            status: 'success',
            windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 96, resetLabel: 'Mon' }],
          },
        },
      },
      inspection
    );

    expect(rows[0].inspection?.action).toBe('disable');
    expect(rows[1].quota.status).toBe('disabled');

    const metrics = buildAccountMetrics(rows);
    expect(metrics.total).toBe(2);
    expect(metrics.lowQuota).toBe(1);
    expect(metrics.disabled).toBe(1);
    expect(metrics.needsInspectionAction).toBe(1);
    expect(metrics.successRate).toBeCloseTo((9 / 12) * 100);
  });

  it('filters rows by quota band and search text', () => {
    const rows = buildAccountRows(
      [
        { name: 'codex-low.json', type: 'codex', email: 'low@example.com' },
        { name: 'claude-ok.json', type: 'claude', email: 'ok@example.com' },
      ],
      {
        ...emptyStores(),
        codexQuota: {
          'codex-low.json': {
            status: 'success',
            windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 90, resetLabel: 'Mon' }],
          },
        },
        claudeQuota: {
          'claude-ok.json': {
            status: 'success',
            windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 25, resetLabel: 'Mon' }],
          },
        },
      }
    );

    expect(
      filterAccountRows(rows, {
        provider: 'all',
        status: 'all',
        plan: 'all',
        quotaBand: 'lt20',
        search: '',
      }).map((row) => row.fileName)
    ).toEqual(['codex-low.json']);

    expect(
      filterAccountRows(rows, {
        provider: 'all',
        status: 'all',
        plan: 'all',
        quotaBand: 'all',
        search: 'ok@example',
      }).map((row) => row.fileName)
    ).toEqual(['claude-ok.json']);
  });

  it('sorts rows by priority, recent requests, and reset label', () => {
    const rows = buildAccountRows(
      [
        {
          name: 'low.json',
          type: 'codex',
          priority: -1,
          createdAtMs: 1000,
          recent_requests: [{ success: 1, failed: 0 }],
        },
        {
          name: 'middle.json',
          type: 'codex',
          priority: 2,
          createdAtMs: 3000,
          recent_requests: [{ success: 3, failed: 2 }],
        },
        {
          name: 'high.json',
          type: 'codex',
          priority: 10,
          createdAtMs: 2000,
          recent_requests: [{ success: 2, failed: 1 }],
        },
      ],
      {
        ...emptyStores(),
        codexQuota: {
          'low.json': {
            status: 'success',
            windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 90, resetLabel: '2026-01-10' }],
          },
          'middle.json': {
            status: 'success',
            windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 40, resetLabel: '2026-01-02' }],
          },
          'high.json': {
            status: 'success',
            windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 10, resetLabel: '-' }],
          },
        },
      }
    );

    expect(
      sortAccountRows(rows, { key: 'priority', direction: 'desc' }).map((row) => row.fileName)
    ).toEqual(['high.json', 'middle.json', 'low.json']);
    expect(
      sortAccountRows(rows, { key: 'recent', direction: 'desc' }).map((row) => row.fileName)
    ).toEqual(['middle.json', 'high.json', 'low.json']);
    expect(
      sortAccountRows(rows, { key: 'reset', direction: 'asc' }).map((row) => row.fileName)
    ).toEqual(['middle.json', 'low.json', 'high.json']);
    expect(
      sortAccountRows(rows, { key: 'quota', direction: 'desc' }).map((row) => row.fileName)
    ).toEqual(['high.json', 'middle.json', 'low.json']);
    expect(
      sortAccountRows(rows, { key: 'quota', direction: 'asc' }).map((row) => row.fileName)
    ).toEqual(['low.json', 'middle.json', 'high.json']);
    expect(
      sortAccountRows(rows, { key: 'created', direction: 'desc' }).map((row) => row.fileName)
    ).toEqual(['middle.json', 'high.json', 'low.json']);
    expect(
      sortAccountRows(rows, { key: 'created', direction: 'asc' }).map((row) => row.fileName)
    ).toEqual(['low.json', 'high.json', 'middle.json']);
  });
});
