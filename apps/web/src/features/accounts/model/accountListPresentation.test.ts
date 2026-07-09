import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import type { QuotaCooldownInfo } from '@/services/api';
import type { AuthFileCodexStatusSummary } from '@/features/authFiles/model/authFilesPageModel';
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
    createdAtMs: null,
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

const makeCodexStatus = (
  overrides: Partial<AuthFileCodexStatusSummary> = {}
): AuthFileCodexStatusSummary => ({
  isCodex: true,
  isHttp401: false,
  needsReauth: false,
  isQuotaLimited: false,
  isUnknownQuotaLimited: false,
  isFiveHourLimited: false,
  isWeeklyLimited: false,
  isMonthlyLimited: false,
  hasDisabledRecoveryReset: false,
  fiveHourResetLabel: null,
  weeklyResetLabel: null,
  monthlyResetLabel: null,
  recoveryResetLabel: null,
  fiveHourUsedPercent: null,
  weeklyUsedPercent: null,
  monthlyUsedPercent: null,
  badges: [],
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
    expect(item.health.reasonKey).toBe('accounts.health_reason_reauth_inspection');
    expect(item.health.reasonParams).toEqual({ detail: 'HTTP 401' });
    expect(item.health.reasonTone).toBe('danger');
    expect(item.recommendation.actionLabelKey).toBe('accounts.recommend_action_reauth');
  });

  it('summarizes quota refresh 401 as a quota refresh reauth reason', () => {
    const item = buildAccountListItem(
      makeRow({
        quota: {
          status: 'error',
          remainingPercent: null,
          usedPercent: null,
          resetLabel: '-',
          planType: null,
          source: 'cache',
          error:
            '额度获取失败：401 Your authentication token has been invalidated. Please try signing in again.',
        },
      })
    );

    expect(item.health.status).toBe('reauth');
    expect(item.health.reasonKey).toBe('accounts.health_reason_reauth_quota_refresh');
    expect(item.health.reasonParams).toEqual({ code: '401' });
    expect(item.health.tooltipParams.detail).toBe(
      '额度获取失败：401 Your authentication token has been invalidated. Please try signing in again.'
    );
  });

  it('shows window cooldown ahead of exhausted and disabled states', () => {
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

    const item = buildAccountListItem(row, {
      quotaCooldown,
      codexStatus: makeCodexStatus({
        isQuotaLimited: true,
        isFiveHourLimited: true,
        fiveHourResetLabel: 'later',
      }),
    });

    expect(item.health.status).toBe('five_hour_cooldown');
    expect(item.health.reasonKey).toBe('accounts.health_reason_cooldown');
    expect(item.health.reasonTone).toBe('warning');
    expect(item.health.cooldown).toBe(quotaCooldown);
  });

  it('classifies quota and account fallback states', () => {
    const weeklyExhaustedItem = buildAccountListItem(
      makeRow({
        quota: {
          status: 'exhausted',
          remainingPercent: 0,
          usedPercent: 100,
          resetLabel: '-',
          planType: null,
          source: 'cache',
        },
      }),
      {
        quotaWindows: [
          {
            key: 'weekly',
            label: 'Weekly quota',
            remainingPercent: 0,
            usedPercent: 100,
            resetLabel: '-',
          },
        ],
      }
    );
    expect(weeklyExhaustedItem.health.status).toBe('weekly_exhausted');
    expect(weeklyExhaustedItem.health.reasonKey).toBe('accounts.health_reason_weekly_exhausted');
    expect(weeklyExhaustedItem.health.reasonTone).toBe('warning');

    const explicitMonthlyItem = buildAccountListItem(
      makeRow({
        quota: {
          status: 'exhausted',
          remainingPercent: 0,
          usedPercent: 100,
          resetLabel: '-',
          planType: null,
          source: 'cache',
        },
      }),
      {
        quotaWindows: [
          {
            key: 'opaque-window',
            label: 'Allowance',
            kind: 'monthly',
            remainingPercent: 0,
            usedPercent: 100,
            resetLabel: 'month-end',
          },
        ],
      }
    );
    expect(explicitMonthlyItem.health.status).toBe('monthly_exhausted');

    const dailyExhaustedItem = buildAccountListItem(
      makeRow({
        quota: {
          status: 'exhausted',
          remainingPercent: 0,
          usedPercent: 100,
          resetLabel: '-',
          planType: null,
          source: 'cache',
        },
      }),
      {
        quotaWindows: [
          {
            key: 'daily',
            label: 'Daily limit',
            kind: 'daily',
            remainingPercent: 0,
            usedPercent: 100,
            resetLabel: 'tomorrow',
          },
        ],
      }
    );
    expect(dailyExhaustedItem.health.status).toBe('limited');

    const xaiPaygAvailableItem = buildAccountListItem(
      makeRow({
        provider: 'xai',
        quota: {
          status: 'low',
          remainingPercent: 16.667,
          usedPercent: 83.333,
          resetLabel: 'month-end',
          planType: null,
          source: 'cache',
        },
      }),
      {
        quotaWindows: [
          {
            key: 'billing',
            label: 'Monthly credits',
            kind: 'billing',
            remainingPercent: 0,
            usedPercent: 100,
            resetLabel: 'month-end',
          },
          {
            key: 'pay-as-you-go',
            label: 'Pay-as-you-go',
            kind: 'payg',
            remainingPercent: 50,
            usedPercent: 50,
            resetLabel: 'month-end',
          },
        ],
      }
    );
    expect(xaiPaygAvailableItem.health.status).toBe('available');

    const lowQuotaItem = buildAccountListItem(
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
    );
    expect(lowQuotaItem.health.status).toBe('available');
    expect(lowQuotaItem.health.reasonKey).toBe('accounts.health_reason_available');
    expect(lowQuotaItem.health.reasonTone).toBe('muted');

    const exceptionItem = buildAccountListItem(makeRow({ statusMessage: 'custom problem' }));
    expect(exceptionItem.health.status).toBe('exception');
    expect(exceptionItem.health.reasonKey).toBe('accounts.health_reason_exception_request');
    expect(exceptionItem.health.reasonParams).toEqual({ detail: 'custom problem' });
    expect(exceptionItem.health.reasonTone).toBe('danger');

    const disabledItem = buildAccountListItem(
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
    );
    expect(disabledItem.health.status).toBe('disabled');
    expect(disabledItem.health.reasonKey).toBe('accounts.health_reason_disabled');
    expect(disabledItem.health.reasonTone).toBe('muted');

    expect(buildAccountListItem(makeRow()).health.status).toBe('available');
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
    ).toBe('limited');
    const rawItem = buildAccountListItem(
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
    );
    expect(rawItem.health.status).toBe('raw');
    expect(rawItem.health.reasonKey).toBe('accounts.health_reason_raw');
    expect(rawItem.health.reasonTone).toBe('muted');
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
    expect(item.activity.successCount).toBe(3);
    expect(item.activity.failureCount).toBe(1);
    expect(item.activity.successRate).toBe(75);
    expect(item.activity.hasHealthData).toBe(true);
    expect(item.activity.estimatedValue).toBeCloseTo(0.072);
  });

  it('uses monitoring activity when provided for list summaries', () => {
    const item = buildAccountListItem(
      makeRow({
        usage: {
          success: 1,
          failure: 0,
          successRate: 100,
          recentRequests: [],
        },
      }),
      {
        activity: {
          requests: 31,
          successRate: 96.8,
          inputTokens: 1200,
          outputTokens: 300,
          estimatedCost: 0.42,
          lastSeenMs: 1700000000000,
          source: 'monitoring',
        },
      }
    );

    expect(item.activity.recentTotal).toBe(31);
    expect(item.activity.successCount).toBe(30);
    expect(item.activity.failureCount).toBe(1);
    expect(item.activity.successRate).toBe(96.8);
    expect(item.activity.totalTokens).toBe(1500);
    expect(item.activity.estimatedValue).toBe(0.42);
    expect(item.activity.source).toBe('monitoring');
    expect(item.activity.hasHealthData).toBe(true);
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
