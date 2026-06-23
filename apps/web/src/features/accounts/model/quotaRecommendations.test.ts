import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import type { AccountRow } from './accountRows';
import {
  buildAccountRecommendation,
  buildAccountRecommendations,
  getRecommendationRank,
} from './quotaRecommendations';

const makeRow = (overrides: Partial<AccountRow> = {}): AccountRow => {
  const raw: AuthFileItem = {
    name: overrides.fileName ?? 'codex-1.json',
    type: overrides.provider ?? 'codex',
  };

  return {
    key: raw.name,
    fileName: raw.name,
    accountLabel: raw.name,
    provider: 'codex',
    planType: null,
    disabled: false,
    runtimeOnly: false,
    statusMessage: '',
    authIndex: '',
    projectId: '',
    priority: null,
    quota: {
      status: 'ok',
      remainingPercent: 80,
      usedPercent: 20,
      resetLabel: '-',
      planType: null,
      source: 'cache',
    },
    usage: {
      success: 0,
      failure: 0,
      successRate: null,
      recentRequests: [],
    },
    inspection: null,
    raw,
    ...overrides,
  };
};

describe('quotaRecommendations', () => {
  it('disables active exhausted accounts with critical priority', () => {
    const recommendation = buildAccountRecommendation(
      makeRow({
        quota: {
          status: 'exhausted',
          remainingPercent: 0,
          usedPercent: 100,
          resetLabel: '-',
          planType: null,
          source: 'cache',
        },
      })
    );

    expect(recommendation?.action).toBe('disable');
    expect(recommendation?.priority).toBe('critical');
    expect(recommendation?.reasonKey).toBe('accounts.recommend_reason_exhausted');
  });

  it('refreshes low quota accounts with high priority', () => {
    const recommendation = buildAccountRecommendation(
      makeRow({
        quota: {
          status: 'low',
          remainingPercent: 12,
          usedPercent: 88,
          resetLabel: 'Mon',
          planType: 'plus',
          source: 'cache',
        },
      })
    );

    expect(recommendation?.action).toBe('refresh');
    expect(recommendation?.priority).toBe('high');
    expect(recommendation?.reasonKey).toBe('accounts.recommend_reason_low');
  });

  it('enables disabled accounts after quota recovery', () => {
    const recommendation = buildAccountRecommendation(makeRow({ disabled: true }));

    expect(recommendation?.action).toBe('enable');
    expect(recommendation?.priority).toBe('medium');
    expect(recommendation?.reasonKey).toBe('accounts.recommend_reason_recovered');
  });

  it('restores negative priority to default when the account is otherwise healthy', () => {
    const recommendation = buildAccountRecommendation(makeRow({ priority: -5 }));

    expect(recommendation?.action).toBe('restore-default');
    expect(recommendation?.priority).toBe('low');
    expect(recommendation?.reasonKey).toBe('accounts.recommend_reason_priority');
  });

  it('lets inspection advice override quota state', () => {
    const recommendation = buildAccountRecommendation(
      makeRow({
        quota: {
          status: 'ok',
          remainingPercent: 90,
          usedPercent: 10,
          resetLabel: '-',
          planType: null,
          source: 'cache',
        },
        inspection: {
          action: 'reauth',
          actionReason: 'expired',
          actionStatus: 'pending',
          statusCode: 401,
          usedPercent: null,
          runId: 1,
          resultId: 2,
          createdAtMs: 1000,
        },
      })
    );

    expect(recommendation?.action).toBe('reauth');
    expect(recommendation?.priority).toBe('critical');
    expect(recommendation?.reasonKey).toBe('accounts.recommend_reason_inspection');
  });

  it('sorts recommendations by priority rank and then account name', () => {
    const rows = [
      makeRow({ fileName: 'z-low.json', quota: { status: 'low', remainingPercent: 10, usedPercent: 90, resetLabel: '-', planType: null, source: 'cache' } }),
      makeRow({ fileName: 'a-exhausted.json', quota: { status: 'exhausted', remainingPercent: 0, usedPercent: 100, resetLabel: '-', planType: null, source: 'cache' } }),
      makeRow({ fileName: 'b-low.json', quota: { status: 'low', remainingPercent: 15, usedPercent: 85, resetLabel: '-', planType: null, source: 'cache' } }),
    ];

    expect(buildAccountRecommendations(rows).map((item) => item.row.fileName)).toEqual([
      'a-exhausted.json',
      'b-low.json',
      'z-low.json',
    ]);
    expect(getRecommendationRank('critical')).toBeGreaterThan(getRecommendationRank('high'));
  });
});
