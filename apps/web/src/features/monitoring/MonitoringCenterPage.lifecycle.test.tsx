import { type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthFileItem } from '@/types';
import type { AccountQuotaState } from './components/accountOverviewPresentation';
import type { MonitoringAccountQuotaTarget } from './accountOverviewQuotaTargets';
import { createCodexInspectionConnectionFingerprint } from './codexInspection';
import {
  publishAccountCredentialMutationRevision,
  useAccountCredentialMutationRevisionStore,
} from '@/stores/useAccountCredentialMutationRevisionStore';
import { MonitoringCenterPage } from './MonitoringCenterPage';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  apiBase: 'http://cpa-a.local:8317',
  managementKey: 'manager-key-a',
  authFiles: [] as AuthFileItem[],
  nextAuthFiles: null as AuthFileItem[] | null,
  lastAccountOverviewProps: null as null | {
    accountQuotaStatesByRowId: Record<string, AccountQuotaState>;
    onLoadAccountQuota: (rowId: string, force: boolean) => void | Promise<void>;
  },
  loadHeaderSnapshots: vi.fn(async () => undefined),
  refreshMeta: vi.fn(),
  requestAccountQuota: vi.fn(),
}));

const makeCodexFile = (authIndex: string, name: string): AuthFileItem =>
  ({
    name,
    type: 'codex',
    provider: 'codex',
    authIndex,
    auth_index: authIndex,
    account: 'workspace@example.com',
    account_id: 'workspace-a',
    status: 'ready',
    disabled: false,
  }) as AuthFileItem;

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/monitoring', search: '', hash: '', state: null, key: 'test' }),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en' },
    }),
  };
});

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      apiBase: mocks.apiBase,
      managementKey: mocks.managementKey,
      connectionStatus: 'connected',
    }),
  useConfigStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ config: {} }),
  useNotificationStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ showNotification: vi.fn(), showConfirmation: vi.fn() }),
}));

vi.mock('@/stores/useUsageHeaderSnapshotStore', () => ({
  useUsageHeaderSnapshotStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ items: [], generatedAtMs: 0 }),
}));

vi.mock('@/features/monitoring/hooks/useMonitoringData', async () => {
  const React = await import('react');
  return {
    buildRealtimeMonitorRows: () => [],
    getRangeBounds: () => ({ startMs: 0, endMs: Date.now() }),
    useMonitoringData: () => {
      const [, setRevision] = React.useState(0);
      const refreshMeta = React.useCallback(() => {
        const applyRefresh = (payload: unknown) => {
          if (mocks.nextAuthFiles) {
            mocks.authFiles = mocks.nextAuthFiles;
            mocks.nextAuthFiles = null;
          }
          setRevision((current) => current + 1);
          return payload;
        };
        const result = mocks.refreshMeta();
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then(applyRefresh);
        }
        applyRefresh(result);
        return Promise.resolve(result);
      }, []);
      const authIndex = String(mocks.authFiles[0]?.authIndex ?? '');
      const row = {
        id: 'workspace-a',
        account: 'workspace-a',
        displayAccount: 'workspace@example.com',
        accountMasked: 'wor***-a',
        authLabels: ['workspace@example.com'],
        authIndices: authIndex ? [authIndex] : [],
        channels: [],
        totalCalls: 1,
        successCalls: 1,
        failureCalls: 0,
        successRate: 1,
        inputTokens: 1,
        outputTokens: 1,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 2,
        totalCost: 0,
        averageLatencyMs: 1,
        lastSeenAt: 1,
        recentPattern: [true],
        models: [],
      };
      return {
        loading: false,
        error: '',
        authFiles: mocks.authFiles,
        channels: [],
        summary: {
          totalCalls: 1,
          successCalls: 1,
          failureCalls: 0,
          successRate: 1,
          inputTokens: 1,
          outputTokens: 1,
          reasoningTokens: 0,
          cachedTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 2,
          totalCost: 0,
          averageLatencyMs: 1,
          rpm30m: 0,
          tpm30m: 0,
          avgDailyRequests: 0,
          avgDailyTokens: 0,
          approxTasks: 0,
          approxTaskFailures: 0,
          approxTaskSuccessRate: 0,
          zeroTokenCalls: 0,
          zeroTokenModels: [],
        },
        metadata: {
          totalAuthFiles: 1,
          activeAuthFiles: 1,
          unavailableAuthFiles: 0,
          runtimeOnlyAuthFiles: 0,
          totalChannels: 0,
          enabledChannels: 0,
          configuredModels: 0,
          planTypes: [],
        },
        statusChips: [],
        timeline: [],
        timelineGranularity: 'hour' as const,
        hourlyDistribution: [],
        modelShareRows: [],
        channelRows: [],
        modelRows: [],
        failureSourceRows: [],
        taskBuckets: [],
        recentFailures: [],
        accountRows: [row],
        apiKeyRows: [],
        filterOptions: {
          accountRows: [row],
          apiKeyRows: [],
          providers: ['codex'],
          models: [],
          channels: [],
          headerTraceIds: [],
        },
        filteredRows: [],
        eventsHasMore: false,
        eventsLoadingMore: false,
        eventsRetentionLimited: false,
        eventsTotalCount: 0,
        eventsLoadedCount: 0,
        lastRefreshedAt: new Date(1),
        isTransitioningScope: false,
        hasPresentationSnapshot: true,
        refreshMeta,
        loadMoreEvents: vi.fn(),
      };
    },
  };
});

vi.mock('@/features/monitoring/hooks/useUsageData', () => ({
  useUsageData: () => ({
    loading: false,
    error: '',
    modelPrices: {},
    apiKeyAliases: {},
    loadApiKeyAliases: vi.fn(async () => undefined),
    exportUsage: vi.fn(),
    importUsage: vi.fn(),
    cancelUsageImport: vi.fn(),
  }),
}));

vi.mock('@/features/monitoring/hooks/useHeaderSnapshotsLoader', () => ({
  useHeaderSnapshotsLoader: () => mocks.loadHeaderSnapshots,
}));

vi.mock('@/hooks/useHeaderRefresh', () => ({ useHeaderRefresh: vi.fn() }));
vi.mock('@/hooks/useInterval', () => ({ useInterval: vi.fn() }));
vi.mock('@/hooks/useRequestMonitoringAvailability', () => ({
  useRequestMonitoringAvailability: () => ({
    checking: false,
    available: true,
    serviceBase: 'http://manager.local:8318',
    modelPricesAvailable: true,
    reason: '',
  }),
}));
vi.mock('@/components/common/PageTransitionLayer', () => ({
  usePageTransitionLayer: () => null,
}));
vi.mock('@/components/common/useDatabaseMaintenance', () => ({
  useDatabaseMaintenance: () => ({ status: null }),
}));

vi.mock('@/features/monitoring/model/monitoringCenterPageModel', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/monitoring/model/monitoringCenterPageModel')>();
  return {
    ...actual,
    requestAccountQuota: (target: MonitoringAccountQuotaTarget) =>
      mocks.requestAccountQuota(target),
  };
});

vi.mock('@/features/monitoring/components/AccountOverviewPanel', () => ({
  AccountOverviewPanel: (props: {
    accountQuotaStatesByRowId: Record<string, AccountQuotaState>;
    onLoadAccountQuota: (rowId: string, force: boolean) => void | Promise<void>;
  }) => {
    mocks.lastAccountOverviewProps = props;
    return null;
  },
  AccountOverviewPanelActions: () => null,
}));
vi.mock('@/features/monitoring/components/AccountOverviewCard', () => ({
  AccountExpandedDetails: () => null,
  AccountOverviewCard: () => null,
}));
vi.mock('@/features/monitoring/components/MonitoringDataPanel', () => ({
  MonitoringDataPanel: (props: { activeTab: string; renderContent: (tab: string) => ReactNode }) =>
    props.renderContent(props.activeTab),
}));

vi.mock('@/features/monitoring/components/ApiKeySummaryPanel', () => ({
  ApiKeySummaryPanel: () => null,
  ApiKeySummaryPanelActions: () => null,
}));
vi.mock('@/features/monitoring/components/MonitoringActionBar', () => ({
  MonitoringActionBar: () => null,
}));
vi.mock('@/features/monitoring/components/MonitoringDatabaseMaintenanceHint', () => ({
  MonitoringDatabaseMaintenanceHint: () => null,
}));
vi.mock('@/features/monitoring/components/MonitoringCustomRangeModal', () => ({
  MonitoringCustomRangeModal: () => null,
}));
vi.mock('@/features/monitoring/components/MonitoringFiltersPanel', () => ({
  MonitoringFiltersPanel: () => null,
}));
vi.mock('@/features/monitoring/components/UsageImportProgressModal', () => ({
  UsageImportProgressModal: () => null,
}));
vi.mock('@/features/monitoring/components/MonitoringSummarySection', () => ({
  MonitoringSummarySection: () => null,
}));

vi.mock('@/features/monitoring/components/MonitoringStatusHeader', () => ({
  MonitoringStatusHeader: () => null,
  MonitoringStatusSummary: () => null,
}));
vi.mock('@/features/monitoring/components/RealtimeEventsPanel', () => ({
  RealtimeEventsPanel: () => null,
  RealtimeEventsPanelActions: () => null,
}));

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe('MonitoringCenterPage credential quota revision lifecycle', () => {
  let renderer!: ReactTestRenderer;
  // Use fake timers so bounded retry delays are deterministic and instant.
  let timersActivated = false;

  const successMetaPayload = (authFiles: AuthFileItem[]) => ({
    authFiles,
    authFilesLoaded: true as const,
    channels: [] as const,
    channelsLoaded: true as const,
    error: '',
  });

  beforeEach(async () => {
    useAccountCredentialMutationRevisionStore.getState().clearForTests();
    mocks.apiBase = 'http://cpa-a.local:8317';
    mocks.managementKey = 'manager-key-a';
    mocks.authFiles = [makeCodexFile('1', 'codex-old.json')];
    mocks.nextAuthFiles = null;
    mocks.lastAccountOverviewProps = null;
    mocks.loadHeaderSnapshots.mockClear();
    // Default: refreshMeta resolves with a successful auth-files payload so the
    // production success-coverage path is exercised, not the failure path.
    mocks.refreshMeta
      .mockReset()
      .mockImplementation(() => successMetaPayload(mocks.authFiles));
    mocks.requestAccountQuota
      .mockReset()
      .mockImplementation(async (target: MonitoringAccountQuotaTarget) => ({
        key: target.key,
        provider: target.provider,
        providerLabel: target.provider,
        authLabel: target.authLabel,
        fileName: target.fileName,
        planType: target.planType,
        windows: [
          {
            id: 'weekly',
            label: 'Weekly',
            remainingPercent: target.authIndex === '1' ? 10 : 90,
            resetLabel: '-',
            usageLabel: null,
          },
        ],
      }));
    timersActivated = false;
    await act(async () => {
      renderer = create(<MonitoringCenterPage />);
      await flushPromises();
    });
  });

  // Test 1: successful coverage triggers quota reload.
  it('invalidates mounted quota, rebuilds an authIndex-changed target, and bypasses stale cache', async () => {
    await act(async () => {
      await mocks.lastAccountOverviewProps?.onLoadAccountQuota('workspace-a', true);
    });
    expect(mocks.requestAccountQuota).toHaveBeenCalledTimes(1);
    expect(mocks.requestAccountQuota.mock.calls[0]?.[0].authIndex).toBe('1');
    expect(
      mocks.lastAccountOverviewProps?.accountQuotaStatesByRowId['workspace-a']?.entries[0]?.windows[0]
        ?.remainingPercent
    ).toBe(10);

    mocks.nextAuthFiles = [makeCodexFile('2', 'codex-new.json')];
    mocks.refreshMeta.mockImplementation(() => successMetaPayload(mocks.nextAuthFiles!));
    await act(async () => {
      publishAccountCredentialMutationRevision({
        connectionFingerprint: createCodexInspectionConnectionFingerprint(
          mocks.apiBase,
          mocks.managementKey
        )!,
        provider: 'codex',
        kind: 'reauth',
        credentialIdentity: 'workspace-a',
      });
      await flushPromises();
    });

    expect(mocks.refreshMeta).toHaveBeenCalledTimes(1);
    expect(mocks.requestAccountQuota).toHaveBeenCalledTimes(2);
    expect(mocks.requestAccountQuota.mock.calls[1]?.[0].authIndex).toBe('2');
    expect(
      mocks.lastAccountOverviewProps?.accountQuotaStatesByRowId['workspace-a']?.targetKey
    ).toContain('codex::2::codex-new.json');
    expect(
      mocks.lastAccountOverviewProps?.accountQuotaStatesByRowId['workspace-a']?.entries[0]?.windows[0]
        ?.remainingPercent
    ).toBe(90);
  });

  // Test 2: auth-files failure does not reload quota until a retry succeeds.
  it('does not reload quota when auth-files fail and eventually covers via bounded retry', async () => {
    vi.useFakeTimers();
    timersActivated = true;

    // Pre-load quota so the row is mounted and the invalidation effect will
    // trigger a reload once coverage succeeds.
    await act(async () => {
      await mocks.lastAccountOverviewProps?.onLoadAccountQuota('workspace-a', true);
    });

    const fingerprint = createCodexInspectionConnectionFingerprint(
      mocks.apiBase,
      mocks.managementKey
    )!;
    const failPayload = {
      authFiles: [] as AuthFileItem[],
      authFilesLoaded: false as const,
      channels: [] as const,
      channelsLoaded: true as const,
      error: 'auth-files unavailable',
    };
    // The initial refresh and the 0ms retry both fail; the 1s retry succeeds.
    mocks.refreshMeta.mockReset();
    mocks.refreshMeta
      .mockReturnValueOnce(failPayload)
      .mockReturnValueOnce(failPayload);
    mocks.nextAuthFiles = [makeCodexFile('2', 'codex-new.json')];
    mocks.refreshMeta.mockImplementation(() => successMetaPayload(mocks.nextAuthFiles!));

    await act(async () => {
      publishAccountCredentialMutationRevision({
        connectionFingerprint: fingerprint,
        provider: 'codex',
        kind: 'reauth',
        credentialIdentity: 'workspace-a',
      });
      await flushPromises();
    });

    // After the failed refresh, no mutation-driven quota reload should have
    // occurred — any requestAccountQuota calls must still use the old authIndex.
    const callsAfterFailure = mocks.requestAccountQuota.mock.calls;
    expect(
      callsAfterFailure.some((call) => call[0]?.authIndex === '2')
    ).toBe(false);

    // Advance through the bounded retry delays until the retry succeeds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    // Now the retry has succeeded and quota should be reloaded with authIndex=2.
    expect(
      mocks.requestAccountQuota.mock.calls.some((call) => call[0]?.authIndex === '2')
    ).toBe(true);

    vi.useRealTimers();
    timersActivated = false;
  });

  // Test 3: a newer revision during refresh triggers a serialized follow-up.
  it('runs a follow-up metadata refresh when a newer revision arrives during refresh', async () => {
    const firstRefresh = deferred<{
      authFiles: AuthFileItem[];
      authFilesLoaded: boolean;
      channels: [];
      channelsLoaded: boolean;
      error: string;
    }>();
    const secondRefresh = deferred<{
      authFiles: AuthFileItem[];
      authFilesLoaded: boolean;
      channels: [];
      channelsLoaded: boolean;
      error: string;
    }>();
    mocks.refreshMeta.mockReset();
    mocks.refreshMeta.mockReturnValueOnce(firstRefresh.promise).mockReturnValueOnce(secondRefresh.promise);

    const fingerprint = createCodexInspectionConnectionFingerprint(
      mocks.apiBase,
      mocks.managementKey
    )!;
    await act(async () => {
      publishAccountCredentialMutationRevision({
        connectionFingerprint: fingerprint,
        provider: 'codex',
        kind: 'reauth',
      });
      await flushPromises();
    });
    expect(mocks.refreshMeta).toHaveBeenCalledTimes(1);

    await act(async () => {
      publishAccountCredentialMutationRevision({
        connectionFingerprint: fingerprint,
        provider: 'codex',
        kind: 'reauth',
      });
      await flushPromises();
    });
    expect(mocks.refreshMeta).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRefresh.resolve({
        authFiles: [makeCodexFile('1', 'codex-old.json')],
        authFilesLoaded: true,
        channels: [],
        channelsLoaded: true,
        error: '',
      });
      await flushPromises();
    });
    // First refresh covered rev1, but rev2 is still pending → follow-up.
    expect(mocks.refreshMeta).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondRefresh.resolve({
        authFiles: [makeCodexFile('2', 'codex-new.json')],
        authFilesLoaded: true,
        channels: [],
        channelsLoaded: true,
        error: '',
      });
      await flushPromises();
    });
    expect(mocks.refreshMeta).toHaveBeenCalledTimes(2);
  });

  // Test 4: a mutation refresh superseded by a same-scope newer metadata request
  // (returning null) eventually recovers via retry without a new mutation.
  it('recovers a superseded mutation refresh via retry without a new revision', async () => {
    vi.useFakeTimers();
    timersActivated = true;

    // Pre-load quota so the row is mounted.
    await act(async () => {
      await mocks.lastAccountOverviewProps?.onLoadAccountQuota('workspace-a', true);
    });

    const fingerprint = createCodexInspectionConnectionFingerprint(
      mocks.apiBase,
      mocks.managementKey
    )!;
    // First attempt returns null (superseded by generation fence). Subsequent
    // retry returns a successful payload.
    // The initial refresh and the 0ms retry both return null (superseded);
    // the 1s retry succeeds.
    mocks.refreshMeta.mockReset();
    mocks.refreshMeta.mockReturnValueOnce(null).mockReturnValueOnce(null);
    mocks.nextAuthFiles = [makeCodexFile('2', 'codex-new.json')];
    mocks.refreshMeta.mockImplementation(() => successMetaPayload(mocks.nextAuthFiles!));

    await act(async () => {
      publishAccountCredentialMutationRevision({
        connectionFingerprint: fingerprint,
        provider: 'codex',
        kind: 'reauth',
        credentialIdentity: 'workspace-a',
      });
      await flushPromises();
    });
    // Superseded: no mutation-driven reload with the new authIndex yet.
    expect(
      mocks.requestAccountQuota.mock.calls.some((call) => call[0]?.authIndex === '2')
    ).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    // Retry succeeded → quota reloaded with authIndex=2.
    expect(
      mocks.requestAccountQuota.mock.calls.some((call) => call[0]?.authIndex === '2')
    ).toBe(true);

    vi.useRealTimers();
    timersActivated = false;
  });

  // Test 5: connection switch cancels an in-flight retry.
  it('cancels pending retry when the connection fingerprint changes', async () => {
    vi.useFakeTimers();
    timersActivated = true;

    const fingerprint = createCodexInspectionConnectionFingerprint(
      mocks.apiBase,
      mocks.managementKey
    )!;
    mocks.refreshMeta
      .mockReset()
      .mockImplementation(() => ({
        authFiles: [],
        authFilesLoaded: false,
        channels: [],
        channelsLoaded: true,
        error: 'auth-files unavailable',
      }));

    await act(async () => {
      publishAccountCredentialMutationRevision({
        connectionFingerprint: fingerprint,
        provider: 'codex',
        kind: 'reauth',
        credentialIdentity: 'workspace-a',
      });
      await flushPromises();
    });
    expect(mocks.requestAccountQuota).not.toHaveBeenCalled();

    // Switch connection — generation bumps and old retries become no-ops.
    await act(async () => {
      mocks.apiBase = 'http://cpa-b.local:8317';
      mocks.managementKey = 'manager-key-b';
      mocks.refreshMeta.mockImplementation(() =>
        successMetaPayload([makeCodexFile('1', 'codex-old.json')])
      );
      renderer.update(<MonitoringCenterPage />);
      await vi.advanceTimersByTimeAsync(8_000);
    });

    // The old mutation's quota should not have been invalidated.
    expect(mocks.requestAccountQuota).not.toHaveBeenCalled();

    vi.useRealTimers();
    timersActivated = false;
  });

  afterEach(async () => {
    if (timersActivated) {
      vi.useRealTimers();
    }
    await act(async () => renderer.unmount());
  });
});
