import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconBinary,
  IconCheck,
  IconArrowDownWideNarrow,
  IconArrowUpNarrowWide,
  IconChevronRight,
  IconCopy,
  IconDollarSign,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconMoreVertical,
  IconModelCluster,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconSend,
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
  buildObservedCodexQuotaState,
  type QuotaConfig,
} from '@/components/quota';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { PaginationControls } from '@/features/monitoring/components/MonitoringShared';
import { AuthJsonPasteModal } from '@/features/authFiles/components/AuthJsonPasteModal';
import { AuthFileModelsContent } from '@/features/authFiles/components/AuthFileModelsModal';
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
  normalizeAccountProvider,
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
  type AccountRecommendationPriority,
} from '@/features/accounts/model/quotaRecommendations';
import {
  buildAccountListItem,
  buildRecommendationBySelectionKey,
  getRecommendationActionLabelKey,
  type AccountListHealthStatusKey,
} from '@/features/accounts/model/accountListPresentation';
import {
  buildAccountHistoryByRowKey,
  buildAccountHistoryTargetEntries,
  type AccountHistoryTargetEntry,
} from '@/features/accounts/model/accountHistoryRows';
import {
  buildAccountWindowUsageByKey,
  buildAccountWindowUsageTargetEntries,
} from '@/features/accounts/model/accountWindowUsageRows';
import {
  buildAccountDetailViewModel,
  type AccountDetailField,
} from '@/features/accounts/model/accountDetailViewModel';
import {
  getAuthFileCodexInspectionKey,
  getAuthFileCodexStatus,
  getAuthFilePatchTarget,
  getAuthFileSelectionKey,
  getAuthFileScopedCodexQuota,
  hasPartialSharedAuthFileSelection,
  type AuthFileCodexInspectionSnapshot,
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
  AccountHealthBadge,
  CopyableText,
  QuotaWindowCard,
  RelativeTime,
  severityFromQuotaStatus,
} from '@/features/accounts/components';
import {
  monitoringAnalyticsApi,
  usageServiceApi,
  type AccountActionCandidate,
  type CodexInspectionRun,
  type CodexInspectionResult,
  type MonitoringAnalyticsAccountStatRow,
  type MonitoringAnalyticsEventRow,
  type MonitoringAnalyticsTimelinePoint,
  type MonitoringAccountHistoryItem,
  type MonitoringAccountWindowUsageItem,
  type QuotaCooldownInfo,
  type UsageHeaderSnapshot,
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
import {
  buildUsageHeaderSnapshotLookup,
  getHighConfidenceUsageHeaderSnapshotForAuthFile,
} from '@/utils/usageHeaderSnapshots';
import styles from './AccountsPage.module.scss';

type AccountsView = 'accounts' | 'quota' | 'inspection' | 'oauth' | 'value';
type DetailTab = 'overview' | 'quota' | 'auth' | 'models' | 'strategy' | 'value' | 'events';
type SortableAccountColumn = Extract<
  AccountRowSortKey,
  'reset' | 'priority' | 'recent' | 'quota' | 'created'
>;
type AccountSortFieldValue = 'default' | SortableAccountColumn;
type QuotaUpdater<T> = T | ((prev: T) => T);
type QuotaSetter<T> = (updater: QuotaUpdater<Record<string, T>>) => void;
type AccountQuotaDisplayWindow = {
  key: string;
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetLabel: string;
  limitWindowSeconds: number | null;
  resetAtMs: number | null;
  fromMs: number | null;
  toMs: number | null;
};

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
];

const VALUE_RANGE_OPTIONS: Array<{ value: UsageValueRange; labelKey: string; hours: number }> = [
  { value: '24h', labelKey: 'accounts.range_24h', hours: 24 },
  { value: '7d', labelKey: 'accounts.range_7d', hours: 24 * 7 },
  { value: '30d', labelKey: 'accounts.range_30d', hours: 24 * 30 },
];
const DETAIL_EVENTS_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
const DETAIL_EVENTS_LIMIT = 20;

const ACCOUNT_SORT_DEFAULT_DIRECTIONS: Record<SortableAccountColumn, AccountRowSortDirection> = {
  reset: 'asc',
  priority: 'desc',
  recent: 'desc',
  quota: 'desc',
  created: 'desc',
};

const DEFAULT_ACCOUNT_SORT_FIELD_OPTION = {
  value: 'default',
  labelKey: 'accounts.sort_default',
} as const;

const ACCOUNT_SORT_FIELD_OPTIONS: Array<{
  value: AccountSortFieldValue;
  labelKey: string;
}> = [
  DEFAULT_ACCOUNT_SORT_FIELD_OPTION,
  {
    value: 'reset',
    labelKey: 'accounts.col_reset',
  },
  {
    value: 'quota',
    labelKey: 'accounts.col_quota',
  },
  {
    value: 'priority',
    labelKey: 'accounts.col_priority',
  },
  {
    value: 'recent',
    labelKey: 'accounts.col_recent',
  },
  {
    value: 'created',
    labelKey: 'accounts.col_created',
  },
];

const getAccountSortFieldOption = (value: AccountSortFieldValue) =>
  ACCOUNT_SORT_FIELD_OPTIONS.find((option) => option.value === value) ??
  DEFAULT_ACCOUNT_SORT_FIELD_OPTION;

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

const formatHistorySuccessRate = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? formatPercent(value * 100, 1) : '-';

const getAccountHistoryTitle = (
  t: TFunction,
  item: MonitoringAccountHistoryItem | null,
  loading: boolean,
  error: string
) => {
  if (error) return t('accounts.history_unavailable');
  if (loading && !item) return t('accounts.history_loading');
  if (!item || !item.matched) return t('accounts.history_empty');
  if (item.sync_status === 'pending') return t('accounts.history_pending_title');
  return t('accounts.history_title', {
    requests: formatCompactNumber(item.total_requests),
    tokens: formatCompactNumber(item.total_tokens),
    cost: formatMoney(item.total_cost),
    rate: formatHistorySuccessRate(item.success_rate),
  });
};

const clampDisplayPercent = (value: number) => Math.max(0, Math.min(100, value));

const remainingPercentFromUsed = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? clampDisplayPercent(100 - value) : null;

const parsePriorityValue = (value: string) => {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
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

const normalizeDetailToken = (value: string | number | null | undefined) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const translateDetailEnum = (
  t: TFunction,
  prefix: string,
  value: string | number | null | undefined
) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const token = normalizeDetailToken(raw);
  if (!token) return raw;
  return t(`${prefix}${token}`, { defaultValue: raw });
};

const formatQuotaResetInlineLabel = (value: string, locale: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return '';
  const timestamp = Date.parse(trimmed);
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && Number.isFinite(timestamp)) {
    return formatTimestamp(timestamp, locale);
  }
  return trimmed;
};

const getQuotaWindowShortLabel = (window: AccountQuotaDisplayWindow) => {
  const key = window.key.toLowerCase();
  const label = window.label.toLowerCase();
  const text = `${key} ${label}`;

  if (
    text.includes('five') ||
    text.includes('5h') ||
    text.includes('5 h') ||
    text.includes('5 小时') ||
    text.includes('五小时') ||
    text.includes('primary')
  ) {
    return '5H';
  }
  if (
    text.includes('week') ||
    text.includes('7d') ||
    text.includes('7 d') ||
    text.includes('周') ||
    text.includes('weekly')
  ) {
    return '7D';
  }
  if (
    text.includes('month') ||
    text.includes('30d') ||
    text.includes('30 d') ||
    text.includes('月') ||
    text.includes('billing') ||
    text.includes('账单')
  ) {
    return '30D';
  }
  if (text.includes('day') || text.includes('24h') || text.includes('日')) {
    return '24H';
  }
  return window.label.slice(0, 3).toUpperCase();
};

const parseQuotaResetLabelMs = (value: string, nowMs = Date.now()) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return null;
  if (/^\d{4}[-/]/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const compactMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})(?:,)?\s+(\d{1,2}):(\d{2})/);
  if (compactMatch) {
    const [, month, day, hourValue, minuteValue] = compactMatch;
    const now = new Date(nowMs);
    const candidate = new Date(
      now.getFullYear(),
      Number(month) - 1,
      Number(day),
      Number(hourValue),
      Number(minuteValue),
      0,
      0
    );
    if (Number.isNaN(candidate.getTime())) return null;
    if (candidate.getTime() < nowMs - 30 * 24 * 60 * 60 * 1000) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
    return candidate.getTime();
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildQuotaWindowRange = (
  resetLabel: string,
  limitWindowSeconds: number | null | undefined,
  nowMs = Date.now()
) => {
  if (!limitWindowSeconds || limitWindowSeconds <= 0) {
    return { resetAtMs: null, fromMs: null, toMs: null };
  }
  const resetAtMs = parseQuotaResetLabelMs(resetLabel, nowMs);
  if (!resetAtMs) return { resetAtMs: null, fromMs: null, toMs: null };
  const durationMs = Math.round(limitWindowSeconds * 1000);
  const fromMs = resetAtMs - durationMs;
  const toMs = Math.min(nowMs, resetAtMs);
  if (fromMs <= 0 || toMs <= fromMs) {
    return { resetAtMs, fromMs: null, toMs: null };
  }
  return { resetAtMs, fromMs, toMs };
};

const buildAccountQuotaDisplayWindow = ({
  key,
  label,
  remainingPercent,
  usedPercent,
  resetLabel,
  limitWindowSeconds = null,
}: {
  key: string;
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetLabel: string;
  limitWindowSeconds?: number | null;
}): AccountQuotaDisplayWindow => {
  const range = buildQuotaWindowRange(resetLabel, limitWindowSeconds);
  return {
    key,
    label,
    remainingPercent,
    usedPercent,
    resetLabel,
    limitWindowSeconds,
    ...range,
  };
};

const formatDurationMs = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)} ms`;
};

const getEventFailureReason = (event: MonitoringAnalyticsEventRow) =>
  event.fail_summary ||
  event.header_error_code ||
  event.header_error_kind ||
  event.header_trace_id ||
  '';

const getEventStatusText = (event: MonitoringAnalyticsEventRow, t: TFunction) => {
  if (!event.failed) return t('accounts.detail_event_success');
  if (event.fail_status_code) {
    return t('accounts.detail_event_failed_with_code', {
      code: event.fail_status_code,
      defaultValue: `${t('accounts.detail_event_failed')} ${event.fail_status_code}`,
    });
  }
  return t('accounts.detail_event_failed');
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

const getHealthStatusClass = (status: AccountListHealthStatusKey) => {
  switch (status) {
    case 'available':
      return styles.badgeGood;
    case 'five_hour_cooldown':
    case 'weekly_cooldown':
    case 'monthly_cooldown':
    case 'limited':
      return styles.badgeWarn;
    case 'five_hour_exhausted':
    case 'weekly_exhausted':
    case 'monthly_exhausted':
    case 'exception':
    case 'reauth':
      return styles.badgeBad;
    case 'disabled':
      return styles.badgeMuted;
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

const toAuthFileCodexInspectionSnapshot = (
  row: AccountRow
): AuthFileCodexInspectionSnapshot | undefined => {
  if (!row.inspection) return undefined;
  return {
    fileName: row.fileName,
    authIndex: row.authIndex || null,
    statusCode: row.inspection.statusCode,
    action: row.inspection.action,
    usedPercent: row.inspection.usedPercent,
    isQuota:
      row.inspection.isQuota ??
      (row.inspection.usedPercent !== null || row.inspection.action === 'disable' ? true : null),
    inspectionAtMs: row.inspection.createdAtMs,
  };
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
  const storeKey = config.getStoreKey?.(file) ?? file.name;
  setQuota((prev) => ({
    ...prev,
    [storeKey]: config.buildLoadingState(file),
  }));
  try {
    const data = await config.fetchQuota(file, t);
    setQuota((prev) => ({
      ...prev,
      [storeKey]: config.buildSuccessState(data, file),
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
      [storeKey]: config.buildErrorState(
        message,
        Number.isFinite(status) ? status : undefined,
        file
      ),
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
    invertVisibleSelection,
    deselectAll,
    batchDownload,
    batchSetStatus,
    batchPatchFields,
    batchDelete,
  } = useAuthFilesData();

  const [oauthViewMode, setOauthViewMode] = useState<'diagram' | 'list'>('list');
  const oauthState = useAuthFilesOauth({ viewMode: oauthViewMode, files });
  const { modelsLoading, modelsList, modelsFileName, modelsFileType, modelsError, showModels } =
    useAuthFilesModels();
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
  const baseQuotaStores = useMemo(
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [authSafeFieldsOpen, setAuthSafeFieldsOpen] = useState(false);
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [quotaBandFilter, setQuotaBandFilter] = useState<AccountQuotaBand>('all');
  const [search, setSearch] = useState('');
  const [accountSort, setAccountSort] = useState<AccountRowSort>({
    key: 'recent',
    direction: 'desc',
  });
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isAccountSortDropdownOpen, setIsAccountSortDropdownOpen] = useState(false);
  const [highlightedAccountSortIndex, setHighlightedAccountSortIndex] = useState(-1);
  const [batchPriorityOpen, setBatchPriorityOpen] = useState(false);
  const [batchPriorityValue, setBatchPriorityValue] = useState('');
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
  const [accountHistoryByRowKey, setAccountHistoryByRowKey] = useState<
    Map<string, MonitoringAccountHistoryItem>
  >(() => new Map());
  const [accountHistoryLoading, setAccountHistoryLoading] = useState(false);
  const [accountHistoryError, setAccountHistoryError] = useState('');
  const [accountWindowUsageByKey, setAccountWindowUsageByKey] = useState<
    Map<string, MonitoringAccountWindowUsageItem>
  >(() => new Map());
  const [accountWindowUsageLoading, setAccountWindowUsageLoading] = useState(false);
  const [accountWindowUsageError, setAccountWindowUsageError] = useState('');
  const [accountActionCandidates, setAccountActionCandidates] = useState<AccountActionCandidate[]>(
    []
  );
  const [accountActionCandidatesLoading, setAccountActionCandidatesLoading] = useState(false);
  const [accountActionCandidatesError, setAccountActionCandidatesError] = useState('');
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
  const [headerSnapshots, setHeaderSnapshots] = useState<UsageHeaderSnapshot[]>([]);
  const [accountDisplayMode, setAccountDisplayMode] = useState<QuotaAccountDisplayMode>(
    DEFAULT_QUOTA_ACCOUNT_DISPLAY_MODE
  );
  const [copiedIdentityKey, setCopiedIdentityKey] = useState<string | null>(null);
  const detailEventsRequestIdRef = useRef(0);
  const headerSnapshotReqIdRef = useRef(0);
  const accountHistoryReqIdRef = useRef(0);
  const accountWindowUsageReqIdRef = useRef(0);
  const accountActionCandidatesReqIdRef = useRef(0);
  const identityCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountSortDropdownRef = useRef<HTMLDivElement | null>(null);
  const accountSortTriggerRef = useRef<HTMLButtonElement | null>(null);
  const accountSortOptionRefs = useRef<Map<AccountSortFieldValue, HTMLButtonElement | null>>(
    new Map()
  );
  const headerSnapshotContextRef = useRef({
    managerServiceBase: featureAvailability.managerServiceBase,
    managementKey,
  });

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
        const key = getAuthFileCodexInspectionKey(item.authFileName, item.authIndex ?? null);
        const existing = next.get(key);
        if (!existing || (item.recoverAtMs ?? 0) > (existing.recoverAtMs ?? 0)) {
          next.set(key, item);
        }
      }
      setQuotaCooldowns(next);
    } catch {
      // Cooldown badges are a derived hint; keep the last known state on transient failures.
    }
  }, [featureAvailability.managerServiceBase, managementKey]);

  const loadHeaderSnapshots = useCallback(async () => {
    if (
      featureAvailability.checking ||
      !featureAvailability.requestMonitoringAvailable ||
      !featureAvailability.managerServiceBase
    ) {
      setHeaderSnapshots((current) => (current.length === 0 ? current : []));
      return;
    }

    const id = ++headerSnapshotReqIdRef.current;
    try {
      const response = await monitoringAnalyticsApi.getHeaderSnapshots(
        featureAvailability.managerServiceBase,
        managementKey,
        {
          days: 30,
          limit: 1000,
        }
      );
      if (id !== headerSnapshotReqIdRef.current) return;
      setHeaderSnapshots(response.items ?? []);
    } catch {
      // Header snapshots are passive diagnostics; transient failures should not block accounts.
    }
  }, [
    featureAvailability.checking,
    featureAvailability.managerServiceBase,
    featureAvailability.requestMonitoringAvailable,
    managementKey,
  ]);

  const loadAccountActionCandidates = useCallback(async () => {
    const requestId = accountActionCandidatesReqIdRef.current + 1;
    accountActionCandidatesReqIdRef.current = requestId;

    if (featureAvailability.checking || !featureAvailability.managerServiceBase) {
      setAccountActionCandidates([]);
      setAccountActionCandidatesLoading(false);
      setAccountActionCandidatesError('');
      return;
    }

    setAccountActionCandidatesLoading(true);
    setAccountActionCandidatesError('');
    try {
      const response = await usageServiceApi.listAccountActionCandidates(
        featureAvailability.managerServiceBase,
        managementKey,
        'pending',
        200
      );
      if (accountActionCandidatesReqIdRef.current !== requestId) return;
      setAccountActionCandidates(response.items ?? []);
    } catch (err: unknown) {
      if (accountActionCandidatesReqIdRef.current !== requestId) return;
      setAccountActionCandidates([]);
      setAccountActionCandidatesError(
        err instanceof Error ? err.message : t('notification.load_failed')
      );
    } finally {
      if (accountActionCandidatesReqIdRef.current === requestId) {
        setAccountActionCandidatesLoading(false);
      }
    }
  }, [featureAvailability.checking, featureAvailability.managerServiceBase, managementKey, t]);

  useLayoutEffect(() => {
    const prev = headerSnapshotContextRef.current;
    if (
      prev.managerServiceBase === featureAvailability.managerServiceBase &&
      prev.managementKey === managementKey
    ) {
      return;
    }
    headerSnapshotContextRef.current = {
      managerServiceBase: featureAvailability.managerServiceBase,
      managementKey,
    };
    headerSnapshotReqIdRef.current += 1;
    setHeaderSnapshots((current) => (current.length === 0 ? current : []));
  }, [featureAvailability.managerServiceBase, managementKey]);

  const loadOauthExcluded = oauthState.loadExcluded;
  const loadOauthModelAlias = oauthState.loadModelAlias;

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      loadFiles(),
      loadInspectionSummary(),
      loadQuotaCooldowns(),
      loadHeaderSnapshots(),
      loadAccountActionCandidates(),
      loadOauthExcluded(),
      loadOauthModelAlias(),
    ]);
  }, [
    loadAccountActionCandidates,
    loadFiles,
    loadInspectionSummary,
    loadHeaderSnapshots,
    loadOauthExcluded,
    loadOauthModelAlias,
    loadQuotaCooldowns,
  ]);

  useHeaderRefresh(handleRefresh);

  useEffect(() => {
    void handleRefresh();
  }, [handleRefresh]);

  useEffect(
    () => () => {
      if (identityCopyTimerRef.current !== null) {
        clearTimeout(identityCopyTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAccountSortDropdownOpen || typeof document === 'undefined') return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!accountSortDropdownRef.current?.contains(target)) {
        setIsAccountSortDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAccountSortDropdownOpen]);

  useEffect(() => {
    if (!isAccountSortDropdownOpen || highlightedAccountSortIndex < 0) return;
    const highlightedOption = ACCOUNT_SORT_FIELD_OPTIONS[highlightedAccountSortIndex];
    if (!highlightedOption) return;
    accountSortOptionRefs.current.get(highlightedOption.value)?.focus();
  }, [highlightedAccountSortIndex, isAccountSortDropdownOpen]);

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

  const headerSnapshotLookup = useMemo(
    () => buildUsageHeaderSnapshotLookup(headerSnapshots),
    [headerSnapshots]
  );
  const getDisplayCodexQuota = useCallback(
    (file: AuthFileItem): CodexQuotaState | undefined => {
      if (normalizeAccountProvider(file) !== CODEX_CONFIG.type) return undefined;
      const storeKey = CODEX_CONFIG.getStoreKey?.(file) ?? file.name;
      const activeQuota =
        getAuthFileScopedCodexQuota(file, codexQuota[storeKey]) ??
        getAuthFileScopedCodexQuota(file, codexQuota[file.name]);
      if (activeQuota && activeQuota.status !== 'idle' && activeQuota.status !== 'error') {
        return activeQuota;
      }
      if (activeQuota?.status === 'error' && activeQuota.errorStatus === 401) {
        return activeQuota;
      }
      const observedQuota = buildObservedCodexQuotaState(
        file,
        getHighConfidenceUsageHeaderSnapshotForAuthFile(headerSnapshotLookup, file),
        t
      );
      return observedQuota ?? activeQuota;
    },
    [codexQuota, headerSnapshotLookup, t]
  );
  const accountQuotaOverrides = useMemo(() => {
    const codexQuotaBySelectionKey = new Map<string, CodexQuotaState>();
    const codexHeaderSnapshotBySelectionKey = new Map<string, UsageHeaderSnapshot>();
    files.forEach((file) => {
      const selectionKey = getAuthFileSelectionKey(file);
      const headerSnapshot = getHighConfidenceUsageHeaderSnapshotForAuthFile(
        headerSnapshotLookup,
        file
      );
      if (headerSnapshot) {
        codexHeaderSnapshotBySelectionKey.set(selectionKey, headerSnapshot);
      }
      const quota = getDisplayCodexQuota(file);
      if (quota) {
        codexQuotaBySelectionKey.set(selectionKey, quota);
      }
    });
    return { codexQuotaBySelectionKey, codexHeaderSnapshotBySelectionKey };
  }, [files, getDisplayCodexQuota, headerSnapshotLookup]);

  const rows = useMemo(
    () => buildAccountRows(files, baseQuotaStores, inspectionResults, accountQuotaOverrides),
    [accountQuotaOverrides, baseQuotaStores, files, inspectionResults]
  );
  const metrics = useMemo(() => buildAccountMetrics(rows), [rows]);
  const providerOptions = useMemo(() => getProviderOptions(rows), [rows]);
  const planOptions = useMemo(() => getPlanOptions(rows), [rows]);
  const recommendations = useMemo(() => buildAccountRecommendations(rows), [rows]);
  const recommendationBySelectionKey = useMemo(
    () => buildRecommendationBySelectionKey(recommendations),
    [recommendations]
  );
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
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredRows, pageSize]
  );
  const paginationStartItem = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const paginationEndItem = Math.min(filteredRows.length, currentPage * pageSize);
  const pageAuthFiles = useMemo(() => pageRows.map((row) => row.raw), [pageRows]);
  const filteredAuthFiles = useMemo(() => filteredRows.map((row) => row.raw), [filteredRows]);
  const accountHistoryTargets = useMemo(
    () => buildAccountHistoryTargetEntries(pageRows),
    [pageRows]
  );
  const selectablePageRows = useMemo(() => pageRows.filter((row) => !row.runtimeOnly), [pageRows]);
  const selectableFilteredRows = useMemo(
    () => filteredRows.filter((row) => !row.runtimeOnly),
    [filteredRows]
  );
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
  const handleAccountCardClick = useCallback(
    (row: AccountRow) => {
      if (isSelectionMode) {
        if (!row.runtimeOnly) {
          toggleSelect(row.selectionKey);
        }
      }
    },
    [isSelectionMode, toggleSelect]
  );
  const openAccountDetail = useCallback(
    (row: AccountRow, tab: DetailTab = 'overview') => {
      setSelectedRowKey(row.selectionKey);
      setDetailTab(tab);
      if (tab === 'models') {
        void showModels(row.raw);
      }
    },
    [showModels]
  );
  const cancelSelectionMode = useCallback(() => {
    deselectAll();
    setIsSelectionMode(false);
  }, [deselectAll]);
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
  const getQuotaSourceLabel = useCallback(
    (source: AccountRow['quota']['source']) => {
      switch (source) {
        case 'observed-header':
          return t('accounts.quota_source_observed_header');
        case 'cache':
          return t('accounts.quota_source_cache');
        case 'none':
        default:
          return t('accounts.quota_source_none');
      }
    },
    [t]
  );
  const translateQuotaWindowLabel = useCallback(
    (
      label: string | undefined,
      labelKey?: string,
      labelParams?: Record<string, string | number>
    ) => {
      if (!labelKey) return label || t('accounts.col_quota');
      return t(labelKey, {
        defaultValue: label || labelKey,
        ...labelParams,
      });
    },
    [t]
  );
  const buildQuotaDisplayWindows = useCallback(
    (row: AccountRow): AccountQuotaDisplayWindow[] => {
      if (row.provider === CODEX_CONFIG.type) {
        const quota = getDisplayCodexQuota(row.raw);
        if (quota?.windows?.length) {
          return quota.windows.map((window) =>
            buildAccountQuotaDisplayWindow({
              key: window.id,
              label: translateQuotaWindowLabel(window.label, window.labelKey, window.labelParams),
              remainingPercent: remainingPercentFromUsed(window.usedPercent),
              usedPercent: window.usedPercent,
              resetLabel: window.resetLabel || '-',
              limitWindowSeconds: window.limitWindowSeconds ?? null,
            })
          );
        }
      }

      if (row.provider === CLAUDE_CONFIG.type) {
        const quota = claudeQuota[row.fileName];
        if (quota?.windows?.length) {
          return quota.windows.map((window) =>
            buildAccountQuotaDisplayWindow({
              key: window.id,
              label: translateQuotaWindowLabel(window.label, window.labelKey),
              remainingPercent: remainingPercentFromUsed(window.usedPercent),
              usedPercent: window.usedPercent,
              resetLabel: window.resetLabel || '-',
            })
          );
        }
      }

      if (row.provider === ANTIGRAVITY_CONFIG.type) {
        const quota = antigravityQuota[row.fileName];
        const buckets = quota?.groups?.flatMap((group) => group.buckets) ?? [];
        if (buckets.length) {
          return buckets.map((bucket) => {
            const remainingPercent = clampDisplayPercent(bucket.remainingFraction * 100);
            return buildAccountQuotaDisplayWindow({
              key: bucket.id,
              label: bucket.label || bucket.id,
              remainingPercent,
              usedPercent: clampDisplayPercent(100 - remainingPercent),
              resetLabel: bucket.resetTime || '-',
            });
          });
        }
      }

      if (row.provider === KIMI_CONFIG.type) {
        const quota = kimiQuota[row.fileName];
        if (quota?.rows?.length) {
          return quota.rows.map((quotaRow) => {
            const remainingPercent =
              quotaRow.limit > 0
                ? clampDisplayPercent(((quotaRow.limit - quotaRow.used) / quotaRow.limit) * 100)
                : null;
            return buildAccountQuotaDisplayWindow({
              key: quotaRow.id,
              label: translateQuotaWindowLabel(
                quotaRow.label,
                quotaRow.labelKey,
                quotaRow.labelParams
              ),
              remainingPercent,
              usedPercent:
                remainingPercent === null ? null : clampDisplayPercent(100 - remainingPercent),
              resetLabel: quotaRow.resetHint || '-',
            });
          });
        }
      }

      if (row.provider === XAI_CONFIG.type) {
        const quota = xaiQuota[row.fileName];
        const usedPercent = quota?.billing?.usedPercent;
        if (typeof usedPercent === 'number' && Number.isFinite(usedPercent)) {
          const remainingPercent = clampDisplayPercent(100 - usedPercent);
          return [
            buildAccountQuotaDisplayWindow({
              key: 'billing',
              label: t('accounts.quota_window_billing'),
              remainingPercent,
              usedPercent: clampDisplayPercent(usedPercent),
              resetLabel: quota?.billing?.billingPeriodEnd || '-',
            }),
          ];
        }
      }

      if (row.quota.remainingPercent !== null || row.quota.usedPercent !== null) {
        return [
          buildAccountQuotaDisplayWindow({
            key: 'summary',
            label: t('accounts.col_quota'),
            remainingPercent: row.quota.remainingPercent,
            usedPercent: row.quota.usedPercent,
            resetLabel: row.quota.resetLabel,
          }),
        ];
      }

      return [];
    },
    [
      antigravityQuota,
      claudeQuota,
      getDisplayCodexQuota,
      kimiQuota,
      t,
      translateQuotaWindowLabel,
      xaiQuota,
    ]
  );
  const quotaDisplayWindowsByRowKey = useMemo(() => {
    const result = new Map<string, AccountQuotaDisplayWindow[]>();
    pageRows.forEach((row) => {
      result.set(row.selectionKey, buildQuotaDisplayWindows(row));
    });
    if (selectedRow && !result.has(selectedRow.selectionKey)) {
      result.set(selectedRow.selectionKey, buildQuotaDisplayWindows(selectedRow));
    }
    return result;
  }, [buildQuotaDisplayWindows, pageRows, selectedRow]);
  const accountWindowUsageTargets = useMemo(() => {
    const targetRows = new Map<string, AccountRow>();
    pageRows.forEach((row) => targetRows.set(row.selectionKey, row));
    if (selectedRow) {
      targetRows.set(selectedRow.selectionKey, selectedRow);
    }
    const windowsByRowKey = new Map<string, AccountQuotaDisplayWindow[]>();
    targetRows.forEach((row) => {
      windowsByRowKey.set(
        row.selectionKey,
        quotaDisplayWindowsByRowKey.get(row.selectionKey) ?? buildQuotaDisplayWindows(row)
      );
    });
    return buildAccountWindowUsageTargetEntries(Array.from(targetRows.values()), windowsByRowKey);
  }, [buildQuotaDisplayWindows, pageRows, quotaDisplayWindowsByRowKey, selectedRow]);
  const accountDisplayHint = t(
    accountDisplayMode === 'masked'
      ? 'quota_management.show_full_credentials_hint'
      : 'quota_management.show_masked_credentials_hint'
  );
  const AccountDisplayIcon = accountDisplayMode === 'masked' ? IconEyeOff : IconEye;
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

  const loadAccountWindowUsage = useCallback(async () => {
    const requestId = accountWindowUsageReqIdRef.current + 1;
    accountWindowUsageReqIdRef.current = requestId;
    const entries = accountWindowUsageTargets;

    if (
      featureAvailability.checking ||
      !featureAvailability.requestMonitoringAvailable ||
      !featureAvailability.managerServiceBase ||
      !managementKey ||
      entries.length === 0
    ) {
      setAccountWindowUsageByKey(new Map());
      setAccountWindowUsageLoading(false);
      setAccountWindowUsageError('');
      return;
    }

    setAccountWindowUsageLoading(true);
    setAccountWindowUsageError('');
    try {
      const response = await monitoringAnalyticsApi.getAccountWindowUsage(
        featureAvailability.managerServiceBase,
        managementKey,
        {
          windows: entries.map((entry) => entry.target),
        }
      );
      if (accountWindowUsageReqIdRef.current !== requestId) return;
      setAccountWindowUsageByKey(buildAccountWindowUsageByKey(entries, response.items ?? []));
    } catch (err: unknown) {
      if (accountWindowUsageReqIdRef.current !== requestId) return;
      setAccountWindowUsageByKey(new Map());
      setAccountWindowUsageError(
        err instanceof Error ? err.message : t('notification.load_failed')
      );
    } finally {
      if (accountWindowUsageReqIdRef.current === requestId) {
        setAccountWindowUsageLoading(false);
      }
    }
  }, [
    accountWindowUsageTargets,
    featureAvailability.checking,
    featureAvailability.managerServiceBase,
    featureAvailability.requestMonitoringAvailable,
    managementKey,
    t,
  ]);

  useEffect(() => {
    void loadAccountWindowUsage();
  }, [loadAccountWindowUsage]);

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

  const loadAccountHistory = useCallback(
    async (targetEntries?: AccountHistoryTargetEntry[]) => {
      const requestId = accountHistoryReqIdRef.current + 1;
      accountHistoryReqIdRef.current = requestId;
      const entries = targetEntries ?? accountHistoryTargets;
      const mergeResult = targetEntries !== undefined;

      if (
        featureAvailability.checking ||
        !featureAvailability.requestMonitoringAvailable ||
        !featureAvailability.managerServiceBase ||
        !managementKey ||
        entries.length === 0
      ) {
        if (!mergeResult) {
          setAccountHistoryByRowKey(new Map());
        }
        setAccountHistoryLoading(false);
        setAccountHistoryError('');
        return;
      }

      setAccountHistoryLoading(true);
      setAccountHistoryError('');
      try {
        const response = await monitoringAnalyticsApi.getAccountHistory(
          featureAvailability.managerServiceBase,
          managementKey,
          {
            accounts: entries.map((entry) => entry.target),
          }
        );
        if (accountHistoryReqIdRef.current !== requestId) return;
        const nextHistory = buildAccountHistoryByRowKey(entries, response.items);
        setAccountHistoryByRowKey((current) => {
          if (!mergeResult) return nextHistory;
          const merged = new Map(current);
          nextHistory.forEach((item, rowKey) => {
            merged.set(rowKey, item);
          });
          return merged;
        });
      } catch (err: unknown) {
        if (accountHistoryReqIdRef.current !== requestId) return;
        if (!mergeResult) {
          setAccountHistoryByRowKey(new Map());
        }
        setAccountHistoryError(err instanceof Error ? err.message : t('notification.load_failed'));
      } finally {
        if (accountHistoryReqIdRef.current === requestId) {
          setAccountHistoryLoading(false);
        }
      }
    },
    [
      accountHistoryTargets,
      featureAvailability.checking,
      featureAvailability.managerServiceBase,
      featureAvailability.requestMonitoringAvailable,
      managementKey,
      t,
    ]
  );

  useEffect(() => {
    void loadAccountHistory();
  }, [loadAccountHistory]);

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

  const refreshAccountRow = useCallback(
    async (row: AccountRow) => {
      await refreshQuotaRows([row]);
      await loadAccountHistory(buildAccountHistoryTargetEntries([row]));
    },
    [loadAccountHistory, refreshQuotaRows]
  );

  const canResetCodexQuota = useCallback(
    (row: AccountRow) => {
      if (row.provider !== CODEX_CONFIG.type || row.disabled || row.runtimeOnly) return false;
      return CODEX_CONFIG.canResetQuota?.(row.raw, getDisplayCodexQuota(row.raw)) === true;
    },
    [getDisplayCodexQuota]
  );

  const resetCodexQuotaForRow = useCallback(
    (row: AccountRow) => {
      if (!canResetCodexQuota(row) || !CODEX_CONFIG.resetQuota) return;
      const quota = getDisplayCodexQuota(row.raw);
      const storeKey = CODEX_CONFIG.getStoreKey?.(row.raw) ?? row.fileName;
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
            [storeKey]: CODEX_CONFIG.buildLoadingState(row.raw),
          }));

          try {
            const data = await CODEX_CONFIG.resetQuota?.(row.raw, t);
            if (data === undefined) {
              throw new Error(t('common.unknown_error'));
            }
            setCodexQuota((prev) => ({
              ...prev,
              [storeKey]: CODEX_CONFIG.buildSuccessState(data, row.raw),
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
              [storeKey]: CODEX_CONFIG.buildErrorState(
                message,
                Number.isFinite(status) ? status : undefined,
                row.raw
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
      getDisplayAccount,
      getDisplayCodexQuota,
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

  const handleBatchPrioritySave = useCallback(async () => {
    const priority = parsePriorityValue(batchPriorityValue);
    if (priority === null) {
      showNotification(t('accounts.priority_invalid'), 'error');
      return;
    }
    await patchPriorityRows(selectedRows, priority);
    setBatchPriorityOpen(false);
    setBatchPriorityValue('');
    setIsSelectionMode(false);
  }, [batchPriorityValue, patchPriorityRows, selectedRows, showNotification, t]);

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
    const targetRow =
      (row.row ? rows.find((item) => item.selectionKey === row.row?.selectionKey) : null) ??
      rows.find(
        (item) =>
          item.fileName === row.fileName &&
          (!row.row || String(item.authIndex ?? '') === String(row.row.authIndex ?? ''))
      );
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

  const handleCopyIdentityText = useCallback(
    async (event: ReactMouseEvent<HTMLButtonElement>, text: string, feedbackKey: string) => {
      event.stopPropagation();
      const value = text.trim();
      if (!value) return;

      const copied = await copyToClipboard(value);
      if (!copied) {
        showNotification(t('notification.copy_failed', { defaultValue: 'Copy failed' }), 'error');
        return;
      }

      setCopiedIdentityKey(feedbackKey);
      if (identityCopyTimerRef.current !== null) {
        clearTimeout(identityCopyTimerRef.current);
      }
      identityCopyTimerRef.current = setTimeout(() => {
        setCopiedIdentityKey((current) => (current === feedbackKey ? null : current));
        identityCopyTimerRef.current = null;
      }, 1800);
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

  const estimatedWeeklyValue = valueSummary.weeklyValue;

  const selectedAccountSortIndex = ACCOUNT_SORT_FIELD_OPTIONS.findIndex(
    (option) => option.value === accountSort.key
  );
  const selectedAccountSortOption = getAccountSortFieldOption(accountSort.key);
  const selectedAccountSortLabel = t(selectedAccountSortOption.labelKey);
  const selectedStatusFilterLabel =
    statusFilter === 'all' ? t('accounts.status_all') : t(`accounts.status_${statusFilter}`);
  const selectedPlanFilterLabel = planFilter === 'all' ? t('accounts.plan_all') : planFilter;
  const selectedQuotaFilterLabel =
    quotaBandFilter === 'all' ? t('accounts.quota_all') : t(`accounts.quota_${quotaBandFilter}`);
  const selectedProviderFilterLabel =
    providerFilter === 'all' ? t('accounts.provider_all') : getProviderLabel(providerFilter, t);
  const activeMobileFilterCount = [
    providerFilter !== 'all',
    statusFilter !== 'all',
    planFilter !== 'all',
    quotaBandFilter !== 'all',
    accountSort.key !== 'default',
  ].filter(Boolean).length;
  const mobileFilterSummary =
    activeMobileFilterCount === 0
      ? t('accounts.mobile_filters_default')
      : [
          providerFilter !== 'all' ? selectedProviderFilterLabel : null,
          statusFilter !== 'all' ? selectedStatusFilterLabel : null,
          planFilter !== 'all' ? selectedPlanFilterLabel : null,
          quotaBandFilter !== 'all' ? selectedQuotaFilterLabel : null,
          accountSort.key !== 'default' ? selectedAccountSortLabel : null,
        ]
          .filter(Boolean)
          .join(' · ');

  const openAccountSortDropdown = () => {
    setHighlightedAccountSortIndex(selectedAccountSortIndex >= 0 ? selectedAccountSortIndex : 0);
    setIsAccountSortDropdownOpen(true);
  };

  const toggleAccountSortDropdown = () => {
    if (isAccountSortDropdownOpen) {
      setIsAccountSortDropdownOpen(false);
      return;
    }
    openAccountSortDropdown();
  };

  const closeAccountSortDropdown = () => {
    setIsAccountSortDropdownOpen(false);
    accountSortTriggerRef.current?.focus();
  };

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false);
    setIsAccountSortDropdownOpen(false);
  };

  const resetAccountFilters = () => {
    setProviderFilter('all');
    setStatusFilter('all');
    setPlanFilter('all');
    setQuotaBandFilter('all');
    setAccountSort({ key: 'default', direction: 'desc' });
    setPage(1);
    setIsAccountSortDropdownOpen(false);
  };

  const moveAccountSortHighlight = (nextIndex: number) => {
    const normalizedIndex =
      (nextIndex + ACCOUNT_SORT_FIELD_OPTIONS.length) % ACCOUNT_SORT_FIELD_OPTIONS.length;
    setHighlightedAccountSortIndex(normalizedIndex);
  };

  const commitAccountSortField = (value: AccountSortFieldValue) => {
    setAccountSort((prev) => {
      if (value === 'default') {
        return { key: 'default', direction: 'desc' };
      }
      return {
        key: value,
        direction: prev.key === value ? prev.direction : ACCOUNT_SORT_DEFAULT_DIRECTIONS[value],
      };
    });
    setPage(1);
    setIsAccountSortDropdownOpen(false);
    accountSortTriggerRef.current?.focus();
  };

  const handleAccountSortDirectionToggle = () => {
    setAccountSort((prev) => {
      if (prev.key === 'default') return prev;
      return {
        key: prev.key,
        direction: prev.direction === 'asc' ? 'desc' : 'asc',
      };
    });
    setPage(1);
  };

  const handleAccountSortTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        toggleAccountSortDropdown();
        return;
      case 'ArrowDown':
        event.preventDefault();
        if (!isAccountSortDropdownOpen) {
          openAccountSortDropdown();
          return;
        }
        moveAccountSortHighlight(highlightedAccountSortIndex + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!isAccountSortDropdownOpen) {
          openAccountSortDropdown();
          return;
        }
        moveAccountSortHighlight(highlightedAccountSortIndex - 1);
        return;
      case 'Escape':
        if (!isAccountSortDropdownOpen) return;
        event.preventDefault();
        closeAccountSortDropdown();
        return;
      default:
        return;
    }
  };

  const handleAccountSortOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    optionIndex: number
  ) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveAccountSortHighlight(optionIndex + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveAccountSortHighlight(optionIndex - 1);
        return;
      case 'Home':
        event.preventDefault();
        moveAccountSortHighlight(0);
        return;
      case 'End':
        event.preventDefault();
        moveAccountSortHighlight(ACCOUNT_SORT_FIELD_OPTIONS.length - 1);
        return;
      case 'Escape':
        event.preventDefault();
        closeAccountSortDropdown();
        return;
      default:
        return;
    }
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

  const renderAccountSortControls = () => {
    const selectedField: AccountSortFieldValue = accountSort.key;
    const directionLabel =
      accountSort.direction === 'asc'
        ? t('accounts.sort_ascending')
        : t('accounts.sort_descending');

    return (
      <div className={styles.accountSortControls} ref={accountSortDropdownRef}>
        <button
          ref={accountSortTriggerRef}
          type="button"
          className={styles.accountSortTrigger}
          onClick={toggleAccountSortDropdown}
          onKeyDown={handleAccountSortTriggerKeyDown}
          title={`${t('accounts.sort_label')}: ${selectedAccountSortLabel}`}
          aria-label={`${t('accounts.sort_label')}: ${selectedAccountSortLabel}`}
          aria-haspopup="listbox"
          aria-expanded={isAccountSortDropdownOpen}
        >
          <span className={styles.accountSortLabel}>{selectedAccountSortLabel}</span>
        </button>
        <button
          type="button"
          className={styles.accountSortDirectionButton}
          onClick={handleAccountSortDirectionToggle}
          disabled={accountSort.key === 'default'}
          title={directionLabel}
          aria-label={directionLabel}
        >
          <span className={styles.accountSortDirectionIcon} aria-hidden="true">
            {accountSort.direction === 'asc' ? (
              <IconArrowUpNarrowWide size={14} />
            ) : (
              <IconArrowDownWideNarrow size={14} />
            )}
          </span>
        </button>
        {isAccountSortDropdownOpen ? (
          <div className={styles.accountSortDropdownList} role="listbox">
            {ACCOUNT_SORT_FIELD_OPTIONS.map((option, optionIndex) => {
              const isSelected = option.value === selectedField;
              const isHighlighted = optionIndex === highlightedAccountSortIndex;
              const optionClassName = [
                styles.accountSortDropdownItem,
                isSelected ? styles.accountSortDropdownItemSelected : '',
                isHighlighted ? styles.accountSortDropdownItemHighlighted : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    accountSortOptionRefs.current.set(option.value, node);
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={optionClassName}
                  onClick={() => commitAccountSortField(option.value)}
                  onKeyDown={(event) => handleAccountSortOptionKeyDown(event, optionIndex)}
                  onMouseEnter={() => setHighlightedAccountSortIndex(optionIndex)}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const renderAccountFilterFields = () => (
    <>
      <div className={styles.filterField}>
        <Select
          value={providerFilter}
          options={[
            { value: 'all', label: t('accounts.provider_all') },
            ...providerOptions.map((provider) => ({
              value: provider,
              label: getProviderLabel(provider, t),
            })),
          ]}
          onChange={setProviderFilter}
          ariaLabel={t('accounts.provider_filter')}
          triggerClassName={styles.toolbarSelectTrigger}
        />
      </div>
      <div className={styles.filterField}>
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
          triggerClassName={styles.toolbarSelectTrigger}
        />
      </div>
      <div className={styles.filterField}>
        <Select
          value={planFilter}
          options={[
            { value: 'all', label: t('accounts.plan_all') },
            ...planOptions.map((plan) => ({ value: plan, label: plan })),
          ]}
          onChange={setPlanFilter}
          ariaLabel={t('accounts.plan_filter')}
          triggerClassName={styles.toolbarSelectTrigger}
        />
      </div>
      <div className={styles.filterField}>
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
          triggerClassName={styles.toolbarSelectTrigger}
        />
      </div>
    </>
  );

  const renderSelectionControls = () => (
    <div className={styles.selectionControls}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => selectAllVisible(pageAuthFiles)}
        disabled={selectablePageRows.length === 0}
      >
        {t('auth_files.batch_select_page')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => selectAllVisible(filteredAuthFiles)}
        disabled={selectableFilteredRows.length === 0}
      >
        {t('auth_files.batch_select_filtered')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => invertVisibleSelection(pageAuthFiles)}
        disabled={selectablePageRows.length === 0}
      >
        {t('auth_files.batch_invert_page')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={cancelSelectionMode}
        disabled={!isSelectionMode && selectionCount === 0}
      >
        <IconX size={15} />
        {t('auth_files.batch_deselect')}
      </Button>
    </div>
  );

  const renderToolbar = () => (
    <section className={styles.toolbar}>
      <div className={styles.searchField}>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('accounts.search_placeholder')}
          rightElement={<IconSearch size={16} />}
          aria-label={t('accounts.search_label')}
          className={styles.toolbarSearchInput}
        />
      </div>
      <div className={styles.mobileToolbarActions}>
        <Button
          variant="secondary"
          size="sm"
          className={styles.mobileFilterButton}
          onClick={() => {
            setIsMobileFiltersOpen(true);
            setIsAccountSortDropdownOpen(false);
          }}
          aria-label={t('accounts.mobile_filters_button')}
        >
          <IconSlidersHorizontal size={15} />
          {t('accounts.mobile_filters_button')}
          {activeMobileFilterCount > 0 ? (
            <span className={styles.mobileFilterCount}>{activeMobileFilterCount}</span>
          ) : null}
        </Button>
        <span className={styles.mobileFilterSummary} title={mobileFilterSummary}>
          {mobileFilterSummary}
        </span>
      </div>
      {renderAccountFilterFields()}
      {renderAccountSortControls()}
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

  const renderMobileFilterPanel = () => {
    if (!isMobileFiltersOpen || typeof document === 'undefined') return null;

    return createPortal(
      <div className={styles.mobileFilterLayer}>
        <button
          type="button"
          className={styles.mobileFilterBackdrop}
          aria-label={t('common.close')}
          onClick={closeMobileFilters}
        />
        <section
          className={styles.mobileFilterPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="accounts-mobile-filter-title"
        >
          <header className={styles.mobileFilterHeader}>
            <div>
              <h2 id="accounts-mobile-filter-title">{t('accounts.mobile_filters_title')}</h2>
              <span>{mobileFilterSummary}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={closeMobileFilters}
              aria-label={t('common.close')}
            >
              <IconX size={17} />
            </Button>
          </header>
          <div className={styles.mobileFilterBody}>
            <div className={styles.mobileFilterDisplayMode}>{renderAccountDisplayToggle()}</div>
            {renderAccountFilterFields()}
            <div className={styles.mobileSortField}>{renderAccountSortControls()}</div>
          </div>
          <footer className={styles.mobileFilterFooter}>
            <Button variant="secondary" size="sm" onClick={resetAccountFilters}>
              {t('common.reset')}
            </Button>
            <Button variant="primary" size="sm" onClick={closeMobileFilters}>
              {t('common.confirm')}
            </Button>
          </footer>
        </section>
      </div>,
      document.body
    );
  };

  const renderBatchBar = () => {
    const hasSelection = selectionCount > 0;
    const refreshTargets = hasSelection ? selectedRows : rows;
    const showSelectionControls = isSelectionMode || hasSelection;

    return (
      <section
        className={[
          styles.batchBar,
          hasSelection || isSelectionMode ? styles.batchBarActive : styles.batchBarIdle,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.batchSummary}>
          <span>
            {t('accounts.selected_count', {
              count: selectionCount,
            })}
          </span>
          <small>
            {isSelectionMode || hasSelection
              ? t('accounts.selection_mode_hint')
              : t('accounts.batch_hint')}
          </small>
        </div>
        <div className={styles.batchActions}>
          {!isSelectionMode && !hasSelection ? (
            <Button
              variant="secondary"
              size="sm"
              className={styles.selectionModeButton}
              onClick={() => setIsSelectionMode(true)}
              aria-pressed={isSelectionMode}
            >
              <IconCheck size={15} />
              {t('accounts.selection_mode_enter')}
            </Button>
          ) : null}
          {showSelectionControls ? renderSelectionControls() : null}
          <div className={styles.batchDisplayToggle}>{renderAccountDisplayToggle()}</div>
          {!hasSelection && !isSelectionMode ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refreshQuotaRows(refreshTargets)}
              disabled={quotaRefreshing || refreshTargets.length === 0}
              loading={quotaRefreshing}
              title={t('accounts.refresh_quota')}
            >
              {!quotaRefreshing ? <IconRefreshCw size={15} /> : null}
              {t('accounts.refresh_quota')}
            </Button>
          ) : null}
        </div>
      </section>
    );
  };

  const renderFloatingBatchActions = () => {
    if (selectionCount === 0) return null;
    const moreItems: DropdownMenuItem[] = [
      {
        key: 'download',
        label: t('auth_files.batch_download'),
        icon: <IconDownload size={15} />,
        onClick: () => void batchDownload(selectedFileNames),
        disabled: disableControls || selectedFileNames.length === 0,
      },
      {
        key: 'websockets-enable',
        label: t('auth_files.batch_websockets_enable'),
        icon: <IconSettings size={15} />,
        onClick: () => void patchWebsocketsRows(selectedRows, true),
        disabled: disableControls || selectedCodexRows.length === 0 || batchFieldsUpdating,
      },
      {
        key: 'websockets-disable',
        label: t('auth_files.batch_websockets_disable'),
        icon: <IconSettings size={15} />,
        onClick: () => void patchWebsocketsRows(selectedRows, false),
        disabled: disableControls || selectedCodexRows.length === 0 || batchFieldsUpdating,
      },
      { key: 'batch-more-divider', type: 'divider' },
      {
        key: 'restore-default',
        label: t('accounts.restore_default_priority'),
        icon: <IconRefreshCw size={15} />,
        onClick: () => {
          void patchPriorityRows(selectedRows, 0).then(() => setIsSelectionMode(false));
        },
        disabled: disableControls || batchFieldsUpdating,
      },
      { key: 'danger-divider', type: 'divider' },
      {
        key: 'delete',
        label: t('common.delete'),
        icon: <IconTrash2 size={15} />,
        onClick: () => {
          if (selectedHasPartialSharedAuthFile) return;
          batchDelete(selectedFileNames);
        },
        disabled:
          disableControls || selectedFileNames.length === 0 || selectedHasPartialSharedAuthFile,
        tone: 'danger',
      },
    ];

    const content = (
      <div className={styles.floatingBatchActionContainer}>
        <div className={styles.floatingBatchActionBar}>
          <div className={styles.floatingBatchActionLeft}>
            <span className={styles.batchSelectionText}>
              {t('accounts.selected_count', {
                count: selectionCount,
              })}
            </span>
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
              {!quotaRefreshing ? <IconRefreshCw size={15} /> : null}
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
              variant="danger"
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
              disabled={disableControls || selectedRows.length === 0 || batchFieldsUpdating}
              onClick={() => {
                setBatchPriorityValue('');
                setBatchPriorityOpen(true);
              }}
              title={t('accounts.set_priority')}
            >
              {t('accounts.set_priority')}
            </Button>
            <DropdownMenu
              items={moreItems}
              ariaLabel={t('accounts.batch_more')}
              triggerLabel={t('accounts.batch_more')}
              triggerIcon={<IconMoreVertical size={16} />}
              triggerClassName={styles.floatingBatchMore}
            />
          </div>
        </div>
      </div>
    );

    return typeof document === 'undefined' ? content : createPortal(content, document.body);
  };

  const renderRowActions = (row: AccountRow) => (
    <div className={styles.rowActions} onClick={(event) => event.stopPropagation()}>
      <div className={styles.accountQuickActionsGrid}>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          className={`${styles.accountIconButton} ${styles.accountIconButtonRefresh}`}
          onClick={() => void refreshAccountRow(row)}
          disabled={quotaRefreshing || row.disabled || row.runtimeOnly}
          title={t('accounts.refresh_quota')}
          aria-label={t('accounts.refresh_quota')}
        >
          <IconRefreshCw size={15} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          className={`${styles.accountIconButton} ${styles.accountIconButtonModels}`}
          onClick={() => openAccountDetail(row, 'models')}
          disabled={row.runtimeOnly}
          title={t('auth_files.models_button')}
          aria-label={t('auth_files.models_button')}
        >
          <IconModelCluster size={15} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          className={`${styles.accountIconButton} ${styles.accountIconButtonDownload}`}
          onClick={() => void handleDownload(row.fileName)}
          disabled={row.runtimeOnly}
          title={t('auth_files.download_button')}
          aria-label={t('auth_files.download_button')}
        >
          <IconDownload size={15} />
        </Button>
        <Button
          variant="danger"
          size="sm"
          iconOnly
          className={`${styles.accountIconButton} ${styles.accountIconButtonDelete}`}
          onClick={() => handleDelete(row.fileName)}
          disabled={disableControls || row.runtimeOnly || deleting === row.fileName}
          title={t('auth_files.delete_button')}
          aria-label={t('auth_files.delete_button')}
        >
          {deleting === row.fileName ? <LoadingSpinner size={14} /> : <IconTrash2 size={15} />}
        </Button>
      </div>
      <span className={styles.accountActionsDivider} aria-hidden="true" />
      <div className={styles.accountSideActions}>
        <div className={styles.accountStatusSwitch}>
          <ToggleSwitch
            checked={!row.disabled}
            onChange={(enabled) => void handleBatchStatus(enabled, [row])}
            disabled={disableControls || statusUpdating || row.runtimeOnly}
            ariaLabel={row.disabled ? t('accounts.enable') : t('accounts.disable')}
          />
        </div>
        <Button
          variant="ghost"
          size="xs"
          className={styles.rowDetailButton}
          onClick={() => openAccountDetail(row)}
          title={t('accounts.open_detail', { name: row.fileName })}
          aria-label={t('accounts.open_detail', { name: row.fileName })}
        >
          {t('accounts.open_detail_short')}
        </Button>
      </div>
    </div>
  );

  const renderPagination = () => (
    <div className={styles.accountsPagination}>
      <PaginationControls
        count={filteredRows.length}
        currentPage={currentPage}
        totalPages={totalPages}
        startItem={paginationStartItem}
        endItem={paginationEndItem}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS.map((option) => Number(option.value))}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
        t={t}
      />
    </div>
  );

  const renderAccountEmptyState = () => (
    <EmptyState
      title={t('accounts.empty_title')}
      description={t('accounts.empty_desc')}
      action={
        <Button variant="secondary" onClick={() => void loadFiles()}>
          {t('common.refresh')}
        </Button>
      }
    />
  );

  const renderAccountCards = (rowsToRender = pageRows, paged = true) => (
    <section className={styles.tablePanel}>
      {paged ? renderBatchBar() : null}
      {rowsToRender.length > 0 ? (
        <div className={styles.accountCardList}>
          {rowsToRender.map((row) => {
            const recommendation = recommendationBySelectionKey.get(row.selectionKey) ?? null;
            const quotaWindows =
              quotaDisplayWindowsByRowKey.get(row.selectionKey) ?? buildQuotaDisplayWindows(row);
            const quotaCooldown =
              quotaCooldowns.get(
                getAuthFileCodexInspectionKey(row.fileName, row.authIndex || null)
              ) ?? null;
            const codexStatus =
              row.provider === CODEX_CONFIG.type
                ? getAuthFileCodexStatus(
                    row.raw,
                    getDisplayCodexQuota(row.raw),
                    toAuthFileCodexInspectionSnapshot(row),
                    getHighConfidenceUsageHeaderSnapshotForAuthFile(headerSnapshotLookup, row.raw)
                  )
                : null;
            const item = buildAccountListItem(row, {
              recommendation,
              quotaCooldown,
              codexStatus,
              quotaWindows,
            });
            const remaining = item.quota.remainingPercent;
            const displayQuotaWindows =
              quotaWindows.length > 0
                ? quotaWindows.slice(0, 2)
                : [
                    buildAccountQuotaDisplayWindow({
                      key: 'unknown',
                      label: t('accounts.col_quota'),
                      remainingPercent: remaining,
                      usedPercent: item.quota.usedPercent,
                      resetLabel: item.quota.resetLabel,
                    }),
                  ];
            const hiddenQuotaWindowCount = Math.max(0, quotaWindows.length - 2);
            const quotaWindowTitle =
              quotaWindows
                .map((window) => `${window.label}: ${formatPercent(window.remainingPercent)}`)
                .join('\n') || t('accounts.quota_brief_unknown');
            const healthTitle = t(item.health.tooltipKey, item.health.tooltipParams);
            const accountHistory = accountHistoryByRowKey.get(row.selectionKey) ?? null;
            const accountHistoryMatched = accountHistory?.matched === true;
            const accountHistoryTitle = getAccountHistoryTitle(
              t,
              accountHistory,
              accountHistoryLoading,
              accountHistoryError
            );
            const accountHistoryFootnote = accountHistoryError
              ? t('accounts.history_unavailable')
              : accountHistoryLoading && !accountHistory
                ? t('accounts.history_loading')
                : accountHistory?.sync_status === 'pending'
                  ? t('accounts.history_syncing')
                  : null;
            const accountHistoryRequestValue = accountHistoryMatched
              ? formatCompactNumber(accountHistory.total_requests)
              : '-';
            const accountHistoryTokenValue = accountHistoryMatched
              ? formatCompactNumber(accountHistory.total_tokens)
              : '-';
            const accountHistoryCostValue = accountHistoryMatched
              ? formatMoney(accountHistory.total_cost)
              : '-';
            const accountHistorySuccessValue = accountHistoryMatched
              ? formatHistorySuccessRate(accountHistory.success_rate)
              : '-';
            return (
              <article
                key={row.selectionKey}
                data-account-card={row.selectionKey}
                aria-selected={selectedFiles.has(row.selectionKey)}
                className={[
                  styles.accountCard,
                  selectedRowKey === row.selectionKey ? styles.accountCardSelected : '',
                  selectedFiles.has(row.selectionKey) ? styles.accountCardBulkSelected : '',
                  isSelectionMode ? styles.accountCardSelectionMode : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={isSelectionMode ? () => handleAccountCardClick(row) : undefined}
              >
                <div className={styles.accountCardIdentity}>
                  <div className={styles.accountIdentityBadgeRow}>
                    <span className={styles.providerPill}>
                      {getProviderLabel(item.identity.provider, t)}
                    </span>
                    {item.identity.planType ? (
                      <span className={styles.accountMetaPill}>{item.identity.planType}</span>
                    ) : null}
                  </div>
                  <div className={styles.accountIdentityCopyLine}>
                    <button
                      type="button"
                      className={styles.accountIdentityCopyTarget}
                      title={row.accountLabel}
                      aria-label={`${t('common.copy')} ${row.accountLabel}`}
                      onClick={(event) =>
                        void handleCopyIdentityText(
                          event,
                          row.accountLabel,
                          `${row.selectionKey}:account`
                        )
                      }
                    >
                      <strong className={styles.accountIdentityTitle}>
                        {getDisplayAccount(row)}
                      </strong>
                    </button>
                    {copiedIdentityKey === `${row.selectionKey}:account` ? (
                      <span className={styles.accountIdentityCopyHint}>
                        {t('accounts.copy_feedback_copied')}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.accountIdentityCopyLine}>
                    <button
                      type="button"
                      className={styles.accountIdentityCopyTarget}
                      title={row.fileName}
                      aria-label={`${t('common.copy')} ${row.fileName}`}
                      onClick={(event) =>
                        void handleCopyIdentityText(event, row.fileName, `${row.selectionKey}:file`)
                      }
                    >
                      <span className={styles.accountCardFile}>
                        {getDisplayFileName(row.fileName)}
                      </span>
                    </button>
                    {copiedIdentityKey === `${row.selectionKey}:file` ? (
                      <span className={styles.accountIdentityCopyHint}>
                        {t('accounts.copy_feedback_copied')}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.accountCardHealth}>
                  <div className={styles.accountCardLine}>
                    <span
                      className={`${styles.badge} ${getHealthStatusClass(item.health.status)}`}
                      title={healthTitle}
                    >
                      {t(item.health.labelKey)}
                    </span>
                  </div>
                  <div className={styles.accountHealthMetaRow}>
                    <span
                      className={
                        item.identity.priorityIsNegative
                          ? styles.accountPriorityMetaDanger
                          : styles.accountPriorityMeta
                      }
                      title={t('accounts.col_priority')}
                    >
                      {t('accounts.col_priority')} {item.identity.priority}
                    </span>
                  </div>
                </div>

                <div className={styles.accountCardEvidence} title={accountHistoryTitle}>
                  <div className={styles.accountHistoryGrid}>
                    <div
                      className={`${styles.accountHistoryMetric} ${styles.accountHistoryMetricRequests}`}
                      aria-label={`${t('accounts.history_requests')} ${accountHistoryRequestValue}`}
                      title={t('accounts.history_requests')}
                    >
                      <span className={styles.accountHistoryIcon}>
                        <IconSend size={13} />
                      </span>
                      <strong>{accountHistoryRequestValue}</strong>
                    </div>
                    <div
                      className={`${styles.accountHistoryMetric} ${styles.accountHistoryMetricTokens}`}
                      aria-label={`${t('accounts.history_tokens')} ${accountHistoryTokenValue}`}
                      title={t('accounts.history_tokens')}
                    >
                      <span className={styles.accountHistoryIcon}>
                        <IconBinary size={13} />
                      </span>
                      <strong>{accountHistoryTokenValue}</strong>
                    </div>
                    <div
                      className={`${styles.accountHistoryMetric} ${styles.accountHistoryMetricCost}`}
                      aria-label={`${t('accounts.history_cost')} ${accountHistoryCostValue}`}
                      title={t('accounts.history_cost')}
                    >
                      <span className={styles.accountHistoryIcon}>
                        <IconDollarSign size={13} />
                      </span>
                      <strong>{accountHistoryCostValue}</strong>
                    </div>
                    <div
                      className={`${styles.accountHistoryMetric} ${styles.accountHistoryMetricSuccess}`}
                      aria-label={`${t('accounts.history_success')} ${accountHistorySuccessValue}`}
                      title={t('accounts.history_success')}
                    >
                      <span className={styles.accountHistoryIcon}>
                        <IconCheck size={13} />
                      </span>
                      <strong>{accountHistorySuccessValue}</strong>
                    </div>
                  </div>
                  {accountHistoryFootnote ? (
                    <span className={styles.accountHistoryFootnote}>{accountHistoryFootnote}</span>
                  ) : null}
                </div>

                <div className={styles.accountCardBusiness}>
                  <div
                    className={[
                      styles.quotaWindowGrid,
                      hiddenQuotaWindowCount > 0 ? styles.quotaWindowGridHasMore : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={quotaWindowTitle}
                  >
                    {displayQuotaWindows.map((window) => {
                      const windowRemaining = window.remainingPercent;
                      const windowWidth = Math.max(0, Math.min(100, windowRemaining ?? 0));
                      const resetLabel =
                        window.resetLabel && window.resetLabel !== '-' ? window.resetLabel : '';
                      const resetDisplayLabel = resetLabel
                        ? formatQuotaResetInlineLabel(resetLabel, i18n.language)
                        : '';
                      const shortLabel = getQuotaWindowShortLabel(window);
                      return (
                        <div
                          key={window.key}
                          className={styles.quotaWindowCard}
                          title={`${window.label}: ${formatPercent(windowRemaining)}`}
                        >
                          <div className={styles.quotaWindowPrimaryLine}>
                            <span className={styles.quotaWindowSummary} title={window.label}>
                              {shortLabel}
                            </span>
                            <div className={styles.quotaTrack} aria-hidden="true">
                              <span
                                className={`${styles.quotaBar} ${getRemainingBarClass(row)}`}
                                style={{ width: `${windowWidth}%` }}
                              />
                            </div>
                            <strong className={styles.quotaWindowPercent}>
                              {windowRemaining !== null ? formatPercent(windowRemaining) : '-'}
                            </strong>
                            <span
                              className={styles.quotaResetMeta}
                              title={resetLabel ? `${t('accounts.col_reset')}: ${resetLabel}` : ''}
                            >
                              {resetDisplayLabel || '-'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {hiddenQuotaWindowCount > 0 ? (
                      <button
                        type="button"
                        className={styles.quotaMoreButton}
                        title={t('accounts.quota_more_windows_title', {
                          count: hiddenQuotaWindowCount,
                        })}
                        onClick={(event) => {
                          event.stopPropagation();
                          openAccountDetail(row, 'quota');
                        }}
                      >
                        {t('accounts.quota_more_windows', {
                          count: hiddenQuotaWindowCount,
                        })}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={styles.accountCardRecommendation}>{renderRowActions(row)}</div>
              </article>
            );
          })}
        </div>
      ) : (
        renderAccountEmptyState()
      )}
      {paged ? renderPagination() : null}
    </section>
  );

  const renderDetailFieldValue = (item: AccountDetailField) => {
    if (item.value === null || item.value === '') return '-';
    if (item.key === 'provider') {
      return getProviderLabel(String(item.value), t);
    }
    if (item.key === 'actionStatus') {
      return translateDetailEnum(t, 'accounts.action_status_', item.value);
    }
    if (item.key === 'errorKind') {
      return translateDetailEnum(t, 'accounts.quota_error_kind_', item.value);
    }
    if (item.key === 'errorCode') {
      return translateDetailEnum(t, 'accounts.quota_error_code_', item.value);
    }
    if (item.key === 'rateLimitReachedType') {
      return translateDetailEnum(t, 'accounts.quota_rate_limit_type_', item.value);
    }
    if (item.valueKind === 'i18n') {
      return t(String(item.value), { defaultValue: String(item.value) });
    }
    if (item.valueKind === 'percent') {
      return typeof item.value === 'number'
        ? formatPercent(item.value, item.key === 'successRate' ? 1 : 0)
        : String(item.value);
    }
    if (item.valueKind === 'money') {
      return typeof item.value === 'number' ? formatMoney(item.value) : String(item.value);
    }
    if (item.valueKind === 'timestamp') {
      return typeof item.value === 'number' ? formatTimestamp(item.value, i18n.language) : '-';
    }
    if (item.valueKind === 'number') {
      return typeof item.value === 'number' ? formatCompactNumber(item.value) : String(item.value);
    }
    if (item.key === 'trace' && typeof item.value === 'string' && item.value.length > 8) {
      return <CopyableText value={item.value} />;
    }
    return String(item.value);
  };

  const renderDetailFieldList = (fields: AccountDetailField[]) => {
    if (fields.length === 0) {
      return <p>{t('accounts.detail_no_data')}</p>;
    }
    return (
      <dl>
        {fields.map((item) => (
          <div key={item.key}>
            <dt>{t(item.labelKey, { defaultValue: item.labelKey })}</dt>
            <dd>{renderDetailFieldValue(item)}</dd>
          </div>
        ))}
      </dl>
    );
  };

  const renderDetailDrawer = () => {
    if (!selectedRow) {
      return (
        <Drawer
          open={false}
          onClose={() => setSelectedRowKey(null)}
          width="clamp(540px, 45vw, 720px)"
          className={styles.accountDetailDrawer}
        />
      );
    }
    const detailTabs: Array<{ id: DetailTab; label: string }> = [
      { id: 'overview', label: t('accounts.detail_tab_overview') },
      { id: 'quota', label: t('accounts.detail_tab_quota') },
      { id: 'auth', label: t('accounts.detail_tab_auth') },
      { id: 'models', label: t('auth_files.models_button') },
      { id: 'strategy', label: t('accounts.detail_tab_strategy') },
      { id: 'value', label: t('accounts.detail_tab_value') },
      { id: 'events', label: t('accounts.detail_tab_events') },
    ];
    const valueRow =
      usageRows.find((row) => row.row?.selectionKey === selectedRow.selectionKey) ??
      usageRows.find((row) => !row.row && row.fileName === selectedRow.fileName);
    const selectedQuotaWindows =
      quotaDisplayWindowsByRowKey.get(selectedRow.selectionKey) ??
      buildQuotaDisplayWindows(selectedRow);
    const selectedQuotaCooldown =
      quotaCooldowns.get(
        getAuthFileCodexInspectionKey(selectedRow.fileName, selectedRow.authIndex || null)
      ) ?? null;
    const selectedCodexQuota =
      selectedRow.provider === CODEX_CONFIG.type
        ? getDisplayCodexQuota(selectedRow.raw)
        : undefined;
    const selectedCodexStatus =
      selectedRow.provider === CODEX_CONFIG.type
        ? getAuthFileCodexStatus(
            selectedRow.raw,
            selectedCodexQuota,
            toAuthFileCodexInspectionSnapshot(selectedRow),
            getHighConfidenceUsageHeaderSnapshotForAuthFile(headerSnapshotLookup, selectedRow.raw)
          )
        : null;
    const detailView = buildAccountDetailViewModel(selectedRow, {
      recommendation: recommendationBySelectionKey.get(selectedRow.selectionKey) ?? null,
      quotaCooldown: selectedQuotaCooldown,
      codexStatus: selectedCodexStatus,
      quotaWindows: selectedQuotaWindows,
      windowUsageByKey: accountWindowUsageByKey,
      actionCandidates: accountActionCandidates,
      history: accountHistoryByRowKey.get(selectedRow.selectionKey) ?? null,
      valueRow,
      codexQuota: selectedCodexQuota,
    });
    const renderActiveDetail = () => {
      if (detailTab === 'quota') {
        return (
          <div className={styles.drawerDetailStack}>
            <section className={styles.drawerSection}>
              <div className={styles.quotaSectionHeader}>
                <h3>{t('accounts.detail_quota_windows')}</h3>
                <AccountHealthBadge
                  severity={severityFromQuotaStatus(
                    detailView.quota.fields.find((f) => f.key === 'status')?.value as
                      | string
                      | undefined,
                    Boolean(selectedRow.disabled)
                  )}
                  label={(() => {
                    const statusField = detailView.quota.fields.find(
                      (f) => f.key === 'status'
                    );
                    return statusField ? String(statusField.value) : '-';
                  })()}
                  hint={t('accounts.detail_quota_health_hint', {
                    defaultValue: '综合账号最近请求、配额与认证状态得出',
                  })}
                  size="md"
                />
              </div>
              {renderDetailFieldList(detailView.quota.fields)}
              {detailView.quota.resetCreditsAvailableCount !== null ? (
                <div className={styles.detailInlineNote}>
                  <span>{t('codex_quota.reset_credits_label')}</span>
                  <strong>{detailView.quota.resetCreditsAvailableCount}</strong>
                </div>
              ) : null}
              {detailView.quota.cooldown ? (
                <div className={styles.detailInlineNote}>
                  <span>{t('accounts.detail_cooldown')}</span>
                  <strong>
                    <RelativeTime
                      timestamp={detailView.quota.cooldown.recoverAtMs}
                      mode="both"
                      locale={i18n.language}
                    />
                  </strong>
                </div>
              ) : null}
            </section>
            <section className={styles.drawerSection}>
              <div className={styles.sectionHeaderInline}>
                <div>
                  <h3>{t('accounts.detail_quota_window_usage')}</h3>
                  <p>{t('accounts.detail_quota_window_usage_desc')}</p>
                </div>
                {accountWindowUsageLoading ? (
                  <div className={styles.inlineLoading}>
                    <LoadingSpinner size={16} />
                    <span>{t('common.loading')}</span>
                  </div>
                ) : null}
              </div>
              {accountWindowUsageError ? (
                <div className={styles.errorBox}>{accountWindowUsageError}</div>
              ) : null}
              {detailView.quota.windows.length === 0 ? (
                <p>{t('accounts.detail_no_quota_windows')}</p>
              ) : (
                <div className={styles.detailQuotaWindowList}>
                  {detailView.quota.windows.map((window) => (
                    <QuotaWindowCard key={window.key} window={window} locale={i18n.language} />
                  ))}
                </div>
              )}
            </section>
            {detailView.quota.diagnostics.length > 0 ? (
              <section className={styles.drawerSection}>
                <h3>{t('accounts.detail_quota_diagnostics')}</h3>
                {renderDetailFieldList(detailView.quota.diagnostics)}
              </section>
            ) : null}
          </div>
        );
      }
      if (detailTab === 'auth') {
        return (
          <div className={styles.drawerDetailStack}>
            <section className={styles.drawerSection}>
              <h3>{t('accounts.detail_auth_file')}</h3>
              <div className={styles.authChips}>
                <AccountHealthBadge
                  severity={selectedRow.disabled ? 'disabled' : 'ok'}
                  label={
                    selectedRow.disabled
                      ? t('accounts.detail_auth_status_disabled')
                      : t('accounts.detail_auth_status_enabled')
                  }
                  size="sm"
                />
                <span className={styles.authChip}>
                  {getProviderLabel(selectedRow.provider, t)}
                </span>
                <span className={styles.authChip}>{selectedRow.planType || '-'}</span>
              </div>
              {renderDetailFieldList(detailView.auth.fields)}
            </section>
            <section className={styles.drawerSection}>
              <button
                type="button"
                className={styles.collapsibleHeader}
                onClick={() => setAuthSafeFieldsOpen((open) => !open)}
                aria-expanded={authSafeFieldsOpen}
              >
                <strong>{t('accounts.detail_auth_safe_title')}</strong>
                <span className={styles.collapsibleChevron} aria-hidden="true">
                  {authSafeFieldsOpen ? '▾' : '▸'}
                </span>
              </button>
              {authSafeFieldsOpen ? (
                <p>{t('accounts.detail_auth_safe_hint')}</p>
              ) : null}
            </section>
          </div>
        );
      }
      if (detailTab === 'models') {
        return (
          <section className={styles.drawerSection}>
            <div className={styles.sectionHeaderInline}>
              <div>
                <h3>{t('auth_files.models_button')}</h3>
                <p>{modelsFileName || selectedRow.fileName}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void showModels(selectedRow.raw)}
                disabled={selectedRow.runtimeOnly || modelsLoading}
                loading={modelsLoading}
              >
                {!modelsLoading ? <IconRefreshCw size={14} /> : null}
                {t('common.refresh')}
              </Button>
            </div>
            <AuthFileModelsContent
              fileType={modelsFileType || selectedRow.provider}
              loading={modelsLoading}
              error={modelsError}
              models={modelsList}
              excluded={oauthState.excluded}
              onCopyText={copyTextWithNotification}
            />
          </section>
        );
      }
      if (detailTab === 'strategy') {
        return (
          <div className={styles.drawerDetailStack}>
            <section className={styles.drawerSection}>
              <h3>{t('accounts.recommend_action')}</h3>
              <div className={styles.detailStrategySummary}>
                <span
                  className={`${styles.badge} ${
                    detailView.strategy.recommendation
                      ? getRecommendationPriorityClass(detailView.strategy.recommendation.priority)
                      : styles.badgeNeutral
                  }`}
                >
                  {t(detailView.strategy.recommendationActionLabelKey)}
                </span>
                <p>{t(detailView.strategy.recommendationReasonKey)}</p>
              </div>
            </section>
            <section className={styles.drawerSection}>
              <h3>{t('accounts.detail_inspection')}</h3>
              {detailView.strategy.inspectionFields.length > 0 ? (
                renderDetailFieldList(detailView.strategy.inspectionFields)
              ) : (
                <p>
                  {inspectionLoading ? t('common.loading') : t('accounts.detail_no_inspection')}
                </p>
              )}
            </section>
            {detailView.strategy.codexBadges.length > 0 ? (
              <section className={styles.drawerSection}>
                <h3>{t('accounts.detail_codex_status_badges')}</h3>
                <div className={styles.detailBadgeList}>
                  {[...detailView.strategy.codexBadges]
                    .sort((a, b) => {
                      const order: Record<typeof a.tone, number> = {
                        danger: 0,
                        warning: 1,
                        info: 2,
                      } as const;
                      return (order[a.tone] ?? 3) - (order[b.tone] ?? 3);
                    })
                    .map((badge) => (
                      <span
                        key={badge.kind}
                        className={`${styles.badge} ${
                          badge.tone === 'danger'
                            ? styles.badgeBad
                            : badge.tone === 'warning'
                              ? styles.badgeWarn
                              : styles.badgeInfo
                        }`}
                        title={
                          badge.titleKey
                            ? t(badge.titleKey, {
                                defaultValue: badge.defaultTitle,
                                ...badge.labelParams,
                              })
                            : undefined
                        }
                      >
                        {t(badge.labelKey, {
                          defaultValue: badge.defaultLabel,
                          ...badge.labelParams,
                        })}
                      </span>
                    ))}
                </div>
              </section>
            ) : null}
            <section className={styles.drawerSection}>
              <div className={styles.sectionHeaderInline}>
                <div>
                  <h3>{t('accounts.detail_action_candidates')}</h3>
                  <p>{t('accounts.detail_action_candidates_desc')}</p>
                </div>
                {accountActionCandidatesLoading ? (
                  <div className={styles.inlineLoading}>
                    <LoadingSpinner size={16} />
                    <span>{t('common.loading')}</span>
                  </div>
                ) : null}
              </div>
              {accountActionCandidatesError ? (
                <div className={styles.errorBox}>{accountActionCandidatesError}</div>
              ) : detailView.strategy.actionCandidates.length === 0 ? (
                <p>{t('accounts.detail_action_candidates_empty')}</p>
              ) : (
                <div className={styles.detailCandidateList}>
                  {detailView.strategy.actionCandidates.map((candidate) => (
                    <div key={candidate.id} className={styles.detailCandidateItem}>
                      <div>
                        <div className={styles.detailCandidateHeader}>
                          <strong>
                            {t(`accounts.action_type_${candidate.actionType}`, {
                              defaultValue: candidate.actionType,
                            })}
                          </strong>
                          <span className={styles.detailCandidateStatus}>
                            {translateDetailEnum(t, 'accounts.action_status_', candidate.status)}
                          </span>
                        </div>
                        <span>{candidate.reason || '-'}</span>
                      </div>
                      <small>
                        {t('accounts.detail_action_candidate_meta', {
                          hits: candidate.hitCount,
                          seen: formatTimestamp(candidate.lastSeenAtMs, i18n.language),
                        })}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        );
      }
      if (detailTab === 'value') {
        const value = detailView.value;
        const quotaRemaining = selectedRow.quota.remainingPercent;
        const quotaWidth = Math.max(0, Math.min(100, quotaRemaining ?? 0));

        return (
          <div className={styles.drawerUsageStack}>
            <section className={styles.drawerUsagePanel}>
              <div className={styles.drawerUsageHeader}>
                <div>
                  <h3>{t('accounts.value_title')}</h3>
                  <p>{t(`accounts.value_source_${value.source}`)}</p>
                </div>
                <strong>{formatMoney(value.estimatedCost)}</strong>
              </div>
              <div className={styles.drawerUsageMetricGrid}>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_requests')}</span>
                  <strong>{formatCompactNumber(value.requests)}</strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_success_rate')}</span>
                  <strong>{formatPercent(value.successRate, 1)}</strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_input_tokens')}</span>
                  <strong>
                    {value.inputTokens > 0 ? formatCompactNumber(value.inputTokens) : '-'}
                  </strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_output_tokens')}</span>
                  <strong>
                    {value.outputTokens > 0 ? formatCompactNumber(value.outputTokens) : '-'}
                  </strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('usage_analytics.trend_metric_totalTokens')}</span>
                  <strong>
                    {value.totalTokens > 0 ? formatCompactNumber(value.totalTokens) : '-'}
                  </strong>
                </div>
                <div className={styles.drawerUsageMetric}>
                  <span>{t('accounts.value_recent')}</span>
                  <strong>
                    {value.lastSeenMs ? (
                      <RelativeTime
                        timestamp={value.lastSeenMs}
                        mode="both"
                        locale={i18n.language}
                      />
                    ) : (
                      '-'
                    )}
                  </strong>
                </div>
              </div>
            </section>
            <section className={styles.drawerUsagePanel}>
              <div className={styles.drawerUsageHeader}>
                <div>
                  <h3>{t('accounts.detail_quota')}</h3>
                  <p>{getQuotaSourceLabel(selectedRow.quota.source)}</p>
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
        const failedEventCount = rowEvents.filter((event) => event.failed).length;
        const latestFailedEvent = rowEvents.find((event) => event.failed) ?? null;
        const slowestLatencyMs = rowEvents.reduce<number | null>((current, event) => {
          if (typeof event.latency_ms !== 'number') return current;
          return current === null ? event.latency_ms : Math.max(current, event.latency_ms);
        }, null);

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
                {!detailEventsLoading ? <IconRefreshCw size={14} /> : null}
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
              <div className={styles.detailEventsStack}>
                <div className={styles.detailEventSummary}>
                  <div>
                    <span>{t('accounts.detail_event_summary_total')}</span>
                    <strong>{formatCompactNumber(rowEvents.length)}</strong>
                  </div>
                  <div>
                    <span>{t('accounts.detail_event_summary_failed')}</span>
                    <strong>{formatCompactNumber(failedEventCount)}</strong>
                  </div>
                  <div>
                    <span>{t('accounts.detail_event_summary_slowest')}</span>
                    <strong>{formatDurationMs(slowestLatencyMs)}</strong>
                  </div>
                </div>
                {latestFailedEvent ? (
                  <div className={styles.detailEventFailureSummary}>
                    <span>{t('accounts.detail_event_latest_failure')}</span>
                    <strong>{getEventFailureReason(latestFailedEvent) || '-'}</strong>
                  </div>
                ) : null}
                <div className={styles.detailEventsList}>
                  {rowEvents.map((event) => {
                    const requestLabel = event.request_id || event.event_hash.slice(0, 10) || '-';
                    const modelLabel = event.resolved_model || event.model || '-';
                    const failureReason = getEventFailureReason(event);
                    return (
                      <article key={event.event_hash} className={styles.detailEventItem}>
                        <div className={styles.detailEventHeader}>
                          <span
                            className={`${styles.eventStatus} ${
                              event.failed ? styles.eventStatusFailed : styles.eventStatusSuccess
                            }`}
                            title={failureReason || undefined}
                          >
                            {getEventStatusText(event, t)}
                          </span>
                          <strong>{formatTimestamp(event.timestamp_ms, i18n.language)}</strong>
                        </div>
                        <div className={styles.detailEventIdentity}>
                          {event.request_id || event.event_hash ? (
                            <CopyableText
                              value={requestLabel}
                              copyValue={event.request_id || event.event_hash}
                            />
                          ) : (
                            <span>{requestLabel}</span>
                          )}
                          <span title={modelLabel}>{modelLabel}</span>
                        </div>
                        {event.failed ? (
                          <p className={styles.detailEventFailureReason}>
                            {failureReason || t('accounts.detail_event_failed_reason_empty')}
                          </p>
                        ) : null}
                        <div className={styles.detailEventMeta}>
                          <span>
                            {t('accounts.detail_event_col_tokens')}:{' '}
                            {formatCompactNumber(event.total_tokens)}
                          </span>
                          <span>
                            {t('accounts.detail_event_col_latency')}:{' '}
                            {formatDurationMs(event.latency_ms)}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className={styles.detailEventsFooter}>
                  <span>
                    {t('accounts.detail_event_footer_count', {
                      defaultValue: '显示 {{shown}} / 共 {{total}} 条',
                      shown: rowEvents.length,
                      total: rowEvents.length,
                    })}
                  </span>
                  <a
                    href={`#/demo/monitoring?account=${encodeURIComponent(selectedRow.fileName)}`}
                  >
                    {t('accounts.detail_event_footer_open_monitoring', {
                      defaultValue: '前往请求监控',
                    })}
                  </a>
                </div>
              </div>
            )}
          </section>
        );
      }
      return (
        <div className={styles.drawerDetailStack}>
          <section className={styles.drawerHero}>
            <div>
              <span
                className={`${styles.badge} ${getHealthStatusClass(detailView.health.status)}`}
                title={t(detailView.health.tooltipKey, detailView.health.tooltipParams)}
              >
                {t(detailView.health.labelKey)}
              </span>
              <h3>{t('accounts.detail_overview_title')}</h3>
              <p>{t(detailView.health.reasonKey, detailView.health.reasonParams)}</p>
            </div>
            <strong>{formatPercent(selectedRow.quota.remainingPercent)}</strong>
          </section>
          <section className={styles.drawerSummary}>
            {detailView.overview.metrics.map((metric) => (
              <div key={metric.key}>
                <span>{t(metric.labelKey, { defaultValue: metric.labelKey })}</span>
                <strong>{renderDetailFieldValue(metric)}</strong>
              </div>
            ))}
          </section>
          <section className={styles.drawerSection}>
            <h3>{t('accounts.detail_status')}</h3>
            <p>{t(detailView.overview.statusDescriptionKey)}</p>
          </section>
          <section className={styles.drawerSection}>
            <div className={styles.sectionHeaderInline}>
              <div>
                <h3>{t('accounts.detail_history_evidence')}</h3>
                <p>
                  {t('accounts.detail_history_evidence_desc', {
                    defaultValue: '历史累计统计,与上方即时指标不同源',
                  })}
                </p>
              </div>
            </div>
            {accountHistoryLoading && !detailView.history ? (
              <div className={styles.inlineLoading}>
                <LoadingSpinner size={16} />
                <span>{t('common.loading')}</span>
              </div>
            ) : accountHistoryError ? (
              <div className={styles.errorBox}>{accountHistoryError}</div>
            ) : detailView.history?.matched ? (
              <div className={styles.detailEvidenceGrid}>
                <div>
                  <span>{t('accounts.history_requests')}</span>
                  <strong>{formatCompactNumber(detailView.history.totalRequests)}</strong>
                </div>
                <div>
                  <span>{t('accounts.history_tokens')}</span>
                  <strong>{formatCompactNumber(detailView.history.totalTokens)}</strong>
                </div>
                <div>
                  <span>{t('accounts.history_cost')}</span>
                  <strong>{formatMoney(detailView.history.totalCost)}</strong>
                </div>
                <div>
                  <span>{t('accounts.history_success')}</span>
                  <strong>{formatPercent(detailView.history.successRate, 1)}</strong>
                </div>
              </div>
            ) : (
              <p>{t('accounts.history_empty')}</p>
            )}
          </section>
        </div>
      );
    };
    const drawerMoreItems: DropdownMenuItem[] = [
      {
        key: 'models',
        label: t('auth_files.models_button'),
        icon: <IconModelCluster size={15} />,
        onClick: () => {
          setDetailTab('models');
          void showModels(selectedRow.raw);
        },
        disabled: selectedRow.runtimeOnly,
      },
      {
        key: 'download',
        label: t('auth_files.download_button'),
        icon: <IconDownload size={15} />,
        onClick: () => void handleDownload(selectedRow.fileName),
        disabled: selectedRow.runtimeOnly,
      },
      ...(canResetCodexQuota(selectedRow)
        ? [
            {
              key: 'reset-codex-quota',
              label: t('codex_quota.reset_action_button'),
              icon: <IconRefreshCw size={15} />,
              onClick: () => resetCodexQuotaForRow(selectedRow),
            } satisfies DropdownMenuItem,
          ]
        : []),
      { key: 'drawer-danger-divider', type: 'divider' },
      {
        key: 'delete',
        label: t('auth_files.delete_button'),
        icon: <IconTrash2 size={15} />,
        onClick: () => handleDelete(selectedRow.fileName),
        disabled: disableControls || selectedRow.runtimeOnly || deleting === selectedRow.fileName,
        tone: 'danger',
      },
    ];

    return (
      <Drawer
        open
        onClose={() => setSelectedRowKey(null)}
        width="clamp(540px, 45vw, 720px)"
        className={styles.accountDetailDrawer}
        title={
          <div className={styles.drawerTitleStack}>
            <strong className={styles.drawerTitlePrimary} title={selectedRow.accountLabel}>
              {getDisplayAccount(selectedRow)}
            </strong>
            <span className={styles.drawerTitleMeta}>
              {getProviderLabel(selectedRow.provider, t)} · {selectedRow.planType ?? '-'} ·{' '}
              <button
                type="button"
                className={styles.drawerFileNameCopy}
                onClick={() => copyTextWithNotification(selectedRow.fileName)}
                title={t('common.copy', { defaultValue: '点击复制' })}
                aria-label={`${t('common.copy', { defaultValue: '点击复制' })} ${getDisplayFileName(selectedRow.fileName)}`}
              >
                {getDisplayFileName(selectedRow.fileName)}
                <IconCopy size={12} />
              </button>
            </span>
          </div>
        }
        footer={
          <div className={styles.drawerActions}>
            <Button
              variant="secondary"
              onClick={() => void refreshAccountRow(selectedRow)}
              loading={quotaRefreshing}
            >
              {!quotaRefreshing ? <IconRefreshCw size={16} /> : null}
              {t('accounts.refresh_quota')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void openPrefixProxyEditor(selectedRow.raw)}
              disabled={disableControls || selectedRow.runtimeOnly}
            >
              <IconSettings size={16} />
              {t('auth_files.prefix_proxy_button')}
            </Button>
            <Button
              variant={selectedRow.disabled ? 'secondary' : 'danger'}
              onClick={() => handleBatchStatus(selectedRow.disabled, [selectedRow])}
              disabled={statusUpdating || selectedRow.runtimeOnly}
            >
              {selectedRow.disabled ? t('accounts.enable') : t('accounts.disable')}
            </Button>
            <DropdownMenu
              items={drawerMoreItems}
              ariaLabel={t('accounts.drawer_more_actions')}
              triggerTitle={t('accounts.drawer_more_actions')}
              triggerLabel={t('accounts.batch_more')}
              triggerIcon={<IconMoreVertical size={16} />}
              triggerClassName={styles.drawerMoreActions}
            />
          </div>
        }
      >
        <div className={styles.drawerBodyShell}>
          {selectedRow.disabled ? (
            <div className={styles.drawerDisabledNotice} role="status">
              <span>{t('accounts.detail_disabled_notice_title', { defaultValue: '账号已禁用' })}</span>
              <p>
                {t('accounts.detail_disabled_notice_desc', {
                  defaultValue:
                    '此账号当前不接收请求,各 Tab 仅展示只读摘要。点击底部"启用"按钮可恢复完整功能。',
                })}
              </p>
            </div>
          ) : null}
          <div className={styles.drawerTabs} role="tablist">
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={detailTab === tab.id}
                className={detailTab === tab.id ? styles.drawerTabActive : ''}
                onClick={() => {
                  setDetailTab(tab.id);
                  if (tab.id === 'models') {
                    void showModels(selectedRow.raw);
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className={styles.drawerTabPanel}>{renderActiveDetail()}</div>
        </div>
      </Drawer>
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
        renderAccountCards()
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
                  {!quotaRefreshing ? <IconRefreshCw size={15} /> : null}
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
                      <div className={styles.statusStack}>
                        <span
                          className={`${styles.badge} ${item.disabled ? styles.badgeMuted : styles.badgeGood}`}
                        >
                          {item.disabled
                            ? t('accounts.status_disabled')
                            : t('accounts.status_available')}
                        </span>
                        <small>HTTP {item.statusCode ?? '-'}</small>
                        {item.action !== 'keep' ? (
                          <small className={styles.inspectionHint}>
                            {t(`accounts.action_${item.action}`, { defaultValue: item.action })}
                          </small>
                        ) : null}
                      </div>
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
        {!authJsonPasteSaving ? <IconFileText size={15} /> : null}
        {t('auth_files.paste_button')}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleUploadClick}
        disabled={disableControls || uploading}
        loading={uploading}
      >
        {!uploading ? <IconPlus size={15} /> : null}
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
      {renderMobileFilterPanel()}
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
      <Modal
        open={batchPriorityOpen}
        onClose={() => {
          if (!batchFieldsUpdating) setBatchPriorityOpen(false);
        }}
        closeDisabled={batchFieldsUpdating}
        title={t('accounts.batch_priority_title')}
        width={420}
        footer={
          <div className={styles.batchPriorityFooter}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBatchPriorityOpen(false)}
              disabled={batchFieldsUpdating}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleBatchPrioritySave()}
              disabled={disableControls || selectedRows.length === 0 || batchFieldsUpdating}
              loading={batchFieldsUpdating}
            >
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <div className={styles.batchPriorityModal}>
          <Input
            label={t('accounts.priority_label')}
            placeholder={t('accounts.priority_placeholder')}
            hint={t('accounts.priority_hint')}
            value={batchPriorityValue}
            onChange={(event) => setBatchPriorityValue(event.target.value)}
            disabled={disableControls || batchFieldsUpdating}
            inputMode="numeric"
            autoFocus
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || disableControls || batchFieldsUpdating) return;
              void handleBatchPrioritySave();
            }}
          />
        </div>
      </Modal>
      <CodexReauthDialog
        open={Boolean(codexReauthTarget)}
        target={codexReauthTarget}
        onClose={() => setCodexReauthTarget(null)}
        onSuccess={handleCodexReauthSuccess}
      />
    </div>
  );
}
