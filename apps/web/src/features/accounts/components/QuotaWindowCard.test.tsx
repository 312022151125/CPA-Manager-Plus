import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type {
  AccountDetailQuotaWindow,
  AccountDetailWindowUsageSummary,
} from '@/features/accounts/model/accountDetailViewModel';
import { QuotaWindowCard } from './QuotaWindowCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en-US' },
    }),
  };
});

const readText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readText).join('');
  if (value && typeof value === 'object' && 'children' in value) {
    return readText((value as { children?: unknown }).children);
  }
  return '';
};

const usage = (
  overrides: Partial<AccountDetailWindowUsageSummary> = {}
): AccountDetailWindowUsageSummary => ({
  fromMs: 1_000,
  toMs: 2_000,
  matched: true,
  totalRequests: 100,
  successCalls: 99,
  failureCalls: 1,
  totalTokens: 1_000_000,
  totalCost: 100,
  successRate: 99,
  lastSeenMs: 2_000,
  syncStatus: 'ready',
  scopeMatchStatus: 'complete',
  unmatchedRequests: 0,
  ...overrides,
});

const makeWindow = (overrides: Partial<AccountDetailQuotaWindow> = {}): AccountDetailQuotaWindow =>
  ({
    key: 'five-hour',
    label: '5H',
    kind: 'five_hour',
    remainingPercent: 40,
    usedPercent: 60,
    resetLabel: '-',
    resetAtMs: 20_000,
    resetAccuracy: 'estimated',
    limitWindowSeconds: 18_000,
    fromMs: 1_000,
    toMs: 2_000,
    source: 'codex',
    observationSource: 'response_header',
    observedAtMs: 2_000,
    windowMode: 'fixed',
    cycleStartMs: 1_000,
    cycleEndMs: 20_000,
    modelScope: { kind: 'all', complete: true },
    boundaryAccuracy: 'derived',
    stale: false,
    usage: usage(),
    currentUsage: usage(),
    previousUsage: usage({ fromMs: -17_999_000, toMs: 1_000, successRate: 98 }),
    previousPeriod: 'previous',
    forecast: { requests: 200, tokens: 2_000_000, cost: 200, basis: 'current' },
    ...overrides,
  }) as AccountDetailQuotaWindow;

const renderCard = (
  window: AccountDetailQuotaWindow,
  mode?: 'standard' | 'model' | 'other'
): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<QuotaWindowCard window={window} mode={mode} locale="en-US" />);
  });
  return renderer;
};

describe('QuotaWindowCard', () => {
  it('renders the standard quota as previous, current, and forecast columns', () => {
    const renderer = renderCard(makeWindow());
    expect(renderer.root.findByProps({ 'data-quota-standard-comparison': 'true' })).toBeTruthy();
    const columns = renderer.root.findByProps({ 'data-quota-standard-comparison': 'true' });
    const forecast = columns.findAll((node) =>
      node.props.className?.includes('compareColumnPrediction')
    )[0];
    if (!forecast) throw new Error('forecast column not found');
    const forecastText = readText(forecast);
    expect(forecastText).toContain('accounts.detail_forecast_requests');
    expect(forecastText).toContain('accounts.detail_forecast_tokens');
    expect(forecastText).toContain('accounts.detail_forecast_cost');
    expect(forecastText).not.toContain('accounts.detail_success_rate');
    expect(
      forecast.findByProps({ 'data-quota-forecast-success-rate': 'unavailable' })
    ).toBeTruthy();
    expect(renderer.root.findAllByProps({ 'data-quota-progress': 'shared' })).toHaveLength(1);

    const previous = renderer.root.findByProps({ 'data-quota-usage-period': 'previous' });
    const previousText = readText(previous);
    expect(previousText).toContain('accounts.detail_success_rate');
    expect(previousText).not.toContain('accounts.detail_used');
  });

  it('labels rolling comparisons separately and exposes stale boundary evidence', () => {
    const renderer = renderCard(
      makeWindow({
        label: 'Last 24 hours',
        windowMode: 'rolling',
        previousPeriod: 'previous_equal_range',
        forecast: null,
        boundaryAccuracy: 'estimated',
        stale: true,
      })
    );
    const text = readText(renderer.root);
    expect(text).toContain('Last 24 hours');
    expect(text).toContain('accounts.detail_previous_equal_range');
    expect(text).toContain('accounts.detail_rolling_estimated_recovery');
    expect(text).toContain('accounts.quota_boundary_estimated');
    expect(text).toContain('accounts.detail_quota_snapshot_stale');
    expect(renderer.root.findAllByProps({ 'data-quota-usage-forecast': 'true' })).toHaveLength(0);
  });

  it('does not render interval usage for non-window quota', () => {
    const renderer = renderCard(
      makeWindow({
        windowMode: 'non_window',
        usage: null,
        currentUsage: null,
        previousUsage: null,
        previousPeriod: null,
        forecast: null,
      })
    );
    const text = readText(renderer.root);
    expect(text).toContain('accounts.detail_used');
    expect(text).not.toContain('accounts.detail_window_stats_empty');
    expect(text).not.toContain('accounts.detail_window_requests');
    expect(text).not.toContain('accounts.detail_current_window');
  });

  it('renders model quota cards with a provider-window warning', () => {
    const renderer = renderCard(
      makeWindow({
        modelScope: { kind: 'models', models: ['demo-model'], complete: true },
        usage: null,
        currentUsage: null,
        previousUsage: null,
        forecast: null,
      }),
      'model'
    );

    expect(renderer.root.findAllByProps({ 'data-quota-card-mode': 'model' })).toHaveLength(1);
    const warning = renderer.root.findByProps({ 'data-quota-model-warning': 'true' });
    expect(warning).toBeTruthy();
    expect(warning.props.role).toBe('alert');
    expect(renderer.root.findByProps({ 'data-quota-window-icon': 'model' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ 'data-quota-progress': 'shared' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-quota-standard-comparison': 'true' })).toHaveLength(
      0
    );
    expect(readText(renderer.root)).toContain('accounts.detail_model_window_stats_unavailable');
  });

  it('merges missing model scope into the single alert while keeping stale evidence separate', () => {
    const renderer = renderCard(
      makeWindow({
        stale: true,
        modelScope: { kind: 'models', models: [], complete: false },
        usage: null,
        currentUsage: null,
        previousUsage: null,
        forecast: null,
      }),
      'model'
    );

    const warning = renderer.root.findByProps({ 'data-quota-model-warning': 'true' });
    const sourceWarnings = renderer.root.findByProps({ 'data-quota-source-warnings': 'true' });
    expect(warning.props.role).toBe('alert');
    expect(readText(warning)).toContain('accounts.detail_scope_unknown');
    expect(readText(sourceWarnings)).toContain('accounts.detail_quota_snapshot_stale');
    expect(readText(sourceWarnings)).not.toContain('accounts.detail_scope_unknown');
    expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(1);
  });

  it('explains unknown window boundaries without rendering interval usage', () => {
    const renderer = renderCard(
      makeWindow({
        windowMode: 'unknown',
        usage: null,
        currentUsage: null,
        previousUsage: null,
        previousPeriod: null,
        forecast: null,
      })
    );
    const text = readText(renderer.root);
    expect(text).toContain('accounts.detail_window_boundary_incomplete');
    expect(text).not.toContain('accounts.detail_window_stats_empty');
    expect(text).not.toContain('accounts.detail_window_requests');
    expect(text).not.toContain('accounts.detail_current_window');
  });

  it('explains when provider model scope is not queryable', () => {
    const renderer = renderCard(
      makeWindow({
        modelScope: { kind: 'models', models: [], complete: false },
        usage: null,
        currentUsage: null,
        previousUsage: null,
        forecast: null,
      })
    );
    expect(readText(renderer.root)).toContain('accounts.detail_scope_unknown');
  });

  it('renders a header icon keyed by window kind', () => {
    const fiveHour = renderCard(makeWindow({ kind: 'five_hour' }));
    expect(fiveHour.root.findByProps({ 'data-quota-window-icon': 'five_hour' })).toBeTruthy();

    const weekly = renderCard(makeWindow({ kind: 'weekly' }));
    expect(weekly.root.findByProps({ 'data-quota-window-icon': 'weekly' })).toBeTruthy();
  });

  it('keeps comparison details and source metadata visible by default', () => {
    const renderer = renderCard(makeWindow());
    expect(renderer.root.findByProps({ 'data-quota-standard-comparison': 'true' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ 'data-quota-extra-toggle': 'true' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ 'data-quota-source-warnings': 'true' })).toHaveLength(0);
    expect(readText(renderer.root)).toContain('accounts.detail_quota_provider_sync_time');
  });

  it('hides interval usage and folds amount-only windows into the compact shape', () => {
    const renderer = renderCard(
      makeWindow({
        kind: 'billing',
        windowMode: 'non_window',
        amountLabel: '剩余 $140.00 / $1000.00',
        usage: null,
        currentUsage: null,
        previousUsage: null,
        previousPeriod: null,
        forecast: null,
      })
    );
    const text = readText(renderer.root);
    expect(text).toContain('剩余 $140.00 / $1000.00');
    expect(renderer.root.findAllByProps({ 'data-quota-usage-period': 'current' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ 'data-quota-extra-toggle': 'true' })).toHaveLength(0);
    expect(renderer.root.findByProps({ 'data-quota-window-icon': 'billing' })).toBeTruthy();
  });

  it('groups source-meta warnings into a dedicated region', () => {
    const renderer = renderCard(
      makeWindow({
        stale: true,
        modelScope: { kind: 'models', models: [], complete: false },
      })
    );
    const warnings = renderer.root.findByProps({ 'data-quota-source-warnings': 'true' });
    const text = readText(warnings);
    expect(text).toContain('accounts.detail_quota_snapshot_stale');
    expect(text).toContain('accounts.detail_scope_unknown');
  });
});
