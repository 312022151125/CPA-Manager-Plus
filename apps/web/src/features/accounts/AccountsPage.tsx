import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { Select } from '@/components/ui/Select';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconDollarSign,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconFilter,
  IconMoreVertical,
  IconModelCluster,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconSettings,
  IconShield,
  IconSlidersHorizontal,
  IconTrash2,
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
import { useAntigravitySubscriptions } from '@/features/authFiles/hooks/useAntigravitySubscriptions';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { AuthJsonPasteModal } from '@/features/authFiles/components/AuthJsonPasteModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import {
  OAuthExcludedEditorModal,
  OAuthModelAliasEditorModal,
} from '@/features/authFiles/components/OAuthEditorModals';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { CodexReauthDialog } from '@/features/oauth/CodexReauthDialog';
import {
  createCodexReauthTargetFromAuthFile,
  type CodexReauthTarget,
} from '@/features/oauth/codexReauthModel';
import {
  buildAccountMetrics,
  buildAccountRows,
  filterAccountRows,
  getPlanOptions,
  getProviderOptions,
  sortAccountRows,
  type AccountQuotaBand,
  type AccountRow,
  type AccountRowSort,
  type AccountRowSortDirection,
  type AccountRowSortKey,
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
  buildAuthFileCodexInspectionMap,
  getAuthFilePatchTarget,
  getAuthFileCodexInspectionKeyForFile,
  getAuthFileCodexStatus,
  hasPartialSharedAuthFileSelection,
} from '@/features/authFiles/model/authFilesPageModel';
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
  monitoringAnalyticsApi,
  usageServiceApi,
  type CodexInspectionRun,
  type CodexInspectionResult,
  type MonitoringAnalyticsAccountStatRow,
  type MonitoringAnalyticsEventRow,
  type MonitoringAnalyticsTimelinePoint,
  type QuotaCooldownInfo,
} from '@/services/api';
import type {
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  KimiQuotaState,
  XaiQuotaState,
} from '@/types';
import type { AuthJsonInputType } from '@/features/authFiles/sessionAuthConverter';
import {
  DEFAULT_QUOTA_ACCOUNT_DISPLAY_MODE,
  type QuotaAccountDisplayMode,
} from '@/features/quota/quotaPageUiState';
import { maskQuotaAccountText } from '@/components/quota/quotaDisplay';
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
type SortableAccountColumn = Extract<AccountRowSortKey, 'reset' | 'priority' | 'recent'>;
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
const DETAIL_EVENTS_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
const DETAIL_EVENTS_LIMIT = 20;

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

const ACCOUNT_SORT_DEFAULT_DIRECTIONS: Record<
  SortableAccountColumn,
  AccountRowSortDirection
> = {
  reset: 'asc',
  priority: 'desc',
  recent: 'desc',
};

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

const formatDurationMs = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)} ms`;
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

const getReadableStatusMessage = (message: string, t: TFunction) => {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'unauthorized' || normalized === 'unauthenticated') {
    return t('accounts.status_message_unauthorized');
  }
  if (normalized === 'expired' || normalized === 'token_expired') {
    return t('accounts.status_message_expired');
  }
  return message;
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
    uploading,
    authJsonPasteSaving,
    deleting,
    batchFieldsUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    savePastedAuthJson,
    handleDelete,
    handleDownload,
    toggleSelect,
    selectAllVisible,
    deselectAll,
    batchDownload,
    batchSetStatus,
    batchPatchFields,
    batchDelete,
  } = useAuthFilesData();

  const [oauthViewMode, setOauthViewMode] = useState<'diagram' | 'list'>('list');
  const oauthState = useAuthFilesOauth({ viewMode: oauthViewMode, files });
  const {
    subscriptions: antigravitySubscriptions,
    refreshSubscription: refreshAntigravitySubscription,
  } = useAntigravitySubscriptions();
  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels();
  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    loadFiles,
  });

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
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [quotaBandFilter, setQuotaBandFilter] = useState<AccountQuotaBand>('all');
  const [search, setSearch] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<AccountColumn>>(
    () => new Set(['provider', 'plan', 'value'])
  );
  const [accountSort, setAccountSort] = useState<AccountRowSort>({
    key: 'default',
    direction: 'desc',
  });
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
  const [oauthExcludedEditorProvider, setOauthExcludedEditorProvider] = useState<string | null>(
    null
  );
  const [oauthModelAliasEditorProvider, setOauthModelAliasEditorProvider] = useState<string | null>(
    null
  );
  const [executingRecommendations, setExecutingRecommendations] = useState(false);
  const [authJsonPasteOpen, setAuthJsonPasteOpen] = useState(false);
  const [codexReauthTarget, setCodexReauthTarget] = useState<CodexReauthTarget | null>(null);
  const [detailEventsRowKey, setDetailEventsRowKey] = useState<string | null>(null);
  const [detailEvents, setDetailEvents] = useState<MonitoringAnalyticsEventRow[]>([]);
  const [detailEventsLoading, setDetailEventsLoading] = useState(false);
  const [detailEventsError, setDetailEventsError] = useState('');
  const [quotaCooldowns, setQuotaCooldowns] = useState<Map<string, QuotaCooldownInfo>>(
    () => new Map()
  );
  const [accountDisplayMode, setAccountDisplayMode] = useState<QuotaAccountDisplayMode>(
    DEFAULT_QUOTA_ACCOUNT_DISPLAY_MODE
  );
  const detailEventsRequestIdRef = useRef(0);

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

  const loadQuotaCooldowns = useCallback(async () => {
    if (!featureAvailability.managerServiceBase) {
      setQuotaCooldowns((current) => (current.size === 0 ? current : new Map()));
      return;
    }

    try {
      const items = await usageServiceApi.getActiveQuotaCooldowns(
        featureAvailability.managerServiceBase,
        managementKey
      );
      const next = new Map<string, QuotaCooldownInfo>();
      for (const item of items) {
        if (!item.authFileName) continue;
        const existing = next.get(item.authFileName);
        if (!existing || (item.recoverAtMs ?? 0) > (existing.recoverAtMs ?? 0)) {
          next.set(item.authFileName, item);
        }
      }
      setQuotaCooldowns(next);
    } catch {
      // Cooldown badges are a derived hint; keep the last known state on transient failures.
    }
  }, [featureAvailability.managerServiceBase, managementKey]);

  const loadOauthExcluded = oauthState.loadExcluded;
  const loadOauthModelAlias = oauthState.loadModelAlias;

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      loadFiles(),
      loadInspectionSummary(),
      loadQuotaCooldowns(),
      loadOauthExcluded(),
      loadOauthModelAlias(),
    ]);
  }, [
    loadFiles,
    loadInspectionSummary,
    loadOauthExcluded,
    loadOauthModelAlias,
    loadQuotaCooldowns,
  ]);

  useHeaderRefresh(handleRefresh);

  useEffect(() => {
    void handleRefresh();
  }, [handleRefresh]);

  const handleSavePastedAuthJson = useCallback(
    async (type: AuthJsonInputType, fileName: string, jsonText: string) => {
      await savePastedAuthJson(type, fileName, jsonText);
      setAuthJsonPasteOpen(false);
    },
    [savePastedAuthJson]
  );

  const handleCodexReauthSuccess = useCallback(async () => {
    await loadFiles();
    setCodexReauthTarget(null);
  }, [loadFiles]);

  const rows = useMemo(
    () => buildAccountRows(files, quotaStores, inspectionResults),
    [files, inspectionResults, quotaStores]
  );
  const codexInspectionMap = useMemo(
    () =>
      buildAuthFileCodexInspectionMap(
        inspectionResults.map((item) => ({
          fileName: item.fileName,
          authIndex: item.authIndex ?? null,
          statusCode: item.statusCode ?? null,
          action: item.action ?? null,
          usedPercent: item.usedPercent ?? null,
          isQuota: item.isQuota ?? null,
        }))
      ),
    [inspectionResults]
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
        }),
        accountSort
      ),
    [accountSort, planFilter, providerFilter, quotaBandFilter, rows, search, statusFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedFiles.has(row.selectionKey)),
    [rows, selectedFiles]
  );
  const selectedFileNames = useMemo(
    () =>
      Array.from(
        new Set(selectedRows.filter((row) => !row.runtimeOnly).map((row) => row.fileName))
      ),
    [selectedRows]
  );
  const selectedHasPartialSharedAuthFile = useMemo(
    () => hasPartialSharedAuthFileSelection(files, selectedFiles),
    [files, selectedFiles]
  );
  const selectedCodexRows = useMemo(
    () => selectedRows.filter((row) => !row.runtimeOnly && row.provider === CODEX_CONFIG.type),
    [selectedRows]
  );
  const selectedRow = useMemo(
    () => rows.find((row) => row.selectionKey === selectedRowKey) ?? null,
    [rows, selectedRowKey]
  );
  const selectablePageRows = pageRows.filter((row) => !row.runtimeOnly);
  const allPageSelected =
    selectablePageRows.length > 0 &&
    selectablePageRows.every((row) => selectedFiles.has(row.selectionKey));
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
  const getDisplayText = useCallback(
    (value: string) => (accountDisplayMode === 'full' ? value : maskQuotaAccountText(value)),
    [accountDisplayMode]
  );
  const getDisplayAccount = useCallback(
    (row: AccountRow) => getDisplayText(row.accountLabel),
    [getDisplayText]
  );
  const getDisplayFileName = useCallback(
    (fileName: string) => getDisplayText(fileName),
    [getDisplayText]
  );
  const getQuotaSubtext = useCallback(
    (row: AccountRow) => {
      if (row.disabled) return t('accounts.quota_subtext_account_disabled');
      if (row.quota.status === 'unknown') {
        return row.quota.source === 'none'
          ? t('accounts.quota_subtext_no_cache')
          : t('accounts.quota_subtext_pending');
      }
      if (row.quota.status === 'loading') return t('accounts.quota_subtext_loading');
      if (row.quota.status === 'error') {
        return row.quota.error
          ? t('accounts.quota_subtext_error', { message: row.quota.error })
          : t('accounts.quota_subtext_error_unknown');
      }
      if (row.quota.usedPercent !== null) {
        return t('accounts.quota_subtext_used', {
          percent: formatPercent(row.quota.usedPercent),
        });
      }
      return '';
    },
    [t]
  );
  const accountDisplayHint = t(
    accountDisplayMode === 'masked'
      ? 'quota_management.show_full_credentials_hint'
      : 'quota_management.show_masked_credentials_hint'
  );
  const AccountDisplayIcon = accountDisplayMode === 'masked' ? IconEyeOff : IconEye;
  const getCodexStatusForRow = useCallback(
    (row: AccountRow) =>
      getAuthFileCodexStatus(
        row.raw,
        codexQuota[row.fileName],
        codexInspectionMap.get(getAuthFileCodexInspectionKeyForFile(row.raw))
      ),
    [codexInspectionMap, codexQuota]
  );
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

  const loadDetailEvents = useCallback(
    async (row: AccountRow) => {
      const requestId = detailEventsRequestIdRef.current + 1;
      detailEventsRequestIdRef.current = requestId;
      const shouldCommit = () => detailEventsRequestIdRef.current === requestId;

      setDetailEventsRowKey(row.selectionKey);
      setDetailEvents([]);
      setDetailEventsError('');

      if (
        featureAvailability.checking ||
        !featureAvailability.requestMonitoringAvailable ||
        !featureAvailability.managerServiceBase ||
        !managementKey
      ) {
        setDetailEventsLoading(false);
        return;
      }

      setDetailEventsLoading(true);
      try {
        const toMs = Date.now();
        const authIndex = row.authIndex ? String(row.authIndex) : '';
        const response = await monitoringAnalyticsApi.getAnalytics(
          featureAvailability.managerServiceBase,
          managementKey,
          {
            from_ms: toMs - DETAIL_EVENTS_RANGE_MS,
            to_ms: toMs,
            now_ms: toMs,
            filters: {
              auth_files: [row.fileName],
              ...(authIndex ? { auth_indices: [authIndex] } : {}),
            },
            include: {
              events_page: {
                limit: DETAIL_EVENTS_LIMIT,
                before_ms: null,
                before_id: null,
              },
              granularity: 'day',
            },
          }
        );
        if (!shouldCommit()) return;
        setDetailEvents(response.events?.items ?? []);
      } catch (err: unknown) {
        if (!shouldCommit()) return;
        setDetailEventsError(err instanceof Error ? err.message : t('notification.load_failed'));
      } finally {
        if (shouldCommit()) {
          setDetailEventsLoading(false);
        }
      }
    },
    [
      featureAvailability.checking,
      featureAvailability.managerServiceBase,
      featureAvailability.requestMonitoringAvailable,
      managementKey,
      t,
    ]
  );

  useEffect(() => {
    if (detailTab !== 'events' || !selectedRow) return;
    void loadDetailEvents(selectedRow);
  }, [detailTab, loadDetailEvents, selectedRow]);

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
          return refreshQuotaWithConfig<
            ClaudeQuotaState,
            {
              windows: ClaudeQuotaState['windows'];
              extraUsage?: ClaudeQuotaState['extraUsage'];
              planType?: string | null;
            }
          >({
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
    [setAntigravityQuota, setClaudeQuota, setCodexQuota, setKimiQuota, setXaiQuota, t]
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

  const canResetCodexQuota = useCallback(
    (row: AccountRow) => {
      if (row.provider !== CODEX_CONFIG.type || row.disabled || row.runtimeOnly) return false;
      return CODEX_CONFIG.canResetQuota?.(row.raw, codexQuota[row.fileName]) === true;
    },
    [codexQuota]
  );

  const resetCodexQuotaForRow = useCallback(
    (row: AccountRow) => {
      if (!canResetCodexQuota(row) || !CODEX_CONFIG.resetQuota) return;
      const quota = codexQuota[row.fileName];
      const resetCount = quota?.rateLimitResetCreditsAvailableCount ?? 0;
      const displayName = getDisplayAccount(row);

      showConfirmation({
        title: t('codex_quota.reset_confirm_title'),
        message: t('codex_quota.reset_confirm_message', {
          name: displayName,
          count: resetCount,
        }),
        confirmText: t('codex_quota.reset_button', { count: resetCount }),
        cancelText: t('common.cancel'),
        variant: 'primary',
        onConfirm: async () => {
          setCodexQuota((prev) => ({
            ...prev,
            [row.fileName]: CODEX_CONFIG.buildLoadingState(),
          }));

          try {
            const data = await CODEX_CONFIG.resetQuota?.(row.raw, t);
            if (data === undefined) {
              throw new Error(t('common.unknown_error'));
            }
            setCodexQuota((prev) => ({
              ...prev,
              [row.fileName]: CODEX_CONFIG.buildSuccessState(data),
            }));
            showNotification(t('codex_quota.reset_success', { name: displayName }), 'success');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('common.unknown_error');
            const status =
              typeof err === 'object' && err !== null && 'status' in err
                ? Number((err as { status?: unknown }).status)
                : undefined;
            setCodexQuota((prev) => ({
              ...prev,
              [row.fileName]: CODEX_CONFIG.buildErrorState(
                message,
                Number.isFinite(status) ? status : undefined
              ) as CodexQuotaState,
            }));
            showNotification(
              t('codex_quota.reset_failed', { name: displayName, message }),
              'error'
            );
          }
        },
      });
    },
    [
      canResetCodexQuota,
      codexQuota,
      getDisplayAccount,
      setCodexQuota,
      showConfirmation,
      showNotification,
      t,
    ]
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
      const patchTargets = targets
        .filter((row) => !row.runtimeOnly)
        .map((row) => getAuthFilePatchTarget(row.raw));
      await batchPatchFields(patchTargets, { priority });
    },
    [batchPatchFields]
  );

  const patchWebsocketsRows = useCallback(
    async (targets: AccountRow[], websockets: boolean) => {
      const patchTargets = targets
        .filter((row) => !row.runtimeOnly && row.provider === CODEX_CONFIG.type)
        .map((row) => getAuthFilePatchTarget(row.raw));
      if (patchTargets.length === 0) {
        showNotification(t('accounts.no_codex_accounts_selected'), 'info');
        return;
      }
      await batchPatchFields(patchTargets, { websockets });
    },
    [batchPatchFields, showNotification, t]
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
        setCodexReauthTarget(createCodexReauthTargetFromAuthFile(item.row.raw));
      } else {
        setSelectedRowKey(item.row.selectionKey);
        setDetailTab('strategy');
      }
    },
    [handleBatchStatus, patchPriorityRows, refreshQuotaRows]
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
    setSelectedRowKey(targetRow.selectionKey);
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

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const openOauthExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (providerFilter !== 'all' ? providerFilter : '')).trim();
      setOauthExcludedEditorProvider(providerValue);
    },
    [providerFilter]
  );

  const openOauthModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (providerFilter !== 'all' ? providerFilter : '')).trim();
      setOauthModelAliasEditorProvider(providerValue);
    },
    [providerFilter]
  );

  const reloadOauthRules = useCallback(async () => {
    await Promise.all([loadOauthExcluded(), loadOauthModelAlias()]);
  }, [loadOauthExcluded, loadOauthModelAlias]);

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

  const handleAccountSort = (key: SortableAccountColumn) => {
    setAccountSort((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key,
        direction: ACCOUNT_SORT_DEFAULT_DIRECTIONS[key],
      };
    });
    setPage(1);
  };

  const renderSortableHeader = (key: SortableAccountColumn, labelKey: string) => {
    const isActive = accountSort.key === key;
    const SortIcon = isActive
      ? accountSort.direction === 'desc'
        ? IconChevronDown
        : IconChevronUp
      : null;

    return (
      <th
        aria-sort={
          isActive ? (accountSort.direction === 'desc' ? 'descending' : 'ascending') : 'none'
        }
      >
        <button
          type="button"
          className={[
            styles.sortableHeaderButton,
            isActive ? styles.sortableHeaderButtonActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => handleAccountSort(key)}
        >
          <span>{t(labelKey)}</span>
          <span className={styles.sortIndicator} aria-hidden="true">
            {SortIcon ? <SortIcon size={14} /> : null}
          </span>
        </button>
      </th>
    );
  };

  const renderMetricCard = (
    key: string,
    label: string,
    value: string | number,
    meta: string,
    icon: ReactNode,
    tone: 'blue' | 'green' | 'amber' | 'red' | 'violet' = 'blue'
  ) => (
    <section key={key} className={`${styles.metricCard} ${styles[`metricCard${tone}`]}`}>
      <div className={`${styles.metricIcon} ${styles[`metricIcon${tone}`]}`}>{icon}</div>
      <div className={styles.metricBody}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </section>
  );

  const renderViewTabs = () => {
    const tabs: Array<SegmentedTabItem<AccountsView> & { badge?: number }> = [
      { id: 'accounts', label: t('accounts.tab_accounts') },
      { id: 'quota', label: t('accounts.tab_quota'), badge: recommendations.length },
      {
        id: 'inspection',
        label: t('accounts.tab_inspection'),
        badge: metrics.needsInspectionAction,
      },
      { id: 'oauth', label: t('accounts.tab_oauth') },
      { id: 'value', label: t('accounts.tab_value') },
    ];
    return (
      <SegmentedTabs
        items={tabs.map((tab) => ({
          id: tab.id,
          label: (
            <span className={styles.tabLabel}>
              <span>{tab.label}</span>
              {tab.badge ? <small className={styles.tabBadge}>{tab.badge}</small> : null}
            </span>
          ),
        }))}
        activeTab={activeView}
        onChange={setActiveView}
        ariaLabel={t('accounts.tabs_label')}
        idBase="accounts-tab"
        className={styles.tabs}
      />
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
      <div className={styles.filterField}>
        <span>{t('accounts.col_provider')}</span>
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
      </div>
      <div className={styles.filterField}>
        <span>{t('accounts.col_status')}</span>
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
      </div>
      <div className={styles.filterField}>
        <span>{t('accounts.col_plan')}</span>
        <Select
          value={planFilter}
          options={[
            { value: 'all', label: t('accounts.plan_all') },
            ...planOptions.map((plan) => ({ value: plan, label: plan })),
          ]}
          onChange={setPlanFilter}
          ariaLabel={t('accounts.plan_filter')}
        />
      </div>
      <div className={styles.filterField}>
        <span>{t('accounts.col_quota')}</span>
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
      </div>
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

  const renderAccountDisplayToggle = () => (
    <Button
      variant="secondary"
      size="sm"
      className={[
        styles.accountDisplayButton,
        accountDisplayMode === 'full' ? styles.accountDisplayButtonActive : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => setAccountDisplayMode((mode) => (mode === 'masked' ? 'full' : 'masked'))}
      title={accountDisplayHint}
      aria-label={accountDisplayHint}
    >
      <AccountDisplayIcon size={15} />
      {t(
        accountDisplayMode === 'masked'
          ? 'quota_management.account_display_masked'
          : 'quota_management.account_display_full'
      )}
    </Button>
  );

  const renderBatchBar = () => {
    const hasSelection = selectionCount > 0;
    const refreshTargets = hasSelection ? selectedRows : rows;

    return (
      <section className={styles.batchBar}>
        <div className={styles.batchSummary}>
          <span>
            {t('accounts.selected_count', {
              count: selectionCount,
            })}
          </span>
          {!hasSelection ? <small>{t('accounts.batch_hint')}</small> : null}
        </div>
        <div className={styles.batchActions}>
          {renderAccountDisplayToggle()}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refreshQuotaRows(refreshTargets)}
            disabled={quotaRefreshing || refreshTargets.length === 0}
            loading={quotaRefreshing}
            title={t('accounts.refresh_quota')}
          >
            <IconRefreshCw size={15} />
            {t('accounts.refresh_quota')}
          </Button>
          {hasSelection ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleBatchStatus(true)}
                disabled={disableControls || statusUpdating}
                title={t('accounts.enable')}
              >
                <IconCheck size={15} />
                {t('accounts.enable')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleBatchStatus(false)}
                disabled={disableControls || statusUpdating}
                title={t('accounts.disable')}
              >
                <IconX size={15} />
                {t('accounts.disable')}
              </Button>
            </>
          ) : null}
        </div>
      </section>
    );
  };

  const renderFloatingBatchActions = () => {
    if (selectionCount === 0) return null;

    const content = (
      <div className={styles.floatingBatchActionContainer}>
        <div className={styles.floatingBatchActionBar}>
          <div className={styles.floatingBatchActionLeft}>
            <span className={styles.batchSelectionText}>
              {t('accounts.selected_count', {
                count: selectionCount,
              })}
            </span>
            <Button variant="ghost" size="sm" onClick={deselectAll}>
              {t('auth_files.batch_deselect')}
            </Button>
          </div>
          <div className={styles.floatingBatchActionRight}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refreshQuotaRows(selectedRows)}
              disabled={quotaRefreshing || selectedRows.length === 0}
              loading={quotaRefreshing}
              title={t('accounts.refresh_quota')}
            >
              <IconRefreshCw size={15} />
              {t('accounts.refresh_quota')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleBatchStatus(true)}
              disabled={disableControls || statusUpdating}
              title={t('accounts.enable')}
            >
              <IconCheck size={15} />
              {t('accounts.enable')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleBatchStatus(false)}
              disabled={disableControls || statusUpdating}
              title={t('accounts.disable')}
            >
              <IconX size={15} />
              {t('accounts.disable')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void batchDownload(selectedFileNames)}
              disabled={disableControls || selectedFileNames.length === 0}
              title={t('auth_files.batch_download')}
            >
              <IconDownload size={15} />
              {t('auth_files.batch_download')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void patchWebsocketsRows(selectedRows, true)}
              disabled={disableControls || selectedCodexRows.length === 0 || batchFieldsUpdating}
              loading={batchFieldsUpdating}
              title={t('auth_files.batch_websockets_enable')}
            >
              {t('auth_files.batch_websockets_enable')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void patchWebsocketsRows(selectedRows, false)}
              disabled={disableControls || selectedCodexRows.length === 0 || batchFieldsUpdating}
              title={t('auth_files.batch_websockets_disable')}
            >
              {t('auth_files.batch_websockets_disable')}
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
              disabled={disableControls || batchFieldsUpdating}
              loading={batchFieldsUpdating}
              onClick={() => patchPriorityRows(selectedRows, Number(priorityDraft))}
              title={t('accounts.set_priority')}
            >
              {t('accounts.set_priority')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disableControls || batchFieldsUpdating}
              onClick={() => patchPriorityRows(selectedRows, 0)}
              title={t('accounts.restore_default')}
            >
              {t('accounts.restore_default')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={
                disableControls ||
                selectedFileNames.length === 0 ||
                selectedHasPartialSharedAuthFile
              }
              onClick={() => {
                if (selectedHasPartialSharedAuthFile) return;
                batchDelete(selectedFileNames);
              }}
              title={t('common.delete')}
            >
              <IconTrash2 size={15} />
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </div>
    );

    return typeof document === 'undefined' ? content : createPortal(content, document.body);
  };

  const getAntigravityPlanLabel = (plan: string | null | undefined, fallback?: string | null) => {
    if (plan === 'free') return t('antigravity_subscription.plan_free');
    if (plan === 'pro') return t('antigravity_subscription.plan_pro');
    if (plan === 'ultra') return t('antigravity_subscription.plan_ultra');
    if (plan === 'ultra-lite') return t('antigravity_subscription.plan_ultra_lite');
    return fallback || plan || t('antigravity_subscription.plan_unknown');
  };

  const renderRowGovernanceBadges = (row: AccountRow) => {
    const codexStatus = getCodexStatusForRow(row);
    const quotaCooldown = quotaCooldowns.get(row.fileName);
    const antigravitySubscription = antigravitySubscriptions[row.fileName];
    const badges: ReactNode[] = [];

    codexStatus.badges.forEach((badge) => {
      const label = t(badge.labelKey, {
        defaultValue: badge.defaultLabel,
        ...badge.labelParams,
      });
      const title = badge.titleKey
        ? t(badge.titleKey, {
            defaultValue: badge.defaultTitle ?? badge.defaultLabel,
            ...badge.labelParams,
          })
        : (badge.defaultTitle ?? label);
      badges.push(
        <span
          key={`codex-${badge.kind}`}
          className={`${styles.statusBadge} ${styles[`statusBadge${badge.tone}`]}`}
          title={title}
        >
          {label}
        </span>
      );
    });

    if (quotaCooldown) {
      badges.push(
        <span
          key="quota-cooldown"
          className={`${styles.statusBadge} ${styles.statusBadgeinfo}`}
          title={t('auth_files.quota_cooldown_badge_title', {
            recoverAt: formatTimestamp(quotaCooldown.recoverAtMs, i18n.language),
            owner: quotaCooldown.owner || 'cpamp_usage_429',
          })}
        >
          {t('auth_files.quota_cooldown_badge', {
            recoverAt: formatTimestamp(quotaCooldown.recoverAtMs, i18n.language),
          })}
        </span>
      );
    }

    if (row.provider === ANTIGRAVITY_CONFIG.type && !row.runtimeOnly) {
      if (!antigravitySubscription) {
        badges.push(
          <button
            key="antigravity-refresh"
            type="button"
            className={styles.statusBadgeButton}
            onClick={(event) => {
              event.stopPropagation();
              void refreshAntigravitySubscription(row.raw);
            }}
            disabled={disableControls}
          >
            {t('antigravity_subscription.refresh_short')}
          </button>
        );
      } else if (antigravitySubscription.status === 'loading') {
        badges.push(
          <span
            key="antigravity-loading"
            className={`${styles.statusBadge} ${styles.statusBadgeinfo}`}
          >
            {t('antigravity_subscription.loading_short')}
          </span>
        );
      } else if (antigravitySubscription.status === 'error') {
        badges.push(
          <span
            key="antigravity-error"
            className={`${styles.statusBadge} ${styles.statusBadgedanger}`}
            title={antigravitySubscription.error || t('common.unknown_error')}
          >
            {t('antigravity_subscription.error_badge')}
          </span>
        );
      } else if (antigravitySubscription.data) {
        const planLabel = getAntigravityPlanLabel(
          antigravitySubscription.data.plan,
          antigravitySubscription.data.tierName || antigravitySubscription.data.tierId
        );
        badges.push(
          <span
            key="antigravity-plan"
            className={`${styles.statusBadge} ${styles.statusBadgeinfo}`}
            title={antigravitySubscription.data.tierName || planLabel}
          >
            {t('antigravity_subscription.plan_badge', { plan: planLabel })}
          </span>
        );
      }
    }

    return badges.length > 0 ? <div className={styles.statusBadgeRow}>{badges}</div> : null;
  };

  const buildRowMenuItems = (row: AccountRow): DropdownMenuItem[] => [
    {
      key: 'models',
      label: t('auth_files.models_button'),
      icon: <IconModelCluster size={15} />,
      onClick: () => void showModels(row.raw),
      disabled: row.runtimeOnly,
    },
    {
      key: 'prefix-proxy',
      label: t('auth_files.prefix_proxy_button'),
      icon: <IconSettings size={15} />,
      onClick: () => void openPrefixProxyEditor(row.raw),
      disabled: disableControls || row.runtimeOnly,
    },
    ...(canResetCodexQuota(row)
      ? [
          {
            key: 'reset-quota',
            label: t('codex_quota.reset_action_button'),
            icon: <IconRefreshCw size={15} />,
            onClick: () => resetCodexQuotaForRow(row),
          } satisfies DropdownMenuItem,
        ]
      : []),
    row.disabled
      ? {
          key: 'enable',
          label: t('accounts.enable'),
          icon: <IconCheck size={15} />,
          onClick: () => void handleBatchStatus(true, [row]),
          disabled: disableControls || statusUpdating || row.runtimeOnly,
        }
      : {
          key: 'disable',
          label: t('accounts.disable'),
          icon: <IconX size={15} />,
          onClick: () => void handleBatchStatus(false, [row]),
          disabled: disableControls || statusUpdating || row.runtimeOnly,
          tone: 'danger',
        },
    {
      key: 'download',
      label: t('auth_files.download_button'),
      icon: <IconDownload size={15} />,
      onClick: () => void handleDownload(row.fileName),
      disabled: row.runtimeOnly,
    },
    {
      key: 'delete',
      label: t('auth_files.delete_button'),
      icon: <IconTrash2 size={15} />,
      onClick: () => handleDelete(row.fileName),
      disabled: disableControls || row.runtimeOnly || deleting === row.fileName,
      tone: 'danger',
    },
  ];

  const renderRowActions = (row: AccountRow) => (
    <div className={styles.rowActions}>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={() => setSelectedRowKey(row.selectionKey)}
        title={t('accounts.open_detail', { name: row.fileName })}
        aria-label={t('accounts.open_detail', { name: row.fileName })}
      >
        <IconChevronRight size={16} />
      </Button>
      <DropdownMenu
        items={buildRowMenuItems(row)}
        ariaLabel={t('accounts.col_actions')}
        triggerIcon={<IconMoreVertical size={16} />}
        triggerClassName={styles.rowActionMenu}
      />
    </div>
  );

  const renderPagination = () => (
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
  );

  const renderAccountTable = (rowsToRender = pageRows, paged = true) => (
    <section className={styles.tablePanel}>
      {paged ? renderBatchBar() : null}
      <div className={styles.tableScroller}>
        <table className={styles.accountTable}>
          <colgroup>
            {paged ? <col className={styles.colSelect} /> : null}
            <col className={styles.colAccount} />
            {isColumnVisible('provider') ? <col className={styles.colProvider} /> : null}
            {isColumnVisible('plan') ? <col className={styles.colPlan} /> : null}
            {isColumnVisible('status') ? <col className={styles.colStatus} /> : null}
            {isColumnVisible('quota') ? <col className={styles.colQuota} /> : null}
            {isColumnVisible('reset') ? <col className={styles.colReset} /> : null}
            {isColumnVisible('priority') ? <col className={styles.colPriority} /> : null}
            {isColumnVisible('value') ? <col className={styles.colValue} /> : null}
            {isColumnVisible('recent') ? <col className={styles.colRecent} /> : null}
            <col className={styles.colActions} />
          </colgroup>
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
                        if (selectedFiles.has(row.selectionKey)) {
                          toggleSelect(row.selectionKey);
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
              {isColumnVisible('reset')
                ? renderSortableHeader('reset', 'accounts.col_reset')
                : null}
              {isColumnVisible('priority')
                ? renderSortableHeader('priority', 'accounts.col_priority')
                : null}
              {isColumnVisible('value') ? <th>{t('accounts.col_value')}</th> : null}
              {isColumnVisible('recent')
                ? renderSortableHeader('recent', 'accounts.col_recent')
                : null}
              <th>{t('accounts.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rowsToRender.map((row) => {
              const remaining = row.quota.remainingPercent;
              const recentTotal = row.usage.success + row.usage.failure;
              const readableStatusMessage = getReadableStatusMessage(row.statusMessage, t);
              const quotaSubtext = getQuotaSubtext(row);
              return (
                <tr
                  key={row.selectionKey}
                  className={selectedRowKey === row.selectionKey ? styles.rowSelected : ''}
                  onClick={() => setSelectedRowKey(row.selectionKey)}
                >
                  {paged ? (
                    <td className={styles.selectCol} onClick={(event) => event.stopPropagation()}>
                      <SelectionCheckbox
                        checked={selectedFiles.has(row.selectionKey)}
                        onChange={() => toggleSelect(row.selectionKey)}
                        disabled={row.runtimeOnly}
                        ariaLabel={t('accounts.select_account', { name: row.fileName })}
                      />
                    </td>
                  ) : null}
                  <td>
                    <div className={styles.accountCell}>
                      <strong title={row.accountLabel}>{getDisplayAccount(row)}</strong>
                      <span title={row.fileName}>{getDisplayFileName(row.fileName)}</span>
                    </div>
                  </td>
                  {isColumnVisible('provider') ? (
                    <td>
                      <span className={styles.providerPill}>
                        {getProviderLabel(row.provider, t)}
                      </span>
                    </td>
                  ) : null}
                  {isColumnVisible('plan') ? <td>{row.planType ?? '-'}</td> : null}
                  {isColumnVisible('status') ? (
                    <td>
                      <div className={styles.statusStack}>
                        <span
                          className={`${styles.badge} ${row.disabled ? styles.badgeMuted : styles.badgeGood}`}
                        >
                          {row.disabled
                            ? t('accounts.status_disabled')
                            : t('accounts.status_available')}
                        </span>
                        {readableStatusMessage ? (
                          <small title={row.statusMessage}>{readableStatusMessage}</small>
                        ) : null}
                        {row.inspection && row.inspection.action !== 'keep' ? (
                          <small className={styles.inspectionHint}>
                            {t('accounts.inspection_action', {
                              action: t(`accounts.action_${row.inspection.action}`, {
                                defaultValue: row.inspection.action,
                              }),
                            })}
                          </small>
                        ) : null}
                        {renderRowGovernanceBadges(row)}
                      </div>
                    </td>
                  ) : null}
                  {isColumnVisible('quota') ? (
                    <td>
                      <div className={styles.quotaCell}>
                        <div className={styles.quotaCellHeader}>
                          <span
                            className={`${styles.badge} ${getQuotaStatusClass(row.quota.status)}`}
                          >
                            {t(quotaStatusLabelKey(row.quota.status))}
                          </span>
                          <strong>{formatPercent(remaining)}</strong>
                        </div>
                        {quotaSubtext ? (
                          <small className={styles.quotaSubtext} title={quotaSubtext}>
                            {quotaSubtext}
                          </small>
                        ) : null}
                        {remaining !== null ? (
                          <div className={styles.quotaTrack} aria-hidden="true">
                            <span
                              className={`${styles.quotaBar} ${getRemainingBarClass(row)}`}
                              style={{ width: `${remaining}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  {isColumnVisible('reset') ? <td>{row.quota.resetLabel}</td> : null}
                  {isColumnVisible('priority') ? (
                    <td>
                      <span
                        className={
                          row.priority !== null && row.priority < 0
                            ? styles.priorityBad
                            : styles.priority
                        }
                      >
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
                  <td onClick={(event) => event.stopPropagation()}>{renderRowActions(row)}</td>
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
      {paged ? renderPagination() : null}
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
    const selectedCodexQuota =
      selectedRow.provider === CODEX_CONFIG.type ? codexQuota[selectedRow.fileName] : undefined;
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
              {typeof selectedCodexQuota?.rateLimitResetCreditsAvailableCount === 'number' ? (
                <div>
                  <dt>{t('codex_quota.reset_credits_label')}</dt>
                  <dd>{selectedCodexQuota.rateLimitResetCreditsAvailableCount}</dd>
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
        const requests =
          valueRow?.requests ?? selectedRow.usage.success + selectedRow.usage.failure;
        const successRate = valueRow?.successRate ?? selectedRow.usage.successRate;
        const inputTokens = valueRow?.inputTokens ?? 0;
        const outputTokens = valueRow?.outputTokens ?? 0;
        const totalTokens = inputTokens + outputTokens;
        const estimatedCost = valueRow?.estimatedCost ?? requests * 0.018;
        const quotaRemaining = selectedRow.quota.remainingPercent;
        const quotaWidth = Math.max(0, Math.min(100, quotaRemaining ?? 0));

        return (
          <div className={styles.drawerUsageStack}>
            <section className={styles.drawerUsagePanel}>
              <div className={styles.drawerUsageHeader}>
                <div>
                  <h3>{t('accounts.value_title')}</h3>
                  <p>
                    {valueRow
                      ? t(`accounts.value_source_${valueRow.source}`)
                      : t('accounts.value_source_recent')}
                  </p>
                </div>
                <strong>{formatMoney(estimatedCost)}</strong>
              </div>
              <div className={styles.drawerUsageMetricGrid}>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_requests')}</span>
                  <strong>{formatCompactNumber(requests)}</strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_success_rate')}</span>
                  <strong>{formatPercent(successRate, 1)}</strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_input_tokens')}</span>
                  <strong>{inputTokens > 0 ? formatCompactNumber(inputTokens) : '-'}</strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_output_tokens')}</span>
                  <strong>{outputTokens > 0 ? formatCompactNumber(outputTokens) : '-'}</strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('usage_analytics.trend_metric_totalTokens')}</span>
                  <strong>{totalTokens > 0 ? formatCompactNumber(totalTokens) : '-'}</strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_recent')}</span>
                  <strong>
                    {valueRow?.lastSeenMs
                      ? formatTimestamp(valueRow.lastSeenMs, i18n.language)
                      : '-'}
                  </strong>
                </div>
              </div>
            </section>
            <section className={styles.drawerUsagePanel}>
              <div className={styles.drawerUsageHeader}>
                <div>
                  <h3>{t('accounts.detail_quota')}</h3>
                  <p>{selectedRow.quota.source}</p>
                </div>
                <span
                  className={`${styles.badge} ${getQuotaStatusClass(selectedRow.quota.status)}`}
                >
                  {t(quotaStatusLabelKey(selectedRow.quota.status))}
                </span>
              </div>
              <div className={styles.drawerQuotaMeter}>
                <div className={styles.drawerQuotaMeterHeader}>
                  <span>{t('accounts.detail_quota')}</span>
                  <strong>{formatPercent(quotaRemaining)}</strong>
                </div>
                <div className={styles.drawerQuotaTrack} aria-hidden="true">
                  <span
                    className={`${styles.drawerQuotaBar} ${getRemainingBarClass(selectedRow)}`}
                    style={{ width: `${quotaWidth}%` }}
                  />
                </div>
                <div className={styles.drawerQuotaMeta}>
                  <span>
                    {t('accounts.detail_used')}: {formatPercent(selectedRow.quota.usedPercent)}
                  </span>
                  <span>
                    {t('accounts.detail_reset')}: {selectedRow.quota.resetLabel}
                  </span>
                </div>
              </div>
              {selectedRow.quota.error ? (
                <p className={styles.drawerUsageError}>{selectedRow.quota.error}</p>
              ) : null}
            </section>
          </div>
        );
      }
      if (detailTab === 'events') {
        const rowEvents = detailEventsRowKey === selectedRow.selectionKey ? detailEvents : [];
        const eventsUnavailable =
          !featureAvailability.requestMonitoringAvailable ||
          !featureAvailability.managerServiceBase ||
          !managementKey;

        return (
          <section className={styles.drawerSection}>
            <div className={styles.sectionHeaderInline}>
              <div>
                <h3>{t('accounts.detail_event_log')}</h3>
                <p>{t('accounts.detail_event_log_desc')}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadDetailEvents(selectedRow)}
                disabled={eventsUnavailable || detailEventsLoading}
                loading={detailEventsLoading}
              >
                <IconRefreshCw size={14} />
                {t('common.refresh')}
              </Button>
            </div>
            {eventsUnavailable ? (
              <p>{t('accounts.detail_events_unavailable')}</p>
            ) : detailEventsLoading ? (
              <div className={styles.inlineLoading}>
                <LoadingSpinner size={16} />
                <span>{t('common.loading')}</span>
              </div>
            ) : detailEventsError ? (
              <div className="error-box">{detailEventsError}</div>
            ) : rowEvents.length === 0 ? (
              <p>{t('accounts.detail_events_empty')}</p>
            ) : (
              <div className={styles.detailEventsTableWrap}>
                <table className={styles.detailEventsTable}>
                  <thead>
                    <tr>
                      <th>{t('accounts.detail_event_col_time')}</th>
                      <th>{t('accounts.detail_event_col_request')}</th>
                      <th>{t('accounts.detail_event_col_model')}</th>
                      <th>{t('accounts.detail_event_col_status')}</th>
                      <th>{t('accounts.detail_event_col_tokens')}</th>
                      <th>{t('accounts.detail_event_col_latency')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowEvents.map((event) => {
                      const requestLabel = event.request_id || event.event_hash.slice(0, 10) || '-';
                      const statusLabel = event.failed
                        ? event.fail_status_code
                          ? `${t('accounts.detail_event_failed')} ${event.fail_status_code}`
                          : t('accounts.detail_event_failed')
                        : t('accounts.detail_event_success');
                      return (
                        <tr key={event.event_hash}>
                          <td>{formatTimestamp(event.timestamp_ms, i18n.language)}</td>
                          <td
                            className={styles.monoCell}
                            title={event.request_id || event.event_hash}
                          >
                            {requestLabel}
                          </td>
                          <td title={event.resolved_model || event.model}>
                            {event.resolved_model || event.model || '-'}
                          </td>
                          <td>
                            <span
                              className={`${styles.eventStatus} ${
                                event.failed ? styles.eventStatusFailed : styles.eventStatusSuccess
                              }`}
                              title={event.fail_summary || undefined}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td>{formatCompactNumber(event.total_tokens)}</td>
                          <td>{formatDurationMs(event.latency_ms)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
              <strong title={selectedRow.accountLabel}>{getDisplayAccount(selectedRow)}</strong>
              <span>
                {selectedRow.provider} · {selectedRow.planType ?? '-'} ·{' '}
                {getDisplayFileName(selectedRow.fileName)}
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
              variant="secondary"
              onClick={() => void showModels(selectedRow.raw)}
              disabled={selectedRow.runtimeOnly}
            >
              <IconModelCluster size={16} />
              {t('auth_files.models_button')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void openPrefixProxyEditor(selectedRow.raw)}
              disabled={disableControls || selectedRow.runtimeOnly}
            >
              <IconSettings size={16} />
              {t('auth_files.prefix_proxy_button')}
            </Button>
            {canResetCodexQuota(selectedRow) ? (
              <Button variant="secondary" onClick={() => resetCodexQuotaForRow(selectedRow)}>
                <IconRefreshCw size={16} />
                {t('codex_quota.reset_action_button')}
              </Button>
            ) : null}
            <Button
              variant={selectedRow.disabled ? 'secondary' : 'danger'}
              onClick={() => handleBatchStatus(selectedRow.disabled, [selectedRow])}
              disabled={statusUpdating || selectedRow.runtimeOnly}
            >
              {selectedRow.disabled ? t('accounts.enable') : t('accounts.disable')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleDownload(selectedRow.fileName)}
              disabled={selectedRow.runtimeOnly}
            >
              <IconDownload size={16} />
              {t('auth_files.download_button')}
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(selectedRow.fileName)}
              disabled={disableControls || selectedRow.runtimeOnly}
              loading={deleting === selectedRow.fileName}
            >
              <IconTrash2 size={16} />
              {t('auth_files.delete_button')}
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
    const pendingRows = rows.filter(
      (row) => row.quota.status === 'unknown' || row.quota.status === 'loading'
    );
    const criticalRecommendations = recommendations.filter(
      (item) => getRecommendationRank(item.priority) >= getRecommendationRank('high')
    );
    const executableRecommendations = recommendations.filter((item) =>
      ['refresh', 'disable', 'enable', 'restore-default'].includes(item.action)
    );

    return (
      <>
        <section className={styles.metricsGrid}>
          {renderMetricCard(
            'low-quota',
            t('accounts.metric_low'),
            lowRows.length,
            t('accounts.metric_low_meta'),
            <IconShield size={24} />,
            'amber'
          )}
          {renderMetricCard(
            'exhausted',
            t('accounts.quota_metric_exhausted'),
            exhaustedRows.length,
            t('accounts.quota_metric_exhausted_meta'),
            <IconX size={24} />,
            'red'
          )}
          {renderMetricCard(
            'pending',
            t('accounts.quota_metric_pending'),
            pendingRows.length,
            t('accounts.quota_metric_pending_meta'),
            <IconRefreshCw size={24} />,
            'blue'
          )}
          {renderMetricCard(
            'recommend',
            t('accounts.quota_metric_recommend'),
            criticalRecommendations.length,
            t('accounts.quota_metric_recommend_meta'),
            <IconTrendingUp size={24} />,
            'green'
          )}
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
                          <strong title={item.row.accountLabel}>
                            {getDisplayAccount(item.row)}
                          </strong>
                          <span title={item.row.fileName}>
                            {getDisplayFileName(item.row.fileName)}
                          </span>
                        </div>
                      </td>
                      <td>{formatPercent(item.row.quota.remainingPercent)}</td>
                      <td>{t(getRecommendationActionLabelKey(item.action))}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${getRecommendationPriorityClass(item.priority)}`}
                        >
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
              <EmptyState
                title={t('accounts.quota_no_recommendations')}
                description={t('accounts.quota_no_recommendations_desc')}
              />
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
        {renderMetricCard(
          'last-run',
          t('accounts.inspection_metric_last'),
          latestRun ? `#${latestRun.id}` : '-',
          latestRun
            ? formatTimestamp(latestRun.startedAtMs, i18n.language)
            : t('accounts.detail_no_inspection'),
          <IconEye size={24} />,
          'blue'
        )}
        {renderMetricCard(
          'disable',
          t('accounts.inspection_metric_disable'),
          inspectionResults.filter((item) => item.action === 'disable').length,
          t('accounts.inspection_metric_disable_meta'),
          <IconX size={24} />,
          'red'
        )}
        {renderMetricCard(
          'enable',
          t('accounts.inspection_metric_enable'),
          inspectionResults.filter((item) => item.action === 'enable').length,
          t('accounts.inspection_metric_enable_meta'),
          <IconCheck size={24} />,
          'green'
        )}
        {renderMetricCard(
          'reauth',
          t('accounts.inspection_metric_reauth'),
          inspectionResults.filter((item) => item.action === 'reauth').length,
          t('accounts.inspection_metric_reauth_meta'),
          <IconShield size={24} />,
          'amber'
        )}
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/codex-inspection/server')}
            >
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
                        <strong title={item.displayAccount || item.fileName}>
                          {getDisplayText(item.displayAccount || item.fileName)}
                        </strong>
                        <span title={item.fileName}>{getDisplayFileName(item.fileName)}</span>
                      </div>
                    </td>
                    <td>
                      {item.disabled
                        ? t('accounts.status_disabled')
                        : t('accounts.status_available')}
                    </td>
                    <td>{item.statusCode ?? '-'}</td>
                    <td>{t(`accounts.action_${item.action}`, { defaultValue: item.action })}</td>
                    <td>{item.actionReason || '-'}</td>
                    <td>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const targetRow =
                            rows.find(
                              (row) =>
                                row.fileName === item.fileName &&
                                String(row.authIndex ?? '') === String(item.authIndex ?? '')
                            ) ?? rows.find((row) => row.fileName === item.fileName);
                          setSelectedRowKey(targetRow?.selectionKey ?? null);
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
      <div className={styles.oauthCardStack}>
        <OAuthExcludedCard
          disableControls={disableControls}
          excludedError={oauthState.excludedError}
          excluded={oauthState.excluded}
          onAdd={() => openOauthExcludedEditor()}
          onEdit={openOauthExcludedEditor}
          onDelete={oauthState.deleteExcluded}
        />
        <OAuthModelAliasCard
          disableControls={disableControls}
          viewMode={oauthViewMode}
          onViewModeChange={setOauthViewMode}
          onAdd={() => openOauthModelAliasEditor()}
          onEditProvider={openOauthModelAliasEditor}
          onDeleteProvider={oauthState.deleteModelAlias}
          modelAliasError={oauthState.modelAliasError}
          modelAlias={oauthState.modelAlias}
          allProviderModels={oauthState.allProviderModels}
          onUpdate={oauthState.handleMappingUpdate}
          onDeleteLink={oauthState.handleDeleteLink}
          onToggleFork={oauthState.handleToggleFork}
          onRenameAlias={oauthState.handleRenameAlias}
          onDeleteAlias={oauthState.handleDeleteAlias}
        />
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
        {renderMetricCard(
          'weekly-value',
          t('accounts.value_weekly'),
          formatMoney(valueSummary.weeklyValue),
          t(`accounts.value_source_${valueSummary.source}`),
          <IconDollarSign size={24} />,
          'violet'
        )}
        {renderMetricCard(
          'historical-value',
          t('accounts.value_historical'),
          formatMoney(valueSummary.historicalValue),
          t('accounts.value_historical_meta'),
          <IconTrendingUp size={24} />,
          'blue'
        )}
        {renderMetricCard(
          'high-value',
          t('accounts.value_high_accounts'),
          valueSummary.highValueAccounts,
          t('accounts.value_high_accounts_meta'),
          <IconCheck size={24} />,
          'green'
        )}
        {renderMetricCard(
          'low-activity',
          t('accounts.value_low_accounts'),
          valueSummary.lowActivityAccounts,
          t('accounts.value_low_accounts_meta'),
          <IconShield size={24} />,
          'amber'
        )}
        {renderMetricCard(
          'avg-success',
          t('accounts.value_avg_success'),
          formatPercent(valueSummary.averageSuccessRate, 1),
          t('accounts.value_avg_success_meta'),
          <IconEye size={24} />,
          'blue'
        )}
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
              options={VALUE_RANGE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
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
                          <strong title={row.accountLabel}>
                            {getDisplayText(row.accountLabel)}
                          </strong>
                          <span title={row.fileName}>{getDisplayFileName(row.fileName)}</span>
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

  const renderPageActions = () => (
    <div className={styles.headerActions}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setAuthJsonPasteOpen(true)}
        disabled={disableControls || authJsonPasteSaving}
        loading={authJsonPasteSaving}
      >
        <IconFileText size={15} />
        {t('auth_files.paste_button')}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleUploadClick}
        disabled={disableControls || uploading}
        loading={uploading}
      >
        <IconPlus size={15} />
        {t('auth_files.upload_button')}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        onChange={(event) => void handleFileChange(event)}
      />
    </div>
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
      <section className={styles.controlsPanel}>
        <div className={styles.controlsTabsRow}>
          {renderViewTabs()}
          {renderPageActions()}
        </div>
        {activeView === 'accounts' ? (
          <div className={styles.controlsFilterSection}>{renderToolbar()}</div>
        ) : null}
      </section>
      {renderActiveView()}
      {renderFloatingBatchActions()}
      <AuthJsonPasteModal
        open={authJsonPasteOpen}
        saving={authJsonPasteSaving}
        disabled={disableControls}
        onClose={() => {
          if (!authJsonPasteSaving) setAuthJsonPasteOpen(false);
        }}
        onSave={handleSavePastedAuthJson}
      />
      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={oauthState.excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />
      <AuthFilesPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onCopyText={copyTextWithNotification}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />
      <OAuthExcludedEditorModal
        open={oauthExcludedEditorProvider !== null}
        provider={oauthExcludedEditorProvider ?? ''}
        files={files}
        excluded={oauthState.excluded}
        modelAlias={oauthState.modelAlias}
        disabled={disableControls}
        unsupported={oauthState.excludedError === 'unsupported'}
        onClose={() => setOauthExcludedEditorProvider(null)}
        onSaved={reloadOauthRules}
      />
      <OAuthModelAliasEditorModal
        open={oauthModelAliasEditorProvider !== null}
        provider={oauthModelAliasEditorProvider ?? ''}
        files={files}
        excluded={oauthState.excluded}
        modelAlias={oauthState.modelAlias}
        disabled={disableControls}
        unsupported={oauthState.modelAliasError === 'unsupported'}
        onClose={() => setOauthModelAliasEditorProvider(null)}
        onSaved={reloadOauthRules}
      />
      <CodexReauthDialog
        open={Boolean(codexReauthTarget)}
        target={codexReauthTarget}
        onClose={() => setCodexReauthTarget(null)}
        onSuccess={handleCodexReauthSuccess}
      />
    </div>
  );
}
