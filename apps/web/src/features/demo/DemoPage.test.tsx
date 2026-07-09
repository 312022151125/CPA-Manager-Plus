import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRoutes } from '@/app/appRoutes';
import {
  getDemoAccountHistory,
  getDemoAuthFiles,
  getDemoCodexInspectionRun,
  getDemoDashboardSummary,
  getDemoErrorLogsResponse,
  getDemoLatestVersion,
  getDemoManagerLatestRelease,
  getDemoManagerConfig,
  getDemoHeaderSnapshots,
  getDemoMonitoringAnalytics,
  getDemoPluginStore,
  getDemoQuotaCooldowns,
  getDemoQuotaStoreState,
  getDemoRawConfig,
} from './demoFixtures';
import {
  DEMO_ROUTE_BASE,
  getDemoServerBuildDate,
  ensureRouteBasePathname,
  getDemoLogoutHash,
  getDemoLogoutPath,
  isDemoMode,
  prefixRouteBase,
  setDemoMode,
  stripRouteBase,
} from './demoMode';

describe('DemoPage', () => {
  afterEach(() => {
    setDemoMode(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps demo routes under the demo prefix while matching real routes internally', () => {
    expect(stripRouteBase('/demo', DEMO_ROUTE_BASE)).toBe('/');
    expect(stripRouteBase('/demo/config', DEMO_ROUTE_BASE)).toBe('/config');
    expect(stripRouteBase('/demo/monitoring?tab=events', DEMO_ROUTE_BASE)).toBe(
      '/monitoring?tab=events'
    );

    expect(prefixRouteBase('/', DEMO_ROUTE_BASE)).toBe('/demo');
    expect(prefixRouteBase('/config', DEMO_ROUTE_BASE)).toBe('/demo/config');
    expect(prefixRouteBase('/monitoring/account-actions', DEMO_ROUTE_BASE)).toBe(
      '/demo/monitoring/account-actions'
    );

    expect(ensureRouteBasePathname('/', DEMO_ROUTE_BASE)).toBe('/demo');
    expect(ensureRouteBasePathname('/config', DEMO_ROUTE_BASE)).toBe('/demo/config');
    expect(ensureRouteBasePathname('/demo/config', DEMO_ROUTE_BASE)).toBe('/demo/config');
  });

  it('keeps demo site routing isolated from the real login panel', () => {
    const demoChildren = createAppRoutes()[0]?.children ?? [];
    const demoPaths = demoChildren.map((route) => route.path ?? '(index)');

    expect(demoPaths).toEqual(['(index)', '/demo/*', '*']);
    expect(demoPaths).not.toContain('/login');
    expect(demoPaths).not.toContain('/*');
  });

  it('keeps demo logout inside the demo site', () => {
    expect(getDemoLogoutPath()).toBe('/demo');
    expect(getDemoLogoutPath(DEMO_ROUTE_BASE)).toBe('/demo');
    expect(getDemoLogoutHash()).toBe('#/demo');
    expect(getDemoLogoutHash(DEMO_ROUTE_BASE)).toBe('#/demo');
    expect(getDemoLogoutHash('/demo/')).toBe('#/demo');
    expect(getDemoLogoutHash()).not.toBe('#/login');
  });

  it('recognizes deep demo hash routes before demo stores are mounted', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '#/demo/plugins',
        pathname: '/',
      },
    });

    expect(isDemoMode()).toBe(true);
  });

  it('keeps normal hash routes out of demo mode', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '#/dashboard',
        pathname: '/',
      },
    });

    expect(isDemoMode()).toBe(false);
  });

  it('does not infer demo mode from the deployment pathname without a demo hash route', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '',
        pathname: '/demo/management.html',
      },
    });

    expect(isDemoMode()).toBe(false);
  });

  it('keeps demo mock data free of historical analysis labels', () => {
    const visibleData = JSON.stringify([
      getDemoRawConfig(),
      getDemoAuthFiles(),
      getDemoPluginStore(),
      getDemoManagerConfig(),
      getDemoDashboardSummary(),
      getDemoMonitoringAnalytics(),
    ]);
    const historicalAnalysisLabel = ['cc', 'switch'].join('-');

    expect(visibleData.toLowerCase()).not.toContain(historicalAnalysisLabel);
  });

  it('fills accounts with realistic OAuth login data across statuses and quota providers', () => {
    const authFiles = getDemoAuthFiles();
    const fileNames = new Set(authFiles.files.map((file) => file.name));
    const providers = new Set(authFiles.files.map((file) => String(file.provider ?? file.type)));
    const providerCounts = authFiles.files.reduce<Record<string, number>>((result, file) => {
      const provider = String(file.provider ?? file.type);
      result[provider] = (result[provider] ?? 0) + 1;
      return result;
    }, {});
    const quota = getDemoQuotaStoreState();
    const analytics = getDemoMonitoringAnalytics();
    const historyTargetString = (value: unknown) => {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      return undefined;
    };
    const accountHistory = getDemoAccountHistory({
      accounts: authFiles.files.map((file) => ({
        account_snapshot:
          historyTargetString(file.account_snapshot) ??
          historyTargetString(file.account) ??
          historyTargetString(file.email),
        auth_label_snapshot: historyTargetString(file.label) ?? historyTargetString(file.note),
        source: file.name,
        auth_index: historyTargetString(file.authIndex),
      })),
    });
    const oauthProviders = ['antigravity', 'claude', 'codex', 'kimi', 'xai'];
    const nonOauthFiles = [
      'gemini-prod-01.json',
      'vertex-regional-01.json',
      'openai-support-02.json',
      'gemini-batch-02.json',
      'deepseek-ops-01.json',
    ];
    const visibleAccountText = authFiles.files
      .map((file) =>
        [file.name, file.account, file.email, file.label, file.note, file.account_snapshot].join(
          ' '
        )
      )
      .join('\n');
    const cooldownKeys = new Set(
      getDemoQuotaCooldowns().map((item) => `${item.authFileName}:${item.authIndex ?? '-'}`)
    );
    const headerFiles = new Set(
      getDemoHeaderSnapshots()
        .items.map((item) => item.auth_file_snapshot)
        .filter(Boolean)
    );
    const inspectionFiles = new Set(
      getDemoCodexInspectionRun().results.map((item) => item.fileName)
    );
    const analyticsProviders = new Set(
      [
        ...(analytics.account_stats ?? []).map((item) => item.auth_provider_snapshot),
        ...(analytics.credential_stats ?? []).map((item) => item.auth_provider_snapshot),
        ...(analytics.events?.items ?? []).map((item) => item.auth_provider_snapshot),
      ].filter((provider): provider is string => Boolean(provider))
    );

    expect(authFiles.total).toBe(authFiles.files.length);
    expect(authFiles.files.length).toBe(17);
    expect(visibleAccountText).not.toMatch(/\bui[-.]/i);
    expect(
      authFiles.files.every((file) =>
        Boolean(file.account || file.email || file.label || file.note)
      )
    ).toBe(true);
    expect(
      authFiles.files.every((file) =>
        (file.recent_requests ?? []).some((bucket) => bucket.success + bucket.failed > 0)
      )
    ).toBe(true);
    expect(Array.from(providers).sort()).toEqual(oauthProviders);
    oauthProviders.forEach((provider) => {
      expect(providerCounts[provider]).toBeGreaterThanOrEqual(3);
    });
    expect(Array.from(analyticsProviders).sort()).toEqual(oauthProviders);
    expect([...(analytics.filter_options?.providers ?? [])].sort()).toEqual(oauthProviders);
    expect(accountHistory.checkpoint.pending).toBe(false);
    expect(accountHistory.items).toHaveLength(authFiles.files.length);
    expect(accountHistory.items.every((item) => item.matched)).toBe(true);
    expect(
      accountHistory.items.every(
        (item) =>
          item.total_requests > 0 &&
          item.total_tokens > 0 &&
          item.total_cost > 0 &&
          item.success_rate !== null &&
          item.sync_status === 'ready'
      )
    ).toBe(true);
    expect(accountHistory.items.find((item) => item.account_key === 'Platform Team')).toMatchObject(
      {
        total_requests: 5200,
        total_tokens: 4_220_000,
        total_cost: 88.1,
      }
    );
    expect(Array.from(fileNames).sort()).toEqual(
      [
        'antigravity-daily-exhausted.json',
        'antigravity-builder.json',
        'antigravity-free-weekly.json',
        'antigravity-monthly-low.json',
        'antigravity-pro-matrix.json',
        'claude-extra-usage-03.json',
        'claude-research-02.json',
        'claude-team-01.json',
        'codex-expired-oauth-03.json',
        'codex-fallback-02.json',
        'codex-team-01.json',
        'kimi-coding.json',
        'kimi-exhausted.json',
        'kimi-healthy.json',
        'xai-ops.json',
        'xai-payg-buffer.json',
        'xai-payg-cap.json',
      ].sort()
    );
    nonOauthFiles.forEach((fileName) => expect(fileNames).not.toContain(fileName));

    expect(Object.keys(quota.codexQuota)).toEqual(
      expect.arrayContaining([
        'codex-team-01.json',
        'codex-fallback-02.json',
        'codex-expired-oauth-03.json',
      ])
    );
    expect(quota.codexQuota['codex-expired-oauth-03.json']?.status).toBe('error');
    expect(quota.codexQuota['codex-expired-oauth-03.json']?.errorStatus).toBe(401);
    expect(quota.claudeQuota['claude-research-02.json']?.windows).toHaveLength(3);
    expect(quota.claudeQuota['claude-extra-usage-03.json']?.extraUsage?.is_enabled).toBe(true);
    expect(quota.antigravityQuota['antigravity-builder.json']?.groups).toHaveLength(2);
    expect(quota.antigravityQuota['antigravity-builder.json']?.groups[0]?.buckets).toHaveLength(2);
    expect(
      quota.antigravityQuota['antigravity-daily-exhausted.json']?.groups[0]?.buckets[0]
        ?.remainingFraction
    ).toBe(0);
    expect(
      quota.antigravityQuota['antigravity-monthly-low.json']?.groups[1]?.buckets[1]
        ?.remainingFraction
    ).toBe(0.08);
    expect(quota.antigravityQuota['antigravity-free-weekly.json']?.subscription?.plan).toBe('free');
    expect(quota.antigravityQuota['antigravity-free-weekly.json']?.groups).toHaveLength(2);
    expect(
      quota.antigravityQuota['antigravity-free-weekly.json']?.groups.every(
        (group) => group.buckets.length === 1 && group.buckets[0]?.window === 'weekly'
      )
    ).toBe(true);
    expect(
      quota.antigravityQuota['antigravity-pro-matrix.json']?.groups[1]?.buckets[0]
    ).toMatchObject({
      window: '5h',
      remainingFraction: 0.11,
    });
    expect(quota.kimiQuota['kimi-coding.json']?.rows[0]?.used).toBe(214);
    expect(quota.kimiQuota['kimi-healthy.json']?.rows[0]?.used).toBe(320);
    expect(quota.kimiQuota['kimi-exhausted.json']?.rows[1]?.used).toBe(200);
    expect(quota.xaiQuota['xai-ops.json']?.billing?.periodType).toBe('weekly');
    expect(quota.xaiQuota['xai-ops.json']?.billing?.usagePercent).toBe(42);
    expect(quota.xaiQuota['xai-ops.json']?.billing?.usedPercent).toBe(86);
    expect(quota.xaiQuota['xai-payg-buffer.json']?.billing?.usedPercent).toBe(100);
    expect(quota.xaiQuota['xai-payg-buffer.json']?.billing?.onDemandUsedPercent).toBe(26);
    expect(quota.xaiQuota['xai-payg-cap.json']?.billing?.onDemandUsedPercent).toBe(100);

    expect(Array.from(cooldownKeys)).toEqual(
      expect.arrayContaining(['codex-fallback-02.json:codex-fallback-02'])
    );
    expect(headerFiles).toContain('codex-fallback-02.json');
    expect(Array.from(inspectionFiles)).toEqual(
      expect.arrayContaining(['codex-fallback-02.json', 'codex-expired-oauth-03.json'])
    );
  });

  it('fills the dashboard request health timeline with real dashboard granularity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-29T10:00:00+08:00'));

    const timeline = getDemoDashboardSummary().today_request_health_timeline;

    expect(timeline).toBeDefined();
    if (!timeline) throw new Error('missing demo request health timeline');

    expect(timeline.bucket_ms).toBe(10 * 60 * 1000);
    expect(timeline.points).toHaveLength(144);
    const tones = new Set(timeline.points.map((point) => point.tone));
    expect(tones.has('empty')).toBe(true);
    expect(tones.has('good')).toBe(true);
    expect(tones.has('warn')).toBe(true);
    expect(tones.has('bad')).toBe(true);
    expect(tones.has('future')).toBe(true);
  });

  it('fills usage analytics and request monitoring tabs with complete demo pages', () => {
    const demoAuthCount = getDemoAuthFiles().files.length;
    const firstPage = getDemoMonitoringAnalytics({
      from_ms: 0,
      to_ms: Date.now(),
      include: {
        events_page: { limit: 10 },
        drilldown_preview: { from_ms: 0, to_ms: Date.now(), limit: 8 },
      },
    });

    expect(firstPage.model_stats?.length).toBeGreaterThanOrEqual(8);
    expect(firstPage.account_stats?.length).toBe(demoAuthCount);
    expect(firstPage.api_key_stats?.length).toBe(demoAuthCount);
    expect(firstPage.credential_stats?.length).toBe(demoAuthCount);
    expect(firstPage.credential_timeline?.length).toBe(Math.min(demoAuthCount, 10) * 7);
    expect(firstPage.heatmap).toHaveLength(168);
    expect(firstPage.heatmap?.some((point) => point.calls > 0)).toBe(true);
    expect(firstPage.events?.items).toHaveLength(10);
    expect(firstPage.events?.has_more).toBe(true);
    expect(
      new Set(firstPage.events?.items.map((event) => event.api_key_hash)).size
    ).toBeGreaterThanOrEqual(8);

    const secondPage = getDemoMonitoringAnalytics({
      from_ms: 0,
      to_ms: Date.now(),
      include: {
        events_page: { limit: 10, before_ms: firstPage.events?.next_before_ms },
      },
    });
    const firstHashes = new Set(firstPage.events?.items.map((event) => event.event_hash));

    expect(secondPage.events?.items).toHaveLength(10);
    expect(secondPage.events?.items.every((event) => !firstHashes.has(event.event_hash))).toBe(
      true
    );
  });

  it('keeps visible demo dates relative to the current day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-29T10:00:00+08:00'));

    expect(getDemoServerBuildDate()).toBe('2026-06-29');
    expect(getDemoLatestVersion().buildDate).toBe('2026-06-29');
    expect(getDemoErrorLogsResponse().files.map((file) => file.name)).toEqual([
      'request-errors-2026-06-29.jsonl',
      'request-errors-2026-06-28.jsonl',
    ]);
    expect(new Date(getDemoManagerLatestRelease().published_at).getTime()).toBe(
      new Date(2026, 5, 29).getTime()
    );

    vi.setSystemTime(new Date('2026-06-30T10:00:00+08:00'));

    expect(getDemoServerBuildDate()).toBe('2026-06-30');
    expect(getDemoLatestVersion().buildDate).toBe('2026-06-30');
    expect(getDemoErrorLogsResponse().files.map((file) => file.name)).toEqual([
      'request-errors-2026-06-30.jsonl',
      'request-errors-2026-06-29.jsonl',
    ]);
    expect(new Date(getDemoManagerLatestRelease().published_at).getTime()).toBe(
      new Date(2026, 5, 30).getTime()
    );
  });
});
