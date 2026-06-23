import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { Select } from '@/components/ui/Select';
import {
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconDollarSign,
  IconDownload,
  IconEye,
  IconFilter,
  IconMoreVertical,
  IconRefreshCw,
  IconSearch,
  IconShield,
  IconSlidersHorizontal,
  IconTrendingUp,
  IconX,
} from '@/components/ui/icons';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  KIMI_CONFIG,
  XAI_CONFIG,
  type QuotaConfig,
} from '@/components/quota';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import {
  buildAccountMetrics,
  buildAccountRows,
  filterAccountRows,
  getPlanOptions,
  getProviderOptions,
  sortAccountRows,
  type AccountQuotaBand,
  type AccountRow,
  type AccountStatusFilter,
} from '@/features/accounts/model/accountRows';
import {
  buildAccountRecommendations,
  getRecommendationRank,
  type AccountRecommendation,
  type AccountRecommendationAction,
  type AccountRecommendationPriority,
} from '@/features/accounts/model/quotaRecommendations';
import {
  buildUsageValueRowsFromMonitoring,
  buildUsageValueRowsFromRecent,
  buildUsageValueSummary,
  filterUsageValueRows,
  type UsageValueRange,
  type UsageValueRow,
  type UsageValueSource,
} from '@/features/accounts/model/usageValueRows';
import { buildOAuthRulePreviewRows } from '@/features/accounts/model/oauthRulePreview';
import {
  authFilesApi,
  monitoringAnalyticsApi,
  usageServiceApi,
  type CodexInspectionRun,
  type CodexInspectionResult,
  type MonitoringAnalyticsAccountStatRow,
  type MonitoringAnalyticsTimelinePoint,
} from '@/services/api';
import type {
  AuthFileItem,
  ClaudeQuotaState,
  KimiQuotaState,
  XaiQuotaState,
} from '@/types';
import { useAuthStore, useNotificationStore, useQuotaStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import styles from './AccountsPage.module.scss';

type AccountsView = 'accounts' | 'quota' | 'inspection' | 'oauth' | 'value';
type DetailTab = 'overview' | 'quota' | 'auth' | 'strategy' | 'value' | 'events';
type AccountColumn =
  | 'provider'
  | 'plan'
  | 'status'
  | 'quota'
  | 'reset'
  | 'priority'
  | 'value'
  | 'recent';
type QuotaUpdater<T> = T | ((prev: T) => T);
type QuotaSetter<T> = (updater: QuotaUpdater<Record<string, T>>) => void;

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
];

const PRIORITY_OPTIONS = [
  { value: '-10', label: '-10' },
  { value: '-5', label: '-5' },
  { value: '0', label: '0' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
];

const VALUE_RANGE_OPTIONS: Array<{ value: UsageValueRange; labelKey: string; hours: number }> = [
  { value: '24h', labelKey: 'accounts.range_24h', hours: 24 },
  { value: '7d', labelKey: 'accounts.range_7d', hours: 24 * 7 },
  { value: '30d', labelKey: 'accounts.range_30d', hours: 24 * 30 },
];

const ACCOUNT_COLUMNS: AccountColumn[] = [
  'provider',
  'plan',
  'status',
  'quota',
  'reset',
  'priority',
  'value',
  'recent',
];

const getProviderLabel = (provider: string, t: TFunction) => {
  const key = `auth_files.filter_${provider}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (provider === 'all') return t('accounts.filter_all');
  if (provider === 'iflow') return 'iFlow';
  if (provider === 'xai') return 'xAI';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
};

const formatPercent = (value: number | null, digits = 0) =>
  value === null ? '-' : `${value.toFixed(digits)}%`;

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

const formatCompactNumber = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

const formatTimestamp = (value: number | null, locale: string) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const quotaStatusLabelKey = (status: AccountRow['quota']['status']) => {
  switch (status) {
    case 'ok':
      return 'accounts.quota_status_ok';
    case 'low':
      return 'accounts.quota_status_low';
    case 'exhausted':
      return 'accounts.quota_status_exhausted';
    case 'error':
      return 'accounts.quota_status_error';
    case 'loading':
      return 'accounts.quota_status_loading';
    case 'disabled':
      return 'accounts.quota_status_disabled';
    case 'unknown':
    default:
      return 'accounts.quota_status_unknown';
  }
};

const getQuotaStatusClass = (status: AccountRow['quota']['status']) => {
  switch (status) {
    case 'ok':
      return styles.badgeGood;
    case 'low':
      return styles.badgeWarn;
    case 'exhausted':
    case 'error':
      return styles.badgeBad;
    case 'disabled':
      return styles.badgeMuted;
    case 'loading':
      return styles.badgeInfo;
    default:
      return styles.badgeNeutral;
  }
};

const getRemainingBarClass = (row: AccountRow) => {
  if (row.quota.status === 'exhausted' || row.quota.status === 'error') return styles.quotaBarBad;
  if (row.quota.status === 'low') return styles.quotaBarWarn;
  if (row.quota.status === 'ok') return styles.quotaBarGood;
  return styles.quotaBarNeutral;
};

const getRecommendationPriorityClass = (priority: AccountRecommendationPriority) => {
  if (priority === 'critical') return styles.badgeBad;
  if (priority === 'high') return styles.badgeWarn;
  if (priority === 'medium') return styles.badgeInfo;
  return styles.badgeNeutral;
};

const getRecommendationActionLabelKey = (action: AccountRecommendationAction) => {
  switch (action) {
    case 'refresh':
      return 'accounts.recommend_action_refresh';
    case 'disable':
      return 'accounts.recommend_action_disable';
    case 'enable':
      return 'accounts.recommend_action_enable';
    case 'restore-default':
      return 'accounts.recommend_action_restore';
    case 'reauth':
      return 'accounts.recommend_action_reauth';
    default:
      return 'accounts.recommend_action_review';
  }
};

const getColumnLabelKey = (column: AccountColumn) => {
  switch (column) {
    case 'provider':
      return 'accounts.col_provider';
    case 'plan':
      return 'accounts.col_plan';
    case 'status':
      return 'accounts.col_status';
    case 'quota':
      return 'accounts.col_quota';
    case 'reset':
      return 'accounts.col_reset';
    case 'priority':
      return 'accounts.col_priority';
    case 'value':
      return 'accounts.col_value';
    case 'recent':
      return 'accounts.col_recent';
    default:
      return column;
  }
};

const getValueRangeMs = (range: UsageValueRange) =>
  (VALUE_RANGE_OPTIONS.find((option) => option.value === range)?.hours ?? 24 * 7) * 60 * 60 * 1000;

async function refreshQuotaWithConfig<TState, TData>({
  config,
  file,
  setQuota,
  t,
}: {
  config: QuotaConfig<TState, TData>;
  file: AuthFileItem;
  setQuota: QuotaSetter<TState>;
  t: TFunction;
}) {
  setQuota((prev) => ({
    ...prev,
    [file.name]: config.buildLoadingState(),
  }));
  try {
    const data = await config.fetchQuota(file, t);
    setQuota((prev) => ({
      ...prev,
      [file.name]: config.buildSuccessState(data),
    }));
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t('common.unknown_error');
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
    setQuota((prev) => ({
      ...prev,
      [file.name]: config.buildErrorState(message, Number.isFinite(status) ? status : undefined),
    }));
    return false;
  }
}

export function AccountsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const managementKey = useAuthStore((state) => state.managementKey);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const featureAvailability = usePanelFeatureAvailability();

  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    loadFiles,
    toggleSelect,
    selectAllVisible,
    deselectAll,
    batchSetStatus,
  } = useAuthFilesData();

  const oauthState = useAuthFilesOauth({ viewMode: 'list', files });

  const antigravityQuota = useQuotaStore((state) => state.antigravityQuota);
  const claudeQuota = useQuotaStore((state) => state.claudeQuota);
  const codexQuota = useQuotaStore((state) => state.codexQuota);
  const kimiQuota = useQuotaStore((state) => state.kimiQuota);
  const xaiQuota = useQuotaStore((state) => state.xaiQuota);
  const quotaStores = useMemo(
    () => ({
      antigravityQuota,
      claudeQuota,
      codexQuota,
      kimiQuota,
      xaiQuota,
    }),
    [antigravityQuota, claudeQuota, codexQuota, kimiQuota, xaiQuota]
  );
  const setAntigravityQuota = useQuotaStore((state) => state.setAntigravityQuota);
  const setClaudeQuota = useQuotaStore((state) => state.setClaudeQuota);
  const setCodexQuota = useQuotaStore((state) => state.setCodexQuota);
  const setKimiQuota = useQuotaStore((state) => state.setKimiQuota);
  const setXaiQuota = useQuotaStore((state) => state.setXaiQuota);

  const [activeView, setActiveView] = useState<AccountsView>('accounts');
  const [inspectionResults, setInspectionResults] = useState<CodexInspectionResult[]>([]);
  const [inspectionRuns, setInspectionRuns] = useState<CodexInspectionRun[]>([]);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [quotaRefreshing, setQuotaRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [priorityUpdating, setPriorityUpdating] = useState(false);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [quotaBandFilter, setQuotaBandFilter] = useState<AccountQuotaBand>('all');
  const [search, setSearch] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<AccountColumn>>(new Set());
  const [priorityDraft, setPriorityDraft] = useState('0');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [valueRange, setValueRange] = useState<UsageValueRange>('7d');
  const [valueProvider, setValueProvider] = useState('all');
  const [valueSearch, setValueSearch] = useState('');
  const [usageRows, setUsageRows] = useState<UsageValueRow[]>([]);
  const [usageTimeline, setUsageTimeline] = useState<MonitoringAnalyticsTimelinePoint[]>([]);
  const [usageSource, setUsageSource] = useState<UsageValueSource>('recent');
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [oauthPreviewModel, setOauthPreviewModel] = useState('gpt-5');
  const [executingRecommendations, setExecutingRecommendations] = useState(false);

  const loadInspectionSummary = useCallback(async () => {
    if (
      featureAvailability.checking ||
      !featureAvailability.serverCodexInspectionAvailable ||
      !featureAvailability.managerServiceBase ||
      !managementKey
    ) {
      setInspectionResults([]);
      setInspectionRuns([]);
      return;
    }
    setInspectionLoading(true);
    try {
      const runs = await usageServiceApi.listCodexInspectionRuns(
        featureAvailability.managerServiceBase,
        managementKey,
        10
      );
      setInspectionRuns(runs.items);
      const latestRunId = runs.items[0]?.id;
      if (!latestRunId) {
        setInspectionResults([]);
        return;
      }
      const detail = await usageServiceApi.getCodexInspectionRun(
        featureAvailability.managerServiceBase,
        managementKey,
        latestRunId
      );
      setInspectionResults(detail.results);
    } catch {
      setInspectionResults([]);
      setInspectionRuns([]);
    } finally {
      setInspectionLoading(false);
    }
  }, [
    featureAvailability.checking,
    featureAvailability.managerServiceBase,
    featureAvailability.serverCodexInspectionAvailable,
    managementKey,
  ]);

  const loadOauthExcluded = oauthState.loadExcluded;
  const loadOauthModelAlias = oauthState.loadModelAlias;

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      loadFiles(),
      loadInspectionSummary(),
      loadOauthExcluded(),
      loadOauthModelAlias(),
    ]);
  }, [loadFiles, loadInspectionSummary, loadOauthExcluded, loadOauthModelAlias]);

  useHeaderRefresh(handleRefresh);

  useEffect(() => {
    void handleRefresh();
  }, [handleRefresh]);

  const rows = useMemo(
    () => buildAccountRows(files, quotaStores, inspectionResults),
    [files, inspectionResults, quotaStores]
  );
  const metrics = useMemo(() => buildAccountMetrics(rows), [rows]);
  const providerOptions = useMemo(() => getProviderOptions(rows), [rows]);
  const planOptions = useMemo(() => getPlanOptions(rows), [rows]);
  const recommendations = useMemo(() => buildAccountRecommendations(rows), [rows]);
  const filteredRows = useMemo(
    () =>
      sortAccountRows(
        filterAccountRows(rows, {
          provider: providerFilter,
          status: statusFilter,
          plan: planFilter,
          quotaBand: quotaBandFilter,
          search,
        })
      ),
    [planFilter, providerFilter, quotaBandFilter, rows, search, statusFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedFiles.has(row.fileName)),
    [rows, selectedFiles]
  );
  const selectedRow = useMemo(
    () => rows.find((row) => row.fileName === selectedRowKey) ?? null,
    [rows, selectedRowKey]
  );
  const selectablePageRows = pageRows.filter((row) => !row.runtimeOnly);
  const allPageSelected =
    selectablePageRows.length > 0 && selectablePageRows.every((row) => selectedFiles.has(row.fileName));
  const disableControls = connectionStatus !== 'connected';
  const valueSummary = useMemo(
    () => buildUsageValueSummary(usageRows, usageSource),
    [usageRows, usageSource]
  );
  const filteredUsageRows = useMemo(
    () => filterUsageValueRows(usageRows, { provider: valueProvider, search: valueSearch }),
    [usageRows, valueProvider, valueSearch]
  );
  const valueProviderOptions = useMemo(
    () => Array.from(new Set(usageRows.map((row) => row.provider))).sort(),
    [usageRows]
  );
  const latestRun = inspectionRuns[0] ?? null;
  const oauthPreviewRows = useMemo(
    () =>
      buildOAuthRulePreviewRows({
        providers: providerOptions,
        excluded: oauthState.excluded,
        aliases: oauthState.modelAlias,
        inputModel: oauthPreviewModel,
      }),
    [oauthPreviewModel, oauthState.excluded, oauthState.modelAlias, providerOptions]
  );

  useEffect(() => {
    setPage(1);
  }, [pageSize, planFilter, providerFilter, quotaBandFilter, search, statusFilter]);

  useEffect(() => {
    if (!selectedRow) {
      setDetailTab('overview');
    }
  }, [selectedRow]);

  const loadUsageValues = useCallback(async () => {
    const fallback = () => {
      const fallbackRows = buildUsageValueRowsFromRecent(rows);
      setUsageRows(fallbackRows);
      setUsageTimeline([]);
      setUsageSource('recent');
    };

    if (
      featureAvailability.checking ||
      !featureAvailability.requestMonitoringAvailable ||
      !featureAvailability.managerServiceBase ||
      !managementKey
    ) {
      fallback();
      setUsageError('');
      return;
    }

    setUsageLoading(true);
    setUsageError('');
    try {
      const toMs = Date.now();
      const response = await monitoringAnalyticsApi.getAnalytics(
        featureAvailability.managerServiceBase,
        managementKey,
        {
          from_ms: toMs - getValueRangeMs(valueRange),
          to_ms: toMs,
          now_ms: toMs,
          include: {
            summary: true,
            timeline: true,
            account_stats: true,
            granularity: valueRange === '24h' ? 'hour' : 'day',
          },
        }
      );
      const stats: MonitoringAnalyticsAccountStatRow[] = response.account_stats ?? [];
      if (stats.length === 0) {
        fallback();
        return;
      }
      setUsageRows(buildUsageValueRowsFromMonitoring(rows, stats));
      setUsageTimeline(response.timeline ?? []);
      setUsageSource('monitoring');
    } catch (err: unknown) {
      fallback();
      setUsageError(err instanceof Error ? err.message : t('notification.load_failed'));
    } finally {
      setUsageLoading(false);
    }
  }, [
    featureAvailability.checking,
    featureAvailability.managerServiceBase,
    featureAvailability.requestMonitoringAvailable,
    managementKey,
    rows,
    t,
    valueRange,
  ]);

  useEffect(() => {
    void loadUsageValues();
  }, [loadUsageValues]);

  const refreshQuotaForRow = useCallback(
    async (row: AccountRow) => {
      if (row.disabled || row.runtimeOnly) return false;
      switch (row.provider) {
        case CODEX_CONFIG.type:
          return refreshQuotaWithConfig({
            config: CODEX_CONFIG,
            file: row.raw,
            setQuota: setCodexQuota,
            t,
          });
        case CLAUDE_CONFIG.type:
          return refreshQuotaWithConfig<ClaudeQuotaState, { windows: ClaudeQuotaState['windows']; extraUsage?: ClaudeQuotaState['extraUsage']; planType?: string | null }>({
            config: CLAUDE_CONFIG,
            file: row.raw,
            setQuota: setClaudeQuota,
            t,
          });
        case ANTIGRAVITY_CONFIG.type:
          return refreshQuotaWithConfig({
            config: ANTIGRAVITY_CONFIG,
            file: row.raw,
            setQuota: setAntigravityQuota,
            t,
          });
        case KIMI_CONFIG.type:
          return refreshQuotaWithConfig<KimiQuotaState, KimiQuotaState['rows']>({
            config: KIMI_CONFIG,
            file: row.raw,
            setQuota: setKimiQuota,
            t,
          });
        case XAI_CONFIG.type:
          return refreshQuotaWithConfig<XaiQuotaState, NonNullable<XaiQuotaState['billing']>>({
            config: XAI_CONFIG,
            file: row.raw,
            setQuota: setXaiQuota,
            t,
          });
        default:
          return false;
      }
    },
    [
      setAntigravityQuota,
      setClaudeQuota,
      setCodexQuota,
      setKimiQuota,
      setXaiQuota,
      t,
    ]
  );

  const refreshQuotaRows = useCallback(
    async (targets: AccountRow[]) => {
      const refreshable = targets.filter((row) => !row.disabled && !row.runtimeOnly);
      if (refreshable.length === 0) {
        showNotification(t('accounts.no_refreshable_accounts'), 'warning');
        return;
      }
      setQuotaRefreshing(true);
      try {
        const results = await Promise.all(refreshable.map((row) => refreshQuotaForRow(row)));
        const successCount = results.filter(Boolean).length;
        showNotification(
          t('accounts.quota_refresh_result', {
            success: successCount,
            total: refreshable.length,
          }),
          successCount === refreshable.length ? 'success' : 'warning'
        );
      } finally {
        setQuotaRefreshing(false);
      }
    },
    [refreshQuotaForRow, showNotification, t]
  );

  const handleBatchStatus = useCallback(
    async (enabled: boolean, targets = selectedRows) => {
      const names = targets.filter((row) => !row.runtimeOnly).map((row) => row.fileName);
      if (names.length === 0) return;
      setStatusUpdating(true);
      try {
        await batchSetStatus(names, enabled);
        await loadFiles();
        deselectAll();
      } finally {
        setStatusUpdating(false);
      }
    },
    [batchSetStatus, deselectAll, loadFiles, selectedRows]
  );

  const patchPriorityRows = useCallback(
    async (targets: AccountRow[], priority: number) => {
      const patchable = targets.filter((row) => !row.runtimeOnly);
      if (patchable.length === 0) return;
      setPriorityUpdating(true);
      try {
        const results = await Promise.allSettled(
          patchable.map((row) => authFilesApi.patchFields(row.fileName, { priority }))
        );
        const successCount = results.filter((result) => result.status === 'fulfilled').length;
        await loadFiles();
        showNotification(
          t('accounts.priority_update_result', {
            success: successCount,
            total: patchable.length,
          }),
          successCount === patchable.length ? 'success' : 'warning'
        );
      } finally {
        setPriorityUpdating(false);
      }
    },
    [loadFiles, showNotification, t]
  );

  const executeRecommendation = useCallback(
    async (item: AccountRecommendation) => {
      if (item.action === 'refresh') {
        await refreshQuotaRows([item.row]);
      } else if (item.action === 'disable') {
        await handleBatchStatus(false, [item.row]);
      } else if (item.action === 'enable') {
        await handleBatchStatus(true, [item.row]);
      } else if (item.action === 'restore-default') {
        await patchPriorityRows([item.row], 0);
      } else if (item.action === 'reauth') {
        navigate('/oauth');
      } else {
        setSelectedRowKey(item.row.fileName);
        setDetailTab('strategy');
      }
    },
    [handleBatchStatus, navigate, patchPriorityRows, refreshQuotaRows]
  );

  const executeRecommendedActions = () => {
    const executable = recommendations.filter((item) =>
      ['refresh', 'disable', 'enable', 'restore-default'].includes(item.action)
    );
    if (executable.length === 0) {
      showNotification(t('accounts.no_executable_recommendations'), 'info');
      return;
    }
    showConfirmation({
      title: t('accounts.execute_recommendations'),
      message: t('accounts.execute_recommendations_confirm', { count: executable.length }),
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        setExecutingRecommendations(true);
        try {
          for (const item of executable) {
            await executeRecommendation(item);
          }
        } finally {
          setExecutingRecommendations(false);
        }
      },
    });
  };

  const openUsageValueDetail = (row: UsageValueRow) => {
    const targetFileName = row.row?.fileName ?? row.fileName;
    const targetRow = rows.find((item) => item.fileName === targetFileName);
    if (!targetRow) {
      showNotification(t('accounts.value_unmatched_detail'), 'info');
      return;
    }
    setSelectedRowKey(targetRow.fileName);
    setDetailTab('value');
  };

  const handleExportInspection = async () => {
    const payload = JSON.stringify(
      {
        run: latestRun,
        results: inspectionResults,
      },
      null,
      2
    );
    const copied = await copyToClipboard(payload);
    showNotification(
      copied ? t('accounts.export_copied') : t('notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const toggleColumn = (column: AccountColumn, visible: boolean) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (visible) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  const isColumnVisible = (column: AccountColumn) => !hiddenColumns.has(column);

  const estimatedWeeklyValue = valueSummary.weeklyValue;

  const renderMetricCard = (
    key: string,
    label: string,
    value: string | number,
    meta: string,
    icon: ReactNode,
    tone: 'blue' | 'green' | 'amber' | 'red' | 'violet' = 'blue'
  ) => (
    <section key={key} className={styles.metricCard}>
      <div className={`${styles.metricIcon} ${styles[`metricIcon${tone}`]}`}>{icon}</div>
      <div className={styles.metricBody}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </section>
  );

  const renderViewTabs = () => {
    const tabs: Array<{ id: AccountsView; label: string; badge?: number }> = [
      { id: 'accounts', label: t('accounts.tab_accounts') },
      { id: 'quota', label: t('accounts.tab_quota'), badge: recommendations.length },
      { id: 'inspection', label: t('accounts.tab_inspection'), badge: metrics.needsInspectionAction },
      { id: 'oauth', label: t('accounts.tab_oauth') },
      { id: 'value', label: t('accounts.tab_value') },
    ];
    return (
      <div className={styles.tabs} role="tablist" aria-label={t('accounts.tabs_label')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeView === tab.id}
            className={`${styles.tabButton} ${activeView === tab.id ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveView(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge ? <small>{tab.badge}</small> : null}
          </button>
        ))}
      </div>
    );
  };

  const renderToolbar = () => (
    <section className={styles.toolbar}>
      <div className={styles.searchField}>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('accounts.search_placeholder')}
          rightElement={<IconSearch size={16} />}
          aria-label={t('accounts.search_label')}
        />
      </div>
      <Select
        value={providerFilter}
        options={[
          { value: 'all', label: t('accounts.filter_all') },
          ...providerOptions.map((provider) => ({
            value: provider,
            label: getProviderLabel(provider, t),
          })),
        ]}
        onChange={setProviderFilter}
        ariaLabel={t('accounts.provider_filter')}
      />
      <Select
        value={statusFilter}
        options={[
          { value: 'all', label: t('accounts.status_all') },
          { value: 'available', label: t('accounts.status_available') },
          { value: 'low', label: t('accounts.status_low') },
          { value: 'exhausted', label: t('accounts.status_exhausted') },
          { value: 'disabled', label: t('accounts.status_disabled') },
          { value: 'problem', label: t('accounts.status_problem') },
          { value: 'inspection', label: t('accounts.status_inspection') },
        ]}
        onChange={(value) => setStatusFilter(value as AccountStatusFilter)}
        ariaLabel={t('accounts.status_filter')}
      />
      <Select
        value={planFilter}
        options={[
          { value: 'all', label: t('accounts.plan_all') },
          ...planOptions.map((plan) => ({ value: plan, label: plan })),
        ]}
        onChange={setPlanFilter}
        ariaLabel={t('accounts.plan_filter')}
      />
      <Select
        value={quotaBandFilter}
        options={[
          { value: 'all', label: t('accounts.quota_all') },
          { value: 'ge50', label: t('accounts.quota_ge50') },
          { value: 'between20and50', label: t('accounts.quota_between20and50') },
          { value: 'lt20', label: t('accounts.quota_lt20') },
          { value: 'spent', label: t('accounts.quota_spent') },
        ]}
        onChange={(value) => setQuotaBandFilter(value as AccountQuotaBand)}
        ariaLabel={t('accounts.quota_filter')}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowAdvancedFilters((value) => !value)}
        aria-expanded={showAdvancedFilters}
      >
        <IconFilter size={15} />
        {t('accounts.more_filters')}
      </Button>
      {showAdvancedFilters ? (
        <div className={styles.advancedPanel}>
          <div className={styles.columnSettings}>
            <strong>{t('accounts.column_settings')}</strong>
            <div>
              {ACCOUNT_COLUMNS.map((column) => (
                <label key={column}>
                  <input
                    type="checkbox"
                    checked={isColumnVisible(column)}
                    onChange={(event) => toggleColumn(column, event.target.checked)}
                    aria-label={t(getColumnLabelKey(column))}
                  />
                  <span>{t(getColumnLabelKey(column))}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );

  const renderBatchBar = () => (
    <section className={styles.batchBar}>
      <span>
        {t('accounts.selected_count', {
          count: selectionCount,
        })}
      </span>
      <div className={styles.batchActions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refreshQuotaRows(selectedRows)}
          disabled={selectionCount === 0 || quotaRefreshing}
          loading={quotaRefreshing}
        >
          <IconRefreshCw size={15} />
          {t('accounts.refresh_quota')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleBatchStatus(true)}
          disabled={disableControls || selectionCount === 0 || statusUpdating}
        >
          <IconCheck size={15} />
          {t('accounts.enable')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleBatchStatus(false)}
          disabled={disableControls || selectionCount === 0 || statusUpdating}
        >
          <IconX size={15} />
          {t('accounts.disable')}
        </Button>
        <Select
          value={priorityDraft}
          options={PRIORITY_OPTIONS}
          onChange={setPriorityDraft}
          ariaLabel={t('accounts.priority_select')}
          className={styles.prioritySelect}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={disableControls || selectionCount === 0 || priorityUpdating}
          loading={priorityUpdating}
          onClick={() => patchPriorityRows(selectedRows, Number(priorityDraft))}
        >
          {t('accounts.set_priority')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disableControls || selectionCount === 0 || priorityUpdating}
          onClick={() => patchPriorityRows(selectedRows, 0)}
        >
          {t('accounts.restore_default')}
        </Button>
      </div>
    </section>
  );

  const renderAccountTable = (rowsToRender = pageRows, paged = true) => (
    <section className={styles.tablePanel}>
      {paged ? renderBatchBar() : null}
      <div className={styles.tableScroller}>
        <table className={styles.accountTable}>
          <thead>
            <tr>
              {paged ? (
                <th className={styles.selectCol}>
                  <SelectionCheckbox
                    checked={allPageSelected}
                    onChange={(checked) => {
                      if (checked) {
                        selectAllVisible(selectablePageRows.map((row) => row.raw));
                        return;
                      }
                      selectablePageRows.forEach((row) => {
                        if (selectedFiles.has(row.fileName)) {
                          toggleSelect(row.fileName);
                        }
                      });
                    }}
                    ariaLabel={t('accounts.select_page')}
                  />
                </th>
              ) : null}
              <th>{t('accounts.col_account')}</th>
              {isColumnVisible('provider') ? <th>{t('accounts.col_provider')}</th> : null}
              {isColumnVisible('plan') ? <th>{t('accounts.col_plan')}</th> : null}
              {isColumnVisible('status') ? <th>{t('accounts.col_status')}</th> : null}
              {isColumnVisible('quota') ? <th>{t('accounts.col_quota')}</th> : null}
              {isColumnVisible('reset') ? <th>{t('accounts.col_reset')}</th> : null}
              {isColumnVisible('priority') ? <th>{t('accounts.col_priority')}</th> : null}
              {isColumnVisible('value') ? <th>{t('accounts.col_value')}</th> : null}
              {isColumnVisible('recent') ? <th>{t('accounts.col_recent')}</th> : null}
              <th>{t('accounts.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rowsToRender.map((row) => {
              const remaining = row.quota.remainingPercent;
              const recentTotal = row.usage.success + row.usage.failure;
              return (
                <tr
                  key={row.fileName}
                  className={selectedRowKey === row.fileName ? styles.rowSelected : ''}
                  onClick={() => setSelectedRowKey(row.fileName)}
                >
                  {paged ? (
                    <td className={styles.selectCol} onClick={(event) => event.stopPropagation()}>
                      <SelectionCheckbox
                        checked={selectedFiles.has(row.fileName)}
                        onChange={() => toggleSelect(row.fileName)}
                        disabled={row.runtimeOnly}
                        ariaLabel={t('accounts.select_account', { name: row.fileName })}
                      />
                    </td>
                  ) : null}
                  <td>
                    <div className={styles.accountCell}>
                      <strong>{row.accountLabel}</strong>
                      <span>{row.fileName}</span>
                    </div>
                  </td>
                  {isColumnVisible('provider') ? (
                    <td>
                      <span className={styles.providerPill}>{getProviderLabel(row.provider, t)}</span>
                    </td>
                  ) : null}
                  {isColumnVisible('plan') ? <td>{row.planType ?? '-'}</td> : null}
                  {isColumnVisible('status') ? (
                    <td>
                      <div className={styles.statusStack}>
                        <span className={`${styles.badge} ${row.disabled ? styles.badgeMuted : styles.badgeGood}`}>
                          {row.disabled ? t('accounts.status_disabled') : t('accounts.status_available')}
                        </span>
                        {row.statusMessage ? <small>{row.statusMessage}</small> : null}
                        {row.inspection && row.inspection.action !== 'keep' ? (
                          <small className={styles.inspectionHint}>
                            {t('accounts.inspection_action', {
                              action: t(`accounts.action_${row.inspection.action}`, {
                                defaultValue: row.inspection.action,
                              }),
                            })}
                          </small>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  {isColumnVisible('quota') ? (
                    <td>
                      <div className={styles.quotaCell}>
                        <div className={styles.quotaCellHeader}>
                          <span className={`${styles.badge} ${getQuotaStatusClass(row.quota.status)}`}>
                            {t(quotaStatusLabelKey(row.quota.status))}
                          </span>
                          <strong>{formatPercent(remaining)}</strong>
                        </div>
                        <div className={styles.quotaTrack} aria-hidden="true">
                          <span
                            className={`${styles.quotaBar} ${getRemainingBarClass(row)}`}
                            style={{ width: `${remaining ?? 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  ) : null}
                  {isColumnVisible('reset') ? <td>{row.quota.resetLabel}</td> : null}
                  {isColumnVisible('priority') ? (
                    <td>
                      <span className={row.priority !== null && row.priority < 0 ? styles.priorityBad : styles.priority}>
                        {row.priority ?? 0}
                      </span>
                    </td>
                  ) : null}
                  {isColumnVisible('value') ? <td>{formatMoney(recentTotal * 0.018)}</td> : null}
                  {isColumnVisible('recent') ? (
                    <td>
                      {recentTotal > 0 ? (
                        <span>
                          {t('accounts.recent_requests', {
                            count: recentTotal,
                            rate: formatPercent(row.usage.successRate),
                          })}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  ) : null}
                  <td onClick={(event) => event.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() => setSelectedRowKey(row.fileName)}
                      aria-label={t('accounts.open_detail', { name: row.fileName })}
                    >
                      <IconMoreVertical size={16} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rowsToRender.length === 0 ? (
        <EmptyState
          title={t('accounts.empty_title')}
          description={t('accounts.empty_desc')}
          action={
            <Button variant="secondary" onClick={() => void loadFiles()}>
              {t('common.refresh')}
            </Button>
          }
        />
      ) : null}
      {paged ? (
        <footer className={styles.pagination}>
          <span>
            {t('accounts.total_rows', {
              total: filteredRows.length,
            })}
          </span>
          <div className={styles.paginationControls}>
            <Select
              value={String(pageSize)}
              options={PAGE_SIZE_OPTIONS}
              onChange={(value) => setPageSize(Number(value))}
              ariaLabel={t('accounts.page_size')}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              {t('common.previous')}
            </Button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('common.next')}
            </Button>
          </div>
        </footer>
      ) : null}
    </section>
  );

  const renderDetailDrawer = () => {
    if (!selectedRow) return null;
    const detailTabs: Array<{ id: DetailTab; label: string }> = [
      { id: 'overview', label: t('accounts.detail_tab_overview') },
      { id: 'quota', label: t('accounts.detail_tab_quota') },
      { id: 'auth', label: t('accounts.detail_tab_auth') },
      { id: 'strategy', label: t('accounts.detail_tab_strategy') },
      { id: 'value', label: t('accounts.detail_tab_value') },
      { id: 'events', label: t('accounts.detail_tab_events') },
    ];
    const valueRow = usageRows.find(
      (row) => row.row?.fileName === selectedRow.fileName || row.fileName === selectedRow.fileName
    );
    const renderActiveDetail = () => {
      if (detailTab === 'quota') {
        return (
          <section className={styles.drawerSection}>
            <h3>{t('accounts.detail_quota_windows')}</h3>
            <dl>
              <div>
                <dt>{t('accounts.detail_status')}</dt>
                <dd>{t(quotaStatusLabelKey(selectedRow.quota.status))}</dd>
              </div>
              <div>
                <dt>{t('accounts.detail_used')}</dt>
                <dd>{formatPercent(selectedRow.quota.usedPercent)}</dd>
              </div>
              <div>
                <dt>{t('accounts.detail_reset')}</dt>
                <dd>{selectedRow.quota.resetLabel}</dd>
              </div>
              <div>
                <dt>{t('accounts.detail_source')}</dt>
                <dd>{selectedRow.quota.source}</dd>
              </div>
              {selectedRow.quota.error ? (
                <div>
                  <dt>{t('common.error')}</dt>
                  <dd>{selectedRow.quota.error}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        );
      }
      if (detailTab === 'auth') {
        return (
          <section className={styles.drawerSection}>
            <h3>{t('accounts.detail_auth_file')}</h3>
            <dl>
              <div>
                <dt>auth_index</dt>
                <dd>{selectedRow.authIndex || '-'}</dd>
              </div>
              <div>
                <dt>project_id</dt>
                <dd>{selectedRow.projectId || '-'}</dd>
              </div>
              <div>
                <dt>{t('accounts.col_provider')}</dt>
                <dd>{getProviderLabel(selectedRow.provider, t)}</dd>
              </div>
              <div>
                <dt>{t('common.status')}</dt>
                <dd>{selectedRow.disabled ? t('common.disabled') : t('common.enabled')}</dd>
              </div>
            </dl>
          </section>
        );
      }
      if (detailTab === 'strategy') {
        return (
          <section className={styles.drawerSection}>
            <h3>{t('accounts.detail_inspection')}</h3>
            {selectedRow.inspection ? (
              <dl>
                <div>
                  <dt>{t('common.action')}</dt>
                  <dd>{selectedRow.inspection.action}</dd>
                </div>
                <div>
                  <dt>HTTP</dt>
                  <dd>{selectedRow.inspection.statusCode ?? '-'}</dd>
                </div>
                <div>
                  <dt>{t('accounts.detail_reason')}</dt>
                  <dd>{selectedRow.inspection.actionReason || '-'}</dd>
                </div>
              </dl>
            ) : (
              <p>{inspectionLoading ? t('common.loading') : t('accounts.detail_no_inspection')}</p>
            )}
          </section>
        );
      }
      if (detailTab === 'value') {
        return (
          <section className={styles.drawerSection}>
            <h3>{t('accounts.value_title')}</h3>
            <dl>
              <div>
                <dt>{t('accounts.value_requests')}</dt>
                <dd>{valueRow ? formatCompactNumber(valueRow.requests) : '-'}</dd>
              </div>
              <div>
                <dt>{t('accounts.value_success_rate')}</dt>
                <dd>{valueRow ? formatPercent(valueRow.successRate, 1) : '-'}</dd>
              </div>
              <div>
                <dt>{t('accounts.value_estimated')}</dt>
                <dd>{valueRow ? formatMoney(valueRow.estimatedCost) : '-'}</dd>
              </div>
              <div>
                <dt>{t('accounts.value_source')}</dt>
                <dd>{valueRow ? t(`accounts.value_source_${valueRow.source}`) : '-'}</dd>
              </div>
            </dl>
          </section>
        );
      }
      if (detailTab === 'events') {
        return (
          <section className={styles.drawerSection}>
            <h3>{t('accounts.detail_event_log')}</h3>
            <p>{t('accounts.detail_event_log_desc')}</p>
          </section>
        );
      }
      return (
        <>
          <section className={styles.drawerSummary}>
            <div>
              <span>{t('accounts.detail_quota')}</span>
              <strong>{formatPercent(selectedRow.quota.remainingPercent)}</strong>
            </div>
            <div>
              <span>{t('common.priority')}</span>
              <strong>{selectedRow.priority ?? 0}</strong>
            </div>
            <div>
              <span>{t('accounts.detail_success_rate')}</span>
              <strong>{formatPercent(selectedRow.usage.successRate, 1)}</strong>
            </div>
          </section>
          <section className={styles.drawerSection}>
            <h3>{t('accounts.detail_status')}</h3>
            <p>
              {selectedRow.disabled
                ? t('accounts.detail_overview_disabled')
                : t('accounts.detail_overview_enabled')}
            </p>
          </section>
        </>
      );
    };

    return (
      <div className={styles.drawerBackdrop} onClick={() => setSelectedRowKey(null)}>
        <aside className={styles.drawer} onClick={(event) => event.stopPropagation()}>
          <header className={styles.drawerHeader}>
            <div>
              <strong>{selectedRow.accountLabel}</strong>
              <span>
                {selectedRow.provider} · {selectedRow.planType ?? '-'} · {selectedRow.fileName}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => setSelectedRowKey(null)}
              aria-label={t('common.close')}
            >
              <IconX size={18} />
            </Button>
          </header>
          <div className={styles.drawerTabs} role="tablist">
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={detailTab === tab.id}
                className={detailTab === tab.id ? styles.drawerTabActive : ''}
                onClick={() => setDetailTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {renderActiveDetail()}
          <footer className={styles.drawerActions}>
            <Button
              variant="secondary"
              onClick={() => refreshQuotaRows([selectedRow])}
              loading={quotaRefreshing}
            >
              <IconRefreshCw size={16} />
              {t('accounts.refresh_quota')}
            </Button>
            <Button
              variant={selectedRow.disabled ? 'secondary' : 'danger'}
              onClick={() => handleBatchStatus(selectedRow.disabled, [selectedRow])}
              disabled={statusUpdating || selectedRow.runtimeOnly}
            >
              {selectedRow.disabled ? t('accounts.enable') : t('accounts.disable')}
            </Button>
          </footer>
        </aside>
      </div>
    );
  };

  const renderMetrics = () => (
    <section className={styles.metricsGrid}>
      {renderMetricCard(
        'total',
        t('accounts.metric_total'),
        metrics.total,
        t('accounts.metric_total_meta'),
        <IconSlidersHorizontal size={24} />,
        'blue'
      )}
      {renderMetricCard(
        'available',
        t('accounts.metric_available'),
        metrics.available,
        t('accounts.metric_available_meta'),
        <IconCheck size={24} />,
        'green'
      )}
      {renderMetricCard(
        'low',
        t('accounts.metric_low'),
        metrics.lowQuota,
        t('accounts.metric_low_meta'),
        <IconShield size={24} />,
        'amber'
      )}
      {renderMetricCard(
        'disabled',
        t('accounts.metric_disabled'),
        metrics.disabled,
        t('accounts.metric_disabled_meta'),
        <IconX size={24} />,
        'red'
      )}
      {renderMetricCard(
        'value',
        t('accounts.metric_value'),
        formatMoney(estimatedWeeklyValue),
        t('accounts.metric_value_meta', {
          rate: formatPercent(metrics.successRate, 1),
        }),
        <IconDollarSign size={24} />,
        'violet'
      )}
    </section>
  );

  const renderAccountsOverview = () => (
    <>
      {renderMetrics()}
      {renderToolbar()}
      {error ? <div className={styles.errorBox}>{error}</div> : null}
      {loading ? (
        <div className={styles.loadingPanel}>
          <LoadingSpinner />
        </div>
      ) : (
        renderAccountTable()
      )}
      {renderDetailDrawer()}
    </>
  );

  const renderQuotaView = () => {
    const lowRows = rows.filter((row) => row.quota.status === 'low');
    const exhaustedRows = rows.filter((row) => row.quota.status === 'exhausted');
    const pendingRows = rows.filter((row) => row.quota.status === 'unknown' || row.quota.status === 'loading');
    const criticalRecommendations = recommendations.filter(
      (item) => getRecommendationRank(item.priority) >= getRecommendationRank('high')
    );
    const executableRecommendations = recommendations.filter((item) =>
      ['refresh', 'disable', 'enable', 'restore-default'].includes(item.action)
    );

    return (
      <>
        <section className={styles.metricsGrid}>
          {renderMetricCard('low-quota', t('accounts.metric_low'), lowRows.length, t('accounts.metric_low_meta'), <IconShield size={24} />, 'amber')}
          {renderMetricCard('exhausted', t('accounts.quota_metric_exhausted'), exhaustedRows.length, t('accounts.quota_metric_exhausted_meta'), <IconX size={24} />, 'red')}
          {renderMetricCard('pending', t('accounts.quota_metric_pending'), pendingRows.length, t('accounts.quota_metric_pending_meta'), <IconRefreshCw size={24} />, 'blue')}
          {renderMetricCard('recommend', t('accounts.quota_metric_recommend'), criticalRecommendations.length, t('accounts.quota_metric_recommend_meta'), <IconTrendingUp size={24} />, 'green')}
        </section>
        <section className={styles.splitGrid}>
          <div className={styles.tablePanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('accounts.quota_recommendations_title')}</h2>
                <p>{t('accounts.quota_recommendations_desc')}</p>
              </div>
              <div className={styles.headerActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => refreshQuotaRows(rows)}
                  loading={quotaRefreshing}
                >
                  <IconRefreshCw size={15} />
                  {t('accounts.refresh_quota')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={executeRecommendedActions}
                  loading={executingRecommendations}
                  disabled={executableRecommendations.length === 0}
                  title={
                    executableRecommendations.length === 0
                      ? t('accounts.no_executable_recommendations')
                      : undefined
                  }
                >
                  {t('accounts.execute_recommendations')}
                </Button>
              </div>
            </div>
            <div className={styles.tableScroller}>
              <table className={styles.compactTable}>
                <thead>
                  <tr>
                    <th>{t('accounts.col_account')}</th>
                    <th>{t('accounts.col_quota')}</th>
                    <th>{t('accounts.recommend_action')}</th>
                    <th>{t('accounts.recommend_priority')}</th>
                    <th>{t('accounts.detail_reason')}</th>
                    <th>{t('accounts.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((item) => (
                    <tr key={`${item.row.fileName}:${item.action}`}>
                      <td>
                        <div className={styles.accountCell}>
                          <strong>{item.row.accountLabel}</strong>
                          <span>{item.row.fileName}</span>
                        </div>
                      </td>
                      <td>{formatPercent(item.row.quota.remainingPercent)}</td>
                      <td>{t(getRecommendationActionLabelKey(item.action))}</td>
                      <td>
                        <span className={`${styles.badge} ${getRecommendationPriorityClass(item.priority)}`}>
                          {t(`accounts.recommend_priority_${item.priority}`)}
                        </span>
                      </td>
                      <td>{t(item.reasonKey)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void executeRecommendation(item)}
                        >
                          {t('common.execute')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recommendations.length === 0 ? (
              <EmptyState title={t('accounts.quota_no_recommendations')} description={t('accounts.quota_no_recommendations_desc')} />
            ) : null}
          </div>
          <aside className={styles.rulePanel}>
            <h2>{t('accounts.quota_rules_title')}</h2>
            <div className={styles.ruleList}>
              <div>
                <strong>{t('accounts.quota_rule_low_title')}</strong>
                <p>{t('accounts.quota_rule_low_desc')}</p>
              </div>
              <div>
                <strong>{t('accounts.quota_rule_exhausted_title')}</strong>
                <p>{t('accounts.quota_rule_exhausted_desc')}</p>
              </div>
              <div>
                <strong>{t('accounts.quota_rule_recovery_title')}</strong>
                <p>{t('accounts.quota_rule_recovery_desc')}</p>
              </div>
            </div>
          </aside>
        </section>
      </>
    );
  };

  const renderInspectionView = () => (
    <>
      <section className={styles.metricsGrid}>
        {renderMetricCard('last-run', t('accounts.inspection_metric_last'), latestRun ? `#${latestRun.id}` : '-', latestRun ? formatTimestamp(latestRun.startedAtMs, i18n.language) : t('accounts.detail_no_inspection'), <IconEye size={24} />, 'blue')}
        {renderMetricCard('disable', t('accounts.inspection_metric_disable'), inspectionResults.filter((item) => item.action === 'disable').length, t('accounts.inspection_metric_disable_meta'), <IconX size={24} />, 'red')}
        {renderMetricCard('enable', t('accounts.inspection_metric_enable'), inspectionResults.filter((item) => item.action === 'enable').length, t('accounts.inspection_metric_enable_meta'), <IconCheck size={24} />, 'green')}
        {renderMetricCard('reauth', t('accounts.inspection_metric_reauth'), inspectionResults.filter((item) => item.action === 'reauth').length, t('accounts.inspection_metric_reauth_meta'), <IconShield size={24} />, 'amber')}
      </section>
      <section className={styles.tablePanel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{t('accounts.inspection_latest_title')}</h2>
            <p>
              {featureAvailability.serverCodexInspectionAvailable
                ? t('accounts.inspection_latest_desc')
                : t('accounts.inspection_unavailable_desc')}
            </p>
          </div>
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/codex-inspection/server')}>
              <IconChevronRight size={15} />
              {t('accounts.open_server_inspection')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/codex-inspection')}>
              {t('accounts.open_local_inspection')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportInspection}
              disabled={inspectionResults.length === 0}
            >
              <IconDownload size={15} />
              {t('accounts.export_results')}
            </Button>
          </div>
        </div>
        {inspectionLoading ? (
          <div className={styles.loadingPanel}>
            <LoadingSpinner />
          </div>
        ) : inspectionResults.length > 0 ? (
          <div className={styles.tableScroller}>
            <table className={styles.compactTable}>
              <thead>
                <tr>
                  <th>{t('accounts.col_account')}</th>
                  <th>{t('accounts.col_status')}</th>
                  <th>HTTP</th>
                  <th>{t('accounts.recommend_action')}</th>
                  <th>{t('accounts.detail_reason')}</th>
                  <th>{t('accounts.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {inspectionResults.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className={styles.accountCell}>
                        <strong>{item.displayAccount || item.fileName}</strong>
                        <span>{item.fileName}</span>
                      </div>
                    </td>
                    <td>{item.disabled ? t('accounts.status_disabled') : t('accounts.status_available')}</td>
                    <td>{item.statusCode ?? '-'}</td>
                    <td>{t(`accounts.action_${item.action}`, { defaultValue: item.action })}</td>
                    <td>{item.actionReason || '-'}</td>
                    <td>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedRowKey(item.fileName);
                          setDetailTab('strategy');
                        }}
                      >
                        {t('accounts.open_detail_short')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              featureAvailability.serverCodexInspectionAvailable
                ? t('accounts.detail_no_inspection')
                : t('accounts.inspection_unavailable_title')
            }
            description={t('accounts.inspection_unavailable_desc')}
          />
        )}
      </section>
      {renderDetailDrawer()}
    </>
  );

  const renderOAuthView = () => (
    <section className={styles.oauthGrid}>
      <div className={styles.tablePanel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{t('accounts.oauth_rules_title')}</h2>
            <p>{t('accounts.oauth_rules_desc')}</p>
          </div>
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/auth-files/oauth-excluded')}>
              {t('accounts.open_oauth_excluded')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/auth-files/oauth-model-alias')}>
              {t('accounts.open_oauth_alias')}
            </Button>
          </div>
        </div>
        <div className={styles.ruleColumns}>
          <section>
            <h3>{t('accounts.oauth_excluded_title')}</h3>
            {Object.keys(oauthState.excluded).length > 0 ? (
              Object.entries(oauthState.excluded).map(([provider, models]) => (
                <div key={provider} className={styles.ruleRow}>
                  <strong>{getProviderLabel(provider, t)}</strong>
                  <span>{models.join(', ')}</span>
                  <Button variant="ghost" size="sm" onClick={() => oauthState.deleteExcluded(provider)}>
                    {t('common.delete')}
                  </Button>
                </div>
              ))
            ) : (
              <p className={styles.emptyText}>{t('accounts.oauth_no_excluded')}</p>
            )}
          </section>
          <section>
            <h3>{t('accounts.oauth_alias_title')}</h3>
            {Object.keys(oauthState.modelAlias).length > 0 ? (
              Object.entries(oauthState.modelAlias).map(([provider, mappings]) => (
                <div key={provider} className={styles.ruleRow}>
                  <strong>{getProviderLabel(provider, t)}</strong>
                  <span>
                    {mappings.map((item) => `${item.name} -> ${item.alias}`).join(', ')}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => oauthState.deleteModelAlias(provider)}>
                    {t('common.delete')}
                  </Button>
                </div>
              ))
            ) : (
              <p className={styles.emptyText}>{t('accounts.oauth_no_alias')}</p>
            )}
          </section>
        </div>
      </div>
      <aside className={styles.rulePanel}>
        <h2>{t('accounts.oauth_preview_title')}</h2>
        <Input
          value={oauthPreviewModel}
          onChange={(event) => setOauthPreviewModel(event.target.value)}
          placeholder={t('accounts.oauth_preview_placeholder')}
          aria-label={t('accounts.oauth_preview_title')}
        />
        <div className={styles.previewList}>
          {oauthPreviewRows.map((row) => (
            <div key={row.provider} className={styles.previewRow}>
              <strong>{getProviderLabel(row.provider, t)}</strong>
              <span>{row.effectiveModel || '-'}</span>
              <small>{t(row.explanationKey)}</small>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );

  const renderUsageTrend = () => {
    const points = usageTimeline.length > 0 ? usageTimeline : [];
    const maxCalls = Math.max(1, ...points.map((point) => point.calls));
    return (
      <div className={styles.trendChart} aria-label={t('accounts.value_trend')}>
        {points.length > 0 ? (
          points.map((point) => (
            <span
              key={`${point.bucket_ms}:${point.label}`}
              style={{ height: `${Math.max(8, (point.calls / maxCalls) * 100)}%` }}
              title={`${point.label}: ${point.calls}`}
            />
          ))
        ) : (
          <small>{t('accounts.value_trend_unavailable')}</small>
        )}
      </div>
    );
  };

  const renderValueView = () => (
    <>
      <section className={styles.metricsGrid}>
        {renderMetricCard('weekly-value', t('accounts.value_weekly'), formatMoney(valueSummary.weeklyValue), t(`accounts.value_source_${valueSummary.source}`), <IconDollarSign size={24} />, 'violet')}
        {renderMetricCard('historical-value', t('accounts.value_historical'), formatMoney(valueSummary.historicalValue), t('accounts.value_historical_meta'), <IconTrendingUp size={24} />, 'blue')}
        {renderMetricCard('high-value', t('accounts.value_high_accounts'), valueSummary.highValueAccounts, t('accounts.value_high_accounts_meta'), <IconCheck size={24} />, 'green')}
        {renderMetricCard('low-activity', t('accounts.value_low_accounts'), valueSummary.lowActivityAccounts, t('accounts.value_low_accounts_meta'), <IconShield size={24} />, 'amber')}
        {renderMetricCard('avg-success', t('accounts.value_avg_success'), formatPercent(valueSummary.averageSuccessRate, 1), t('accounts.value_avg_success_meta'), <IconEye size={24} />, 'blue')}
      </section>
      <section className={styles.valuePanel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{t('accounts.value_title')}</h2>
            <p>{usageError ? t('accounts.value_fallback_desc') : t('accounts.value_desc')}</p>
          </div>
          <div className={styles.headerActions}>
            <Select
              value={valueRange}
              options={VALUE_RANGE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              onChange={(value) => setValueRange(value as UsageValueRange)}
              ariaLabel={t('accounts.value_range')}
            />
            <Select
              value={valueProvider}
              options={[
                { value: 'all', label: t('accounts.filter_all') },
                ...valueProviderOptions.map((provider) => ({
                  value: provider,
                  label: getProviderLabel(provider, t),
                })),
              ]}
              onChange={setValueProvider}
              ariaLabel={t('accounts.provider_filter')}
            />
            <div className={styles.searchField}>
              <Input
                value={valueSearch}
                onChange={(event) => setValueSearch(event.target.value)}
                placeholder={t('accounts.search_placeholder')}
                rightElement={<IconSearch size={16} />}
                aria-label={t('accounts.search_label')}
              />
            </div>
          </div>
        </div>
        {usageLoading ? (
          <div className={styles.loadingPanel}>
            <LoadingSpinner />
          </div>
        ) : (
          <>
            {renderUsageTrend()}
            <div className={styles.tableScroller}>
              <table className={styles.compactTable}>
                <thead>
                  <tr>
                    <th>{t('accounts.col_account')}</th>
                    <th>{t('accounts.col_provider')}</th>
                    <th>{t('accounts.value_requests')}</th>
                    <th>{t('accounts.value_success_rate')}</th>
                    <th>{t('accounts.value_input_tokens')}</th>
                    <th>{t('accounts.value_output_tokens')}</th>
                    <th>{t('accounts.value_estimated')}</th>
                    <th>{t('accounts.value_recent')}</th>
                    <th>{t('accounts.value_rating')}</th>
                    <th>{t('accounts.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsageRows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <div className={styles.accountCell}>
                          <strong>{row.accountLabel}</strong>
                          <span>{row.fileName}</span>
                        </div>
                      </td>
                      <td>{getProviderLabel(row.provider, t)}</td>
                      <td>{formatCompactNumber(row.requests)}</td>
                      <td>{formatPercent(row.successRate, 1)}</td>
                      <td>{formatCompactNumber(row.inputTokens)}</td>
                      <td>{formatCompactNumber(row.outputTokens)}</td>
                      <td>{formatMoney(row.estimatedCost)}</td>
                      <td>{formatTimestamp(row.lastSeenMs, i18n.language)}</td>
                      <td>{t(`accounts.value_rating_${row.rating}`)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openUsageValueDetail(row)}
                          title={!row.row ? t('accounts.value_unmatched_detail') : undefined}
                          aria-label={
                            row.row
                              ? t('accounts.open_detail', { name: row.fileName })
                              : t('accounts.value_unmatched_detail')
                          }
                        >
                          {t('accounts.open_detail_short')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {renderDetailDrawer()}
    </>
  );

  const renderActiveView = () => {
    if (activeView === 'quota') return renderQuotaView();
    if (activeView === 'inspection') return renderInspectionView();
    if (activeView === 'oauth') return renderOAuthView();
    if (activeView === 'value') return renderValueView();
    return renderAccountsOverview();
  };

  return (
    <div className={styles.container} lang={i18n.language}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{t('accounts.title')}</h1>
          <p>{t('accounts.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={() => navigate('/auth-files')}>
            <IconCopy size={15} />
            {t('accounts.tab_auth_files')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/quota')}>
            <IconRefreshCw size={15} />
            {t('accounts.legacy_quota_entry')}
          </Button>
        </div>
      </header>
      {renderViewTabs()}
      {renderActiveView()}
    </div>
  );
}
