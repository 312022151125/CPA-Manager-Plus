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
      const refreshMeta = React.useCallback(async () => {
        mocks.refreshMeta();
        if (mocks.nextAuthFiles) {
          mocks.authFiles = mocks.nextAuthFiles;
          mocks.nextAuthFiles = null;
        }
        setRevision((current) => current + 1);
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

describe('MonitoringCenterPage credential quota revision lifecycle', () => {
  let renderer!: ReactTestRenderer;

  beforeEach(async () => {
    useAccountCredentialMutationRevisionStore.getState().clearForTests();
    mocks.apiBase = 'http://cpa-a.local:8317';
    mocks.managementKey = 'manager-key-a';
    mocks.authFiles = [makeCodexFile('1', 'codex-old.json')];
    mocks.nextAuthFiles = null;
    mocks.lastAccountOverviewProps = null;
    mocks.loadHeaderSnapshots.mockClear();
    mocks.refreshMeta.mockClear();
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
    await act(async () => {
      renderer = create(<MonitoringCenterPage />);
      await flushPromises();
    });
  });

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

  it('ignores quota revisions from a different connection fingerprint', async () => {
    await act(async () => {
      publishAccountCredentialMutationRevision({
        connectionFingerprint: createCodexInspectionConnectionFingerprint(
          'http://cpa-b.local:8317',
          'manager-key-b'
        )!,
        provider: 'codex',
        kind: 'quota',
      });
      await flushPromises();
    });

    expect(mocks.refreshMeta).not.toHaveBeenCalled();
    expect(mocks.requestAccountQuota).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    await act(async () => renderer.unmount());
  });
});