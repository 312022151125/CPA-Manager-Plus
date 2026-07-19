import React from 'react';
import type { TFunction } from 'i18next';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import type { AuthFileItem, ClaudeQuotaState, CodexQuotaState, XaiQuotaState } from '@/types';
import type { QuotaRenderHelpers } from './QuotaCard';
import {
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  getSortedCodexResetCreditExpiries,
  resolveQuotaDisplayState,
  XAI_CONFIG,
} from './quotaConfigs';

type TestQuotaState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  errorStatus?: number;
  fetchedAtMs?: number;
  observedAtMs?: number;
  observedFromUsageHeaders?: boolean;
  windows?: unknown[];
};

describe('getSortedCodexResetCreditExpiries', () => {
  it('filters expired or invalid reset credits and sorts by expiry time', () => {
    const expiries = getSortedCodexResetCreditExpiries(
      [
        {
          id: 'late',
          status: 'available',
          grantedAt: '2026-06-29T00:00:00Z',
          expiresAt: '2026-07-19T00:42:09Z',
        },
        {
          id: 'expired',
          status: 'available',
          grantedAt: '2026-06-29T00:00:00Z',
          expiresAt: '2026-07-17T08:31:33Z',
        },
        {
          id: 'invalid',
          status: 'available',
          grantedAt: '2026-06-29T00:00:00Z',
          expiresAt: 'not-a-date',
        },
        {
          id: 'early',
          status: 'available',
          grantedAt: '2026-06-29T00:00:00Z',
          expiresAt: '2026-07-18T08:31:33Z',
        },
      ],
      new Date('2026-07-18T00:00:00Z').getTime()
    );

    expect(expiries.map((item) => item.id)).toEqual(['early', 'late']);
    expect(expiries.map((item) => item.expiresAtMs)).toEqual([
      new Date('2026-07-18T08:31:33Z').getTime(),
      new Date('2026-07-19T00:42:09Z').getTime(),
    ]);
  });
});

describe('CLAUDE_CONFIG.renderQuotaItems', () => {
  it('renders scoped model quota windows with their dynamic labels', () => {
    const quota: ClaudeQuotaState = {
      status: 'success',
      windows: [
        {
          id: 'weekly-scoped-fable%205%20max',
          label: 'Fable 5 Max',
          usedPercent: 100,
          resetLabel: '07/08 21:00',
        },
      ],
    };
    const helpers: QuotaRenderHelpers = {
      styles: new Proxy(
        {},
        {
          get: (_target, property) => String(property),
        }
      ) as QuotaRenderHelpers['styles'],
      QuotaProgressBar: ({ percent }) =>
        React.createElement('div', { className: 'progress', 'data-percent': percent }),
    };
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(
          React.Fragment,
          null,
          CLAUDE_CONFIG.renderQuotaItems(quota, ((key: string) => key) as TFunction, helpers)
        )
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('Fable 5 Max');
    expect(output).toContain('0%');
    expect(output).toContain('07/08 21:00');
    expect(output).toContain('"data-percent":0');
  });
});

describe('XAI_CONFIG.renderQuotaItems', () => {
  it('renders partial billing diagnostics as a user-facing explanation', () => {
    const quota: XaiQuotaState = {
      status: 'success',
      billing: {
        periodType: 'monthly',
        usagePercent: null,
        productUsage: [],
        monthlyLimitCents: 10_000,
        usedCents: 2_500,
        includedUsedCents: 2_500,
        onDemandCapCents: null,
        onDemandUsedCents: null,
        onDemandUsedPercent: null,
        usedPercent: 25,
        partial: true,
        diagnostics: [
          {
            classification: 'protocol_changed',
            statusCode: 200,
            message: 'xAI billing response schema changed',
          },
        ],
      },
    };
    const helpers: QuotaRenderHelpers = {
      styles: new Proxy(
        {},
        {
          get: (_target, property) => String(property),
        }
      ) as QuotaRenderHelpers['styles'],
      QuotaProgressBar: ({ percent }) =>
        React.createElement('div', { className: 'progress', 'data-percent': percent }),
    };
    const t = ((key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'xai_quota.partial_data': 'Some billing data is unavailable. Reason: {{details}}',
        'xai_quota.diagnostic_protocol_changed':
          'The billing endpoint returned data that cannot currently be recognized',
      };
      let message = messages[key] ?? key;
      Object.entries(options ?? {}).forEach(([name, value]) => {
        message = message.replace(`{{${name}}}`, String(value));
      });
      return message;
    }) as TFunction;
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(React.Fragment, null, XAI_CONFIG.renderQuotaItems(quota, t, helpers))
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain(
      'The billing endpoint returned data that cannot currently be recognized'
    );
    expect(output).not.toContain('protocol_changed');
    expect(output).not.toContain('HTTP 200');
  });

  it('renders official API health without fake billing or pay-as-you-go rows', () => {
    const quota: XaiQuotaState = {
      status: 'success',
      billing: {
        periodType: 'unknown',
        usagePercent: null,
        productUsage: [],
        monthlyLimitCents: null,
        usedCents: null,
        includedUsedCents: null,
        onDemandCapCents: null,
        onDemandUsedCents: null,
        onDemandUsedPercent: null,
        usedPercent: null,
        officialApiHealth: {
          source: 'api.x.ai/v1/me',
          userId: 'user-1',
          teamId: 'team-1',
          teamBlocked: false,
        },
      },
    };
    const helpers: QuotaRenderHelpers = {
      styles: new Proxy(
        {},
        {
          get: (_target, property) => String(property),
        }
      ) as QuotaRenderHelpers['styles'],
      QuotaProgressBar: ({ percent }) =>
        React.createElement('div', { className: 'progress', 'data-percent': percent }),
    };
    const t = ((key: string) =>
      ({
        'xai_quota.plan_label': 'Plan',
        'xai_quota.official_api_plan': 'Official API',
        'xai_quota.official_api_health':
          'Official xAI API identity is reachable. Billing and remaining quota are unavailable for this OAuth credential.',
      })[key] ?? key) as TFunction;
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(React.Fragment, null, XAI_CONFIG.renderQuotaItems(quota, t, helpers))
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('Official API');
    expect(output).toContain('Official xAI API identity is reachable');
    expect(output).not.toContain('Pay-as-you-go');
    expect(output).not.toContain('Monthly credits');
    expect(output).not.toContain('data-percent');
  });
});

describe('resolveQuotaDisplayState', () => {
  it('keeps a newer manual quota refresh over an older header snapshot', () => {
    const activeQuota: TestQuotaState = {
      status: 'success',
      fetchedAtMs: 2_000,
      windows: [],
    };
    const observedQuota: TestQuotaState = {
      status: 'success',
      observedAtMs: 1_000,
      observedFromUsageHeaders: true,
      windows: [],
    };

    expect(resolveQuotaDisplayState(activeQuota, observedQuota)).toBe(activeQuota);
  });

  it('merges a newer header snapshot into the manual quota refresh', () => {
    const activeQuota: TestQuotaState = {
      status: 'success',
      fetchedAtMs: 1_000,
      windows: [
        {
          id: 'manual',
          label: 'Manual window',
          usedPercent: 10,
          resetLabel: '06/30 12:00',
        },
      ],
    };
    const observedQuota: TestQuotaState = {
      status: 'success',
      observedAtMs: 2_000,
      observedFromUsageHeaders: true,
      windows: [
        {
          id: 'observed',
          label: 'Observed window',
          usedPercent: 20,
          resetLabel: '07/01 12:00',
        },
      ],
    };

    const result = resolveQuotaDisplayState(activeQuota, observedQuota);

    expect(result).not.toBe(activeQuota);
    expect(result).not.toBe(observedQuota);
    expect(result).toMatchObject({
      status: 'success',
      fetchedAtMs: 1_000,
      observedAtMs: 2_000,
      windows: [
        { id: 'manual', usedPercent: 10 },
        { id: 'observed', usedPercent: 20 },
      ],
    });
  });

  it('keeps API-only Codex quota data when merging newer header snapshots', () => {
    const activeQuota: CodexQuotaState = {
      status: 'success',
      fetchedAtMs: 1_000,
      planType: 'plus',
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          labelKey: 'codex_quota.primary_window',
          usedPercent: 10,
          resetLabel: '06/30 12:00',
          limitWindowSeconds: 18_000,
        },
        {
          id: 'spark-five-hour-0',
          label: 'Spark 5-hour limit',
          labelKey: 'codex_quota.additional_primary_window',
          labelParams: { name: 'spark' },
          usedPercent: 30,
          resetLabel: '07/01 01:00',
          limitWindowSeconds: 18_000,
        },
      ],
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [
        {
          id: 'credit-1',
          status: 'available',
          grantedAt: '2026-06-29T00:00:00Z',
          expiresAt: '2026-07-19T00:42:09Z',
        },
      ],
      rateLimitResetCreditsError: null,
    };
    const observedQuota: CodexQuotaState = {
      status: 'success',
      observedFromUsageHeaders: true,
      observedResetCreditsUnknown: true,
      observedAtMs: 2_000,
      planType: 'free',
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          labelKey: 'codex_quota.primary_window',
          usedPercent: 80,
          resetLabel: '07/01 02:00',
          limitWindowSeconds: null,
        },
        {
          id: 'weekly',
          label: 'Weekly limit',
          labelKey: 'codex_quota.secondary_window',
          usedPercent: 40,
          resetLabel: '07/07 02:00',
          limitWindowSeconds: 604_800,
        },
      ],
    };

    const result = resolveQuotaDisplayState(activeQuota, observedQuota) as CodexQuotaState;

    expect(result.planType).toBe('free');
    expect(result.observedAtMs).toBe(2_000);
    expect(result.observedFromUsageHeaders).toBe(true);
    expect(result.observedResetCreditsUnknown).toBeUndefined();
    expect(result.rateLimitResetCreditsAvailableCount).toBe(2);
    expect(result.rateLimitResetCredits).toHaveLength(1);
    expect(result.windows.map((window) => window.id)).toEqual([
      'five-hour',
      'spark-five-hour-0',
      'weekly',
    ]);
    expect(result.windows[0]).toMatchObject({
      id: 'five-hour',
      usedPercent: 80,
      resetLabel: '07/01 02:00',
      limitWindowSeconds: 18_000,
    });
    expect(result.windows[1]).toMatchObject({
      id: 'spark-five-hour-0',
      usedPercent: 30,
      resetLabel: '07/01 01:00',
    });
  });

  it('keeps 401 quota errors so reauth controls stay visible', () => {
    const activeQuota: TestQuotaState = {
      status: 'error',
      errorStatus: 401,
    };
    const observedQuota: TestQuotaState = {
      status: 'success',
      observedAtMs: 2_000,
    };

    expect(resolveQuotaDisplayState(activeQuota, observedQuota)).toBe(activeQuota);
  });

  it('keeps manual refresh failures over older header snapshots', () => {
    const activeQuota: CodexQuotaState = {
      status: 'error',
      error: 'refresh failed',
      errorStatus: 502,
      failedAtMs: 2_000,
      planType: 'plus',
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          usedPercent: 10,
          resetLabel: '06/30 12:00',
          limitWindowSeconds: 18_000,
        },
      ],
      rateLimitResetCreditsAvailableCount: 2,
    };
    const observedQuota: CodexQuotaState = {
      status: 'success',
      observedFromUsageHeaders: true,
      observedAtMs: 1_000,
      planType: 'free',
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          usedPercent: 80,
          resetLabel: '07/01 02:00',
          limitWindowSeconds: null,
        },
      ],
    };

    expect(resolveQuotaDisplayState(activeQuota, observedQuota)).toBe(activeQuota);
  });

  it('recovers manual refresh failures with newer header snapshots without dropping API-only fields', () => {
    const activeQuota: CodexQuotaState = {
      status: 'error',
      error: 'refresh failed',
      errorStatus: 502,
      failedAtMs: 1_000,
      fetchedAtMs: 500,
      planType: 'plus',
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          labelKey: 'codex_quota.primary_window',
          usedPercent: 10,
          resetLabel: '06/30 12:00',
          limitWindowSeconds: 18_000,
        },
        {
          id: 'spark-five-hour-0',
          label: 'Spark 5-hour limit',
          labelKey: 'codex_quota.additional_primary_window',
          labelParams: { name: 'spark' },
          usedPercent: 30,
          resetLabel: '07/01 01:00',
          limitWindowSeconds: 18_000,
        },
      ],
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [
        {
          id: 'credit-1',
          status: 'available',
          grantedAt: '2026-06-29T00:00:00Z',
          expiresAt: '2026-07-19T00:42:09Z',
        },
      ],
      rateLimitResetCreditsError: null,
    };
    const observedQuota: CodexQuotaState = {
      status: 'success',
      observedFromUsageHeaders: true,
      observedResetCreditsUnknown: true,
      observedAtMs: 2_000,
      planType: 'free',
      windows: [
        {
          id: 'five-hour',
          label: '5-hour limit',
          labelKey: 'codex_quota.primary_window',
          usedPercent: 80,
          resetLabel: '07/01 02:00',
          limitWindowSeconds: null,
        },
      ],
    };

    const result = resolveQuotaDisplayState(activeQuota, observedQuota) as CodexQuotaState;

    expect(result.status).toBe('success');
    expect(result.error).toBeUndefined();
    expect(result.errorStatus).toBeUndefined();
    expect(result.failedAtMs).toBeUndefined();
    expect(result.observedFromUsageHeaders).toBe(true);
    expect(result.rateLimitResetCreditsAvailableCount).toBe(2);
    expect(result.rateLimitResetCredits).toHaveLength(1);
    expect(result.windows.map((window) => window.id)).toEqual(['five-hour', 'spark-five-hour-0']);
    expect(result.windows[0]).toMatchObject({
      id: 'five-hour',
      usedPercent: 80,
      resetLabel: '07/01 02:00',
      limitWindowSeconds: 18_000,
    });
    expect(result.windows[1]).toMatchObject({
      id: 'spark-five-hour-0',
      usedPercent: 30,
      resetLabel: '07/01 01:00',
    });
  });
});

const makeCodexRenderHelpers = (): QuotaRenderHelpers => ({
  styles: new Proxy(
    {},
    {
      get: (_target, property) => String(property),
    }
  ) as QuotaRenderHelpers['styles'],
  QuotaProgressBar: ({ percent }) =>
    React.createElement('div', { className: 'progress', 'data-percent': percent }),
});

describe('CODEX_CONFIG subscription expiry', () => {
  const identityT = ((key: string) => key) as TFunction;

  it('renders a valid subscription expiry label and value with the plan row', () => {
    const expiry = '2026-08-01T12:34:56.000Z';
    const quota: CodexQuotaState = {
      status: 'success',
      windows: [],
      planType: 'pro',
      subscriptionActiveUntil: expiry,
    };
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(
          React.Fragment,
          null,
          CODEX_CONFIG.renderQuotaItems(quota, identityT, makeCodexRenderHelpers())
        )
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('codex_quota.subscription_expiry_label');
    expect(output).toContain(
      new Date(expiry).toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    );
  });

  it('renders subscription expiry even when plan type is absent', () => {
    const expiry = '2026-09-15T08:00:00.000Z';
    const quota: CodexQuotaState = {
      status: 'success',
      windows: [],
      subscriptionActiveUntil: expiry,
    };
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(
          React.Fragment,
          null,
          CODEX_CONFIG.renderQuotaItems(quota, identityT, makeCodexRenderHelpers())
        )
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('codex_quota.subscription_expiry_label');
    expect(output).not.toContain('codex_quota.plan_label');
  });

  it('omits subscription expiry for missing or malformed values', () => {
    for (const subscriptionActiveUntil of [null, undefined, '', 'not-a-date'] as const) {
      const quota: CodexQuotaState = {
        status: 'success',
        windows: [],
        planType: 'pro',
        subscriptionActiveUntil: subscriptionActiveUntil as string | null | undefined,
      };
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = create(
          React.createElement(
            React.Fragment,
            null,
            CODEX_CONFIG.renderQuotaItems(quota, identityT, makeCodexRenderHelpers())
          )
        );
      });

      const output = JSON.stringify(renderer.toJSON());
      expect(output).not.toContain('codex_quota.subscription_expiry_label');
    }
  });

  it('stores null subscription expiry when a successful payload is missing or malformed', () => {
    const priorValid = CODEX_CONFIG.buildSuccessState({
      planType: 'pro',
      windows: [],
      subscriptionActiveUntil: '2026-08-01T12:34:56.000Z',
      rateLimitResetCreditsAvailableCount: null,
      rateLimitResetCredits: [],
      rateLimitResetCreditsError: null,
    });
    expect(priorValid.subscriptionActiveUntil).toBe('2026-08-01T12:34:56.000Z');

    // Successful replacement path: loader assigns this state wholesale, clearing any prior expiry.
    const malformed = CODEX_CONFIG.buildSuccessState({
      planType: 'pro',
      windows: [],
      subscriptionActiveUntil: 'not-a-date',
      rateLimitResetCreditsAvailableCount: null,
      rateLimitResetCredits: [],
      rateLimitResetCreditsError: null,
    });
    expect(malformed.subscriptionActiveUntil).toBeNull();

    const missing = CODEX_CONFIG.buildSuccessState({
      planType: 'pro',
      windows: [],
      subscriptionActiveUntil: null,
      rateLimitResetCreditsAvailableCount: null,
      rateLimitResetCredits: [],
      rateLimitResetCreditsError: null,
    });
    expect(missing.subscriptionActiveUntil).toBeNull();
  });

  it('preserves raw subscription expiry only when the parser accepts it', () => {
    const expiry = '2026-08-01T12:34:56.000Z';
    const success = CODEX_CONFIG.buildSuccessState({
      planType: 'plus',
      windows: [],
      subscriptionActiveUntil: expiry,
      rateLimitResetCreditsAvailableCount: null,
      rateLimitResetCredits: [],
      rateLimitResetCreditsError: null,
    });
    expect(success.subscriptionActiveUntil).toBe(expiry);
  });

  it('exposes getPlanExpiryAtMs from CODEX_CONFIG only for finite timestamps', () => {
    expect(CODEX_CONFIG.getPlanExpiryAtMs).toBeTypeOf('function');

    const file = { name: 'codex.json', type: 'codex' } as AuthFileItem;
    expect(
      CODEX_CONFIG.getPlanExpiryAtMs?.(file, {
        status: 'success',
        windows: [],
        subscriptionActiveUntil: '2026-08-01T12:34:56.000Z',
      })
    ).toBe(Date.parse('2026-08-01T12:34:56.000Z'));
    expect(
      CODEX_CONFIG.getPlanExpiryAtMs?.(file, {
        status: 'success',
        windows: [],
        subscriptionActiveUntil: 'bad',
      })
    ).toBeNull();
    expect(CODEX_CONFIG.getPlanExpiryAtMs?.(file, undefined)).toBeNull();
  });
});
