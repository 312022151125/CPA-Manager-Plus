import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import type { QuotaCooldownInfo } from '@/services/api';
import type { AccountRow } from './accountRows';
import { buildAccountListItem, buildRecommendationBySelectionKey } from './accountListPresentation';
import type { AccountRecommendation } from './quotaRecommendations';

const makeRow = (overrides: Partial<AccountRow> = {}): AccountRow => {
  const raw: AuthFileItem = {
    name: overrides.fileName ?? 'codex-1.json',
    type: overrides.provider ?? 'codex',
  };

  return {
    key: raw.name,
    selectionKey: `${raw.name}\u0000${overrides.authIndex ?? '-'}`,
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

const makeRecommendation = (
  row: AccountRow,
  overrides: Partial<AccountRecommendation> = {}
): AccountRecommendation => ({
  row,
  action: 'refresh',
  priority: 'high',
  reasonKey: 'accounts.recommend_reason_low',
  ...overrides,
});

describe('accountListPresentation', () => {
  it('prioritizes re-authentication over quota state', () => {
    const row = makeRow({
      quota: {
        status: 'low',
        remainingPercent: 5,
        usedPercent: 95,
        resetLabel: 'later',
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
        createdAtMs: 3,
      },
    });
    const recommendation = makeRecommendation(row, {
      action: 'reauth',
      priority: 'critical',
      reasonKey: 'accounts.recommend_reason_inspection',
    });

    const item = buildAccountListItem(row, { recommendation });

    expect(item.health.status).toBe('reauth');
    expect(item.health.labelKey).toBe('accounts.health_reauth');
    expect(item.recommendation.actionLabelKey).toBe('accounts.recommend_action_reauth');
  });

  it('shows cooldown ahead of exhausted and disabled states', () => {
    const row = makeRow({
      disabled: true,
      quota: {
        status: 'exhausted',
        remainingPercent: 0,
        usedPercent: 100,
        resetLabel: 'later',
        planType: null,
        source: 'cache',
      },
    });
    const quotaCooldown: QuotaCooldownInfo = {
      authFileName: row.fileName,
      recoverAtMs: 1700000000000,
    };

    const item = buildAccountListItem(row, { quotaCooldown });

    expect(item.health.status).toBe('cooldown');
    expect(item.health.cooldown).toBe(quotaCooldown);
  });

  it('classifies quota and account fallback states', () => {
    expect(
      buildAccountListItem(
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
      ).health.status
    ).toBe('exhausted');
    expect(
      buildAccountListItem(
        makeRow({
          quota: {
            status: 'low',
            remainingPercent: 12,
            usedPercent: 88,
            resetLabel: '-',
            planType: null,
            source: 'cache',
          },
        })
      ).health.status
    ).toBe('low');
    expect(buildAccountListItem(makeRow({ statusMessage: 'custom problem' })).health.status).toBe(
      'problem'
    );
    expect(
      buildAccountListItem(
        makeRow({
          disabled: true,
          quota: {
            status: 'disabled',
            remainingPercent: null,
            usedPercent: null,
            resetLabel: '-',
            planType: null,
            source: 'none',
          },
        })
      ).health.status
    ).toBe('disabled');
    expect(buildAccountListItem(makeRow()).health.status).toBe('available');
    expect(
      buildAccountListItem(
        makeRow({
          quota: {
            status: 'unknown',
            remainingPercent: null,
            usedPercent: null,
            resetLabel: '-',
            planType: null,
            source: 'none',
          },
        })
      ).health.status
    ).toBe('unknown');
  });

  it('builds identity and activity summaries for list rendering', () => {
    const item = buildAccountListItem(
      makeRow({
        fileName: 'shared-codex.json',
        authIndex: 'auth-2',
        projectId: 'project-a',
        priority: -5,
        usage: {
          success: 3,
          failure: 1,
          successRate: 75,
          recentRequests: [],
        },
      })
    );

    expect(item.identity.subtitle).toBe('shared-codex.json · #auth-2 · project-a');
    expect(item.identity.priority).toBe(-5);
    expect(item.identity.priorityIsNegative).toBe(true);
    expect(item.activity.recentTotal).toBe(4);
    expect(item.activity.estimatedValue).toBeCloseTo(0.072);
  });

  it('maps recommendations by auth-file selection key', () => {
    const first = makeRow({ fileName: 'shared.json', authIndex: 'auth-1' });
    const second = makeRow({ fileName: 'shared.json', authIndex: 'auth-2' });
    const secondRecommendation = makeRecommendation(second, { action: 'disable' });

    const map = buildRecommendationBySelectionKey([
      makeRecommendation(first),
      secondRecommendation,
    ]);

    expect(map.get(first.selectionKey)?.row.authIndex).toBe('auth-1');
    expect(map.get(second.selectionKey)).toBe(secondRecommendation);
  });
});
