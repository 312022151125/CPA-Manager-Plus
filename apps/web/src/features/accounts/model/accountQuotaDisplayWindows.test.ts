import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { AuthFileItem, CodexQuotaState } from '@/types';
import { buildAccountRows, type AccountQuotaStores } from './accountRows';
import {
  buildAccountQuotaDisplayWindows,
  getQuotaWindowShortLabel,
  type TranslateQuotaWindowLabel,
} from './accountQuotaDisplayWindows';

const emptyStores = (): AccountQuotaStores => ({
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  kimiQuota: {},
  xaiQuota: {},
});

const t = ((key: string, options?: Record<string, string | number>) => {
  const translations: Record<string, string> = {
    'antigravity_quota.group_gemini_models': 'Gemini models',
    'antigravity_quota.daily_limit': 'Daily limit',
    'claude_quota.extra_usage_label': 'Extra Usage',
    'kimi_quota.reset_hint': `resets in ${options?.hint ?? ''}`,
    'kimi_quota.weekly_limit': 'Weekly limit',
    'xai_quota.weekly_credits': 'Weekly credits',
    'xai_quota.monthly_credits': 'Monthly credits',
    'xai_quota.pay_as_you_go_label': 'Pay-as-you-go',
    'xai_quota.usage_amount': `${options?.remaining ?? '--'} / ${options?.limit ?? '--'} remaining`,
    'accounts.col_quota': 'Quota',
  };
  return translations[key] ?? key;
}) as TFunction;

const translateQuotaWindowLabel: TranslateQuotaWindowLabel = (label, labelKey, labelParams) =>
  labelKey ? t(labelKey, labelParams) : (label ?? 'Quota');

const buildRow = (file: AuthFileItem, stores: AccountQuotaStores = emptyStores()) =>
  buildAccountRows([file], stores)[0];

describe('accountQuotaDisplayWindows', () => {
  it('uses auth-index scoped Codex quota and preserves request window ranges', () => {
    const quota: CodexQuotaState = {
      status: 'success',
      windows: [
        {
          id: 'primary',
          label: 'Primary',
          usedPercent: 75,
          resetLabel: '2026-07-09T14:00:00Z',
          limitWindowSeconds: 18_000,
        },
      ],
    };
    const row = buildRow({ name: 'shared.codex.json', type: 'codex', authIndex: '1' });

    const windows = buildAccountQuotaDisplayWindows(row, {
      stores: emptyStores(),
      getDisplayCodexQuota: () => quota,
      translateQuotaWindowLabel,
      t,
      nowMs: Date.parse('2026-07-09T12:00:00Z'),
    });

    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({
      key: 'primary',
      kind: 'five_hour',
      remainingPercent: 25,
      usedPercent: 75,
      limitWindowSeconds: 18_000,
      source: 'codex',
    });
    expect(windows[0].fromMs).toBe(Date.parse('2026-07-09T09:00:00Z'));
    expect(windows[0].toMs).toBe(Date.parse('2026-07-09T12:00:00Z'));
    expect(getQuotaWindowShortLabel(windows[0])).toBe('5H');
  });

  it('maps Claude quota windows through translated labels', () => {
    const stores = {
      ...emptyStores(),
      claudeQuota: {
        'claude.json': {
          status: 'success',
          windows: [
            {
              id: 'seven_day',
              label: 'Weekly',
              labelKey: 'kimi_quota.weekly_limit',
              usedPercent: 40,
              resetLabel: '07/10, 12:00',
            },
          ],
          extraUsage: {
            is_enabled: true,
            used_credits: 150,
            monthly_limit: 500,
            utilization: null,
          },
        },
      },
    } satisfies AccountQuotaStores;
    const row = buildRow({ name: 'claude.json', type: 'claude' }, stores);

    const windows = buildAccountQuotaDisplayWindows(row, {
      stores,
      translateQuotaWindowLabel,
      t,
    });

    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({
      key: 'seven_day',
      label: 'Weekly limit',
      kind: 'weekly',
      remainingPercent: 60,
      source: 'claude',
    });
    expect(windows[1]).toMatchObject({
      key: 'extra-usage',
      label: 'Extra Usage',
      kind: 'monthly',
      remainingPercent: 70,
      usedPercent: 30,
      amountLabel: '$1.50 / $5.00',
      source: 'claude',
    });
  });

  it('flattens Antigravity groups while retaining group and bucket metadata', () => {
    const stores = {
      ...emptyStores(),
      antigravityQuota: {
        'ag.json': {
          status: 'success',
          groups: [
            {
              id: 'gemini',
              label: 'Gemini models',
              description: 'models within this group: gemini-3-pro',
              buckets: [
                {
                  id: 'daily',
                  label: 'Daily limit',
                  window: 'daily',
                  remainingFraction: 0.42,
                  resetTime: '2026-07-10T00:00:00Z',
                  description: 'Daily model quota',
                },
                {
                  id: 'month-end-five-hour',
                  label: '5 Hour Limit',
                  window: '5h',
                  remainingFraction: 0.52,
                  resetTime: '2026-07-09T10:00:00Z',
                },
              ],
            },
          ],
        },
      },
    } satisfies AccountQuotaStores;
    const row = buildRow({ name: 'ag.json', type: 'antigravity' }, stores);

    const windows = buildAccountQuotaDisplayWindows(row, {
      stores,
      translateQuotaWindowLabel,
      t,
    });

    expect(windows[0]).toMatchObject({
      key: 'gemini:daily',
      label: 'Daily limit',
      kind: 'daily',
      remainingPercent: 42,
      usedPercent: 58,
      groupLabel: 'Gemini models',
      description: 'Daily model quota',
      source: 'antigravity',
    });
    expect(getQuotaWindowShortLabel(windows[0])).toBe('24H');
    expect(windows[1]).toMatchObject({
      key: 'gemini:month-end-five-hour',
      kind: 'five_hour',
      remainingPercent: 52,
      usedPercent: 48,
    });
    expect(getQuotaWindowShortLabel(windows[1])).toBe('5H');
  });

  it('adds Kimi usage amounts and formatted reset hints', () => {
    const stores = {
      ...emptyStores(),
      kimiQuota: {
        'kimi.json': {
          status: 'success',
          rows: [
            {
              id: 'weekly',
              labelKey: 'kimi_quota.weekly_limit',
              used: 3,
              limit: 10,
              resetHint: '2d',
            },
          ],
        },
      },
    } satisfies AccountQuotaStores;
    const row = buildRow({ name: 'kimi.json', type: 'kimi' }, stores);

    const windows = buildAccountQuotaDisplayWindows(row, {
      stores,
      translateQuotaWindowLabel,
      t,
    });

    expect(windows[0]).toMatchObject({
      key: 'weekly',
      label: 'Weekly limit',
      kind: 'weekly',
      remainingPercent: 70,
      usedPercent: 30,
      resetLabel: 'resets in 2d',
      amountLabel: '3 / 10',
      source: 'kimi',
    });
  });

  it('splits xAI billing into monthly and pay-as-you-go windows', () => {
    const stores = {
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
    } satisfies AccountQuotaStores;
    const row = buildRow({ name: 'xai.json', type: 'xai' }, stores);

    const windows = buildAccountQuotaDisplayWindows(row, {
      stores,
      translateQuotaWindowLabel,
      t,
    });

    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({
      key: 'billing',
      label: 'Monthly credits',
      kind: 'billing',
      remainingPercent: 0,
      amountLabel: '$0.00 / $100.00 remaining',
      source: 'xai',
    });
    expect(windows[1]).toMatchObject({
      key: 'pay-as-you-go',
      label: 'Pay-as-you-go',
      kind: 'payg',
      remainingPercent: 50,
      amountLabel: '$25.00 / $50.00 remaining',
      source: 'xai',
    });
    expect(getQuotaWindowShortLabel(windows[1])).toBe('PAYG');
  });

  it('shows xAI weekly credits as a separate quota window', () => {
    const stores = {
      ...emptyStores(),
      xaiQuota: {
        'xai.json': {
          status: 'success',
          billing: {
            periodType: 'weekly',
            usagePercent: 42,
            periodStart: '2026-07-01T00:00:00Z',
            periodEnd: '2026-07-08T00:00:00Z',
            productUsage: [{ product: 'Grok Code Fast', usagePercent: 37 }],
            monthlyLimitCents: 10_000,
            usedCents: 4_000,
            includedUsedCents: 4_000,
            onDemandCapCents: null,
            onDemandUsedCents: null,
            onDemandUsedPercent: null,
            usedPercent: 40,
          },
        },
      },
    } satisfies AccountQuotaStores;
    const row = buildRow({ name: 'xai.json', type: 'xai' }, stores);

    const windows = buildAccountQuotaDisplayWindows(row, {
      stores,
      translateQuotaWindowLabel,
      t,
    });

    expect(windows).toHaveLength(3);
    expect(windows[0]).toMatchObject({
      key: 'credits-period',
      label: 'Weekly credits',
      kind: 'weekly',
      remainingPercent: 58,
      usedPercent: 42,
      source: 'xai',
    });
    expect(windows[1]).toMatchObject({
      key: 'billing',
      label: 'Monthly credits',
      remainingPercent: 60,
      source: 'xai',
    });
    expect(windows[2]).toMatchObject({
      key: 'product-0-grok-code-fast',
      label: 'Grok Code Fast',
      kind: 'product',
      remainingPercent: 63,
      usedPercent: 37,
      source: 'xai',
    });
  });
});
