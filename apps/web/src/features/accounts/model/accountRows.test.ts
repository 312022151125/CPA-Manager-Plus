import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import type { CodexInspectionResult } from '@/services/api/usageService';
import {
  buildAccountMetrics,
  buildAccountRows,
  filterAccountRows,
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
});
