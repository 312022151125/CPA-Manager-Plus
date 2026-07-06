import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  KimiQuotaState,
  XaiQuotaState,
} from '@/types';
import type { CodexInspectionResult, UsageHeaderSnapshot } from '@/services/api/usageService';
import {
  normalizeRecentRequestBuckets,
  sumRecentRequests,
  type RecentRequestBucket,
} from '@/utils/recentRequests';
import {
  getAuthFileCodexInspectionKey,
  getAuthFileSelectionKey,
} from '@/features/authFiles/model/authFilesPageModel';
import {
  buildObservedCodexQuotaFromHeaderSnapshot,
  getHeaderSnapshotErrorCode,
  getHeaderSnapshotErrorKind,
  getHeaderSnapshotPlanType,
  getHeaderSnapshotTraceId,
  hasUsageHeaderDiagnosticSignal,
} from '@/utils/usageHeaderSnapshots';

export type AccountQuotaStatus =
  | 'unknown'
  | 'loading'
  | 'ok'
  | 'low'
  | 'exhausted'
  | 'error'
  | 'disabled';

export type AccountQuotaBand = 'all' | 'ge50' | 'between20and50' | 'lt20' | 'spent';
export type AccountStatusFilter =
  | 'all'
  | 'available'
  | 'disabled'
  | 'problem'
  | 'low'
  | 'exhausted'
  | 'inspection';
export type AccountRowSortKey = 'default' | 'reset' | 'priority' | 'recent';
export type AccountRowSortDirection = 'asc' | 'desc';
export type AccountQuotaSource = 'cache' | 'observed-header' | 'none';

export interface AccountRowSort {
  key: AccountRowSortKey;
  direction: AccountRowSortDirection;
}

export interface AccountQuotaSummary {
  status: AccountQuotaStatus;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetLabel: string;
  planType: string | null;
  source: AccountQuotaSource;
  error?: string;
  observedAtMs?: number;
  observedTraceId?: string;
  observedErrorKind?: string;
  observedErrorCode?: string;
  activeLimit?: string | null;
  creditsBalance?: string | null;
  rateLimitReachedType?: string | null;
  primaryOverSecondaryLimitPercent?: number | null;
}

export interface AccountInspectionSummary {
  action: string;
  actionReason: string;
  actionStatus: string;
  statusCode: number | null;
  usedPercent: number | null;
  isQuota?: boolean | null;
  runId: number;
  resultId: number;
  createdAtMs: number;
}

export interface AccountUsageSummary {
  success: number;
  failure: number;
  successRate: number | null;
  recentRequests: RecentRequestBucket[];
}

export interface AccountRow {
  key: string;
  selectionKey: string;
  fileName: string;
  accountLabel: string;
  provider: string;
  planType: string | null;
  disabled: boolean;
  runtimeOnly: boolean;
  statusMessage: string;
  authIndex: string;
  projectId: string;
  priority: number | null;
  quota: AccountQuotaSummary;
  usage: AccountUsageSummary;
  inspection: AccountInspectionSummary | null;
  raw: AuthFileItem;
}

export interface AccountMetrics {
  total: number;
  available: number;
  lowQuota: number;
  exhausted: number;
  disabled: number;
  needsInspectionAction: number;
  successRate: number | null;
}

export interface AccountQuotaStores {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  xaiQuota: Record<string, XaiQuotaState>;
}

export interface AccountQuotaOverrides {
  codexQuotaBySelectionKey?: Map<string, CodexQuotaState>;
  codexHeaderSnapshotBySelectionKey?: Map<string, UsageHeaderSnapshot>;
}

export interface AccountRowFilters {
  provider: string;
  status: AccountStatusFilter;
  plan: string;
  quotaBand: AccountQuotaBand;
  search: string;
}

const QUOTA_LOW_THRESHOLD = 20;
const QUOTA_OK_THRESHOLD = 50;

type AccountQuotaObservationFields = Partial<
  Pick<
    AccountQuotaSummary,
    | 'source'
    | 'observedAtMs'
    | 'observedTraceId'
    | 'observedErrorKind'
    | 'observedErrorCode'
    | 'activeLimit'
    | 'creditsBalance'
    | 'rateLimitReachedType'
    | 'primaryOverSecondaryLimitPercent'
  >
>;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const readString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeAccountProvider = (file: AuthFileItem): string => {
  const raw = readString(file.provider) || readString(file.type) || 'unknown';
  const key = raw.toLowerCase().replace(/_/g, '-');
  if (key === 'x-ai' || key === 'grok') return 'xai';
  return key || 'unknown';
};

const readAuthIndex = (file: AuthFileItem): string =>
  readString(file.authIndex ?? file['auth_index']);

const readProjectId = (file: AuthFileItem): string =>
  readString(
    file.projectId ?? file.project_id ?? file.geminiVirtualProject ?? file.gemini_virtual_project
  );

const readPlanType = (file: AuthFileItem): string | null => {
  const idToken = file.id_token;
  const idTokenPlan =
    idToken && typeof idToken === 'object' && !Array.isArray(idToken)
      ? readString((idToken as Record<string, unknown>).plan_type)
      : '';
  const raw =
    idTokenPlan || readString(file.planType ?? file.plan_type ?? file.tier ?? file.subscription);
  return raw ? raw.toLowerCase() : null;
};

const resolveAccountLabel = (file: AuthFileItem): string =>
  readString(file.email) ||
  readString(file.account) ||
  readString(file.label) ||
  readString(file.note) ||
  file.name;

const resolveStatusMessage = (file: AuthFileItem): string =>
  readString(file.statusMessage ?? file['status_message']);

const getQuotaStatusFromRemaining = (remainingPercent: number | null): AccountQuotaStatus => {
  if (remainingPercent === null) return 'unknown';
  if (remainingPercent <= 0) return 'exhausted';
  if (remainingPercent < QUOTA_LOW_THRESHOLD) return 'low';
  return 'ok';
};

const quotaFromUsedWindows = (
  windows: Array<{ usedPercent: number | null; resetLabel?: string }>,
  planType: string | null,
  options: AccountQuotaObservationFields = {}
): AccountQuotaSummary => {
  const source = options.source ?? 'cache';
  const usedValues = windows
    .map((window) => window.usedPercent)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (usedValues.length === 0) {
    return {
      status: 'unknown',
      remainingPercent: null,
      usedPercent: null,
      resetLabel: '-',
      planType,
      ...options,
      source,
    };
  }

  const usedPercent = clampPercent(Math.max(...usedValues));
  const remainingPercent = clampPercent(100 - usedPercent);
  const resetLabel = windows.find((window) => readString(window.resetLabel))?.resetLabel ?? '-';
  return {
    status: getQuotaStatusFromRemaining(remainingPercent),
    remainingPercent,
    usedPercent,
    resetLabel,
    planType,
    ...options,
    source,
  };
};

const quotaObservationFields = (quota: CodexQuotaState): AccountQuotaObservationFields => {
  if (!quota.observedFromUsageHeaders) return { source: 'cache' };
  return {
    source: 'observed-header',
    observedAtMs: quota.observedAtMs,
    observedTraceId: quota.observedTraceId,
    observedErrorKind: quota.observedErrorKind,
    observedErrorCode: quota.observedErrorCode,
    activeLimit: quota.activeLimit,
    creditsBalance: quota.creditsBalance,
    rateLimitReachedType: quota.rateLimitReachedType,
    primaryOverSecondaryLimitPercent: quota.primaryOverSecondaryLimitPercent,
  };
};

const quotaObservationFieldsFromSnapshot = (
  snapshot: UsageHeaderSnapshot | undefined
): AccountQuotaObservationFields => {
  if (!hasUsageHeaderDiagnosticSignal(snapshot)) return {};
  const observedQuota = buildObservedCodexQuotaFromHeaderSnapshot(snapshot);
  return {
    source: 'observed-header',
    observedAtMs: snapshot?.timestamp_ms,
    observedTraceId: getHeaderSnapshotTraceId(snapshot) || undefined,
    observedErrorKind: getHeaderSnapshotErrorKind(snapshot) || undefined,
    observedErrorCode: getHeaderSnapshotErrorCode(snapshot) || undefined,
    activeLimit: observedQuota?.activeLimit ?? undefined,
    creditsBalance: observedQuota?.creditsBalance ?? undefined,
    rateLimitReachedType: observedQuota?.rateLimitReachedType ?? undefined,
    primaryOverSecondaryLimitPercent: observedQuota?.primaryOverSecondaryLimitPercent ?? undefined,
  };
};

const hasObservedQuotaFields = (fields: AccountQuotaObservationFields): boolean =>
  Object.values(fields).some((value) => value !== undefined);

const mergeQuotaObservationFields = (
  summary: AccountQuotaSummary,
  fields: AccountQuotaObservationFields
): AccountQuotaSummary => {
  if (!hasObservedQuotaFields(fields)) return summary;
  const merged: AccountQuotaSummary = { ...summary };
  if (fields.observedAtMs !== undefined) merged.observedAtMs = fields.observedAtMs;
  if (fields.observedTraceId !== undefined) merged.observedTraceId = fields.observedTraceId;
  if (fields.observedErrorKind !== undefined) {
    merged.observedErrorKind = fields.observedErrorKind;
  }
  if (fields.observedErrorCode !== undefined) {
    merged.observedErrorCode = fields.observedErrorCode;
  }
  if (fields.activeLimit !== undefined) merged.activeLimit = fields.activeLimit;
  if (fields.creditsBalance !== undefined) merged.creditsBalance = fields.creditsBalance;
  if (fields.rateLimitReachedType !== undefined) {
    merged.rateLimitReachedType = fields.rateLimitReachedType;
  }
  if (fields.primaryOverSecondaryLimitPercent !== undefined) {
    merged.primaryOverSecondaryLimitPercent = fields.primaryOverSecondaryLimitPercent;
  }
  if (summary.source === 'none' && fields.source) {
    merged.source = fields.source;
  }
  return merged;
};

const quotaFromRemainingFractions = (
  fractions: Array<number | null>,
  resetLabel: string,
  planType: string | null
): AccountQuotaSummary => {
  const values = fractions
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => clampPercent(value * 100));
  if (values.length === 0) {
    return {
      status: 'unknown',
      remainingPercent: null,
      usedPercent: null,
      resetLabel,
      planType,
      source: 'cache',
    };
  }
  const remainingPercent = Math.min(...values);
  return {
    status: getQuotaStatusFromRemaining(remainingPercent),
    remainingPercent,
    usedPercent: clampPercent(100 - remainingPercent),
    resetLabel,
    planType,
    source: 'cache',
  };
};

const quotaFromError = (
  error: string | undefined,
  planType: string | null
): AccountQuotaSummary => ({
  status: 'error',
  remainingPercent: null,
  usedPercent: null,
  resetLabel: '-',
  planType,
  source: 'cache',
  error,
});

export const resolveAccountQuota = (
  file: AuthFileItem,
  stores: AccountQuotaStores,
  overrides?: AccountQuotaOverrides
): AccountQuotaSummary => {
  const provider = normalizeAccountProvider(file);
  const filePlanType = readPlanType(file);
  if (file.disabled === true) {
    return {
      status: 'disabled',
      remainingPercent: null,
      usedPercent: null,
      resetLabel: '-',
      planType: filePlanType,
      source: 'none',
    };
  }

  if (provider === 'codex') {
    const selectionKey = getAuthFileSelectionKey(file);
    const quota =
      overrides?.codexQuotaBySelectionKey?.get(selectionKey) ?? stores.codexQuota[file.name];
    const headerSnapshot = overrides?.codexHeaderSnapshotBySelectionKey?.get(selectionKey);
    const headerObservationFields = quotaObservationFieldsFromSnapshot(headerSnapshot);
    const headerPlanType = readString(getHeaderSnapshotPlanType(headerSnapshot)).toLowerCase();
    const observedPlanType = headerPlanType || filePlanType;
    if (!quota) {
      return mergeQuotaObservationFields(emptyQuota(observedPlanType), headerObservationFields);
    }
    if (quota.status === 'loading') {
      return mergeQuotaObservationFields(
        loadingQuota(quota.planType ?? observedPlanType),
        headerObservationFields
      );
    }
    if (quota.status === 'error') {
      return mergeQuotaObservationFields(
        quotaFromError(quota.error, quota.planType ?? observedPlanType),
        headerObservationFields
      );
    }
    return mergeQuotaObservationFields(
      quotaFromUsedWindows(
        quota.windows,
        quota.planType ?? observedPlanType,
        quotaObservationFields(quota)
      ),
      headerObservationFields
    );
  }

  if (provider === 'claude') {
    const quota = stores.claudeQuota[file.name];
    if (!quota) return emptyQuota(filePlanType);
    if (quota.status === 'loading') return loadingQuota(quota.planType ?? filePlanType);
    if (quota.status === 'error')
      return quotaFromError(quota.error, quota.planType ?? filePlanType);
    return quotaFromUsedWindows(quota.windows, quota.planType ?? filePlanType);
  }

  if (provider === 'antigravity') {
    const quota = stores.antigravityQuota[file.name];
    if (!quota) return emptyQuota(filePlanType);
    const subscriptionPlan =
      readString(quota.subscription?.plan) ||
      readString(quota.subscription?.tierName) ||
      readString(quota.subscription?.tierId);
    const planType = filePlanType ?? (subscriptionPlan ? subscriptionPlan.toLowerCase() : null);
    if (quota.status === 'loading') return loadingQuota(planType);
    if (quota.status === 'error') return quotaFromError(quota.error, planType);
    const buckets = quota.groups.flatMap((group) => group.buckets);
    return quotaFromRemainingFractions(
      buckets.map((bucket) => bucket.remainingFraction),
      buckets.find((bucket) => readString(bucket.resetTime))?.resetTime ?? '-',
      planType
    );
  }

  if (provider === 'kimi') {
    const quota = stores.kimiQuota[file.name];
    if (!quota) return emptyQuota(filePlanType);
    if (quota.status === 'loading') return loadingQuota(filePlanType);
    if (quota.status === 'error') return quotaFromError(quota.error, filePlanType);
    const remainingFractions = quota.rows.map((row) =>
      row.limit > 0 ? Math.max(0, row.limit - row.used) / row.limit : null
    );
    return quotaFromRemainingFractions(
      remainingFractions,
      quota.rows.find((row) => readString(row.resetHint))?.resetHint ?? '-',
      filePlanType
    );
  }

  if (provider === 'xai') {
    const quota = stores.xaiQuota[file.name];
    if (!quota) return emptyQuota(filePlanType);
    if (quota.status === 'loading') return loadingQuota(filePlanType);
    if (quota.status === 'error') return quotaFromError(quota.error, filePlanType);
    const usedPercent =
      quota.billing?.usedPercent === null || quota.billing?.usedPercent === undefined
        ? null
        : clampPercent(quota.billing.usedPercent);
    const remainingPercent = usedPercent === null ? null : clampPercent(100 - usedPercent);
    return {
      status: getQuotaStatusFromRemaining(remainingPercent),
      remainingPercent,
      usedPercent,
      resetLabel: quota.billing?.billingPeriodEnd ?? '-',
      planType: filePlanType,
      source: 'cache',
    };
  }

  return emptyQuota(filePlanType);
};

const emptyQuota = (planType: string | null): AccountQuotaSummary => ({
  status: 'unknown',
  remainingPercent: null,
  usedPercent: null,
  resetLabel: '-',
  planType,
  source: 'none',
});

const loadingQuota = (planType: string | null): AccountQuotaSummary => ({
  status: 'loading',
  remainingPercent: null,
  usedPercent: null,
  resetLabel: '-',
  planType,
  source: 'cache',
});

const buildInspectionMap = (
  results: CodexInspectionResult[] | undefined
): Map<string, AccountInspectionSummary> => {
  const map = new Map<string, AccountInspectionSummary>();
  if (!results) return map;

  results.forEach((result) => {
    const fileName = result.fileName.trim();
    if (!fileName) return;
    const key = getAuthFileCodexInspectionKey(fileName, result.authIndex);
    const current = map.get(key);
    if (current && current.createdAtMs >= result.createdAtMs) return;
    map.set(key, {
      action: result.action || 'keep',
      actionReason: result.actionReason || '',
      actionStatus: result.actionStatus || 'none',
      statusCode: result.statusCode ?? null,
      usedPercent: result.usedPercent ?? null,
      isQuota: result.isQuota ?? null,
      runId: result.runId,
      resultId: result.id,
      createdAtMs: result.createdAtMs,
    });
  });
  return map;
};

const buildUsageSummary = (file: AuthFileItem): AccountUsageSummary => {
  const recentRequests = normalizeRecentRequestBuckets(file.recent_requests ?? file.recentRequests);
  const totals = sumRecentRequests(recentRequests);
  const total = totals.success + totals.failure;
  return {
    success: totals.success,
    failure: totals.failure,
    successRate: total > 0 ? (totals.success / total) * 100 : null,
    recentRequests,
  };
};

export const buildAccountRows = (
  files: AuthFileItem[],
  stores: AccountQuotaStores,
  inspectionResults?: CodexInspectionResult[],
  overrides?: AccountQuotaOverrides
): AccountRow[] => {
  const inspectionByFile = buildInspectionMap(inspectionResults);
  return files.map((file) => {
    const provider = normalizeAccountProvider(file);
    const authIndex = readAuthIndex(file);
    const selectionKey = getAuthFileSelectionKey(file);
    const quota = resolveAccountQuota(file, stores, overrides);
    return {
      key: file.name,
      selectionKey,
      fileName: file.name,
      accountLabel: resolveAccountLabel(file),
      provider,
      planType: quota.planType ?? readPlanType(file),
      disabled: file.disabled === true,
      runtimeOnly:
        file.runtimeOnly === true || file.runtimeOnly === 'true' || file.runtime_only === true,
      statusMessage: resolveStatusMessage(file),
      authIndex,
      projectId: readProjectId(file),
      priority: readNumber(file.priority),
      quota,
      usage: buildUsageSummary(file),
      inspection: inspectionByFile.get(getAuthFileCodexInspectionKey(file.name, authIndex)) ?? null,
      raw: file,
    };
  });
};

export const buildAccountMetrics = (rows: AccountRow[]): AccountMetrics => {
  const totals = rows.reduce(
    (acc, row) => {
      acc.success += row.usage.success;
      acc.failure += row.usage.failure;
      return acc;
    },
    { success: 0, failure: 0 }
  );
  const totalRequests = totals.success + totals.failure;
  return {
    total: rows.length,
    available: rows.filter((row) => !row.disabled && !row.statusMessage).length,
    lowQuota: rows.filter((row) => row.quota.status === 'low').length,
    exhausted: rows.filter((row) => row.quota.status === 'exhausted').length,
    disabled: rows.filter((row) => row.disabled).length,
    needsInspectionAction: rows.filter((row) =>
      row.inspection
        ? ['delete', 'disable', 'enable', 'reauth'].includes(row.inspection.action)
        : false
    ).length,
    successRate: totalRequests > 0 ? (totals.success / totalRequests) * 100 : null,
  };
};

export const filterAccountRows = (rows: AccountRow[], filters: AccountRowFilters): AccountRow[] => {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.provider !== 'all' && row.provider !== filters.provider) return false;
    if (filters.plan !== 'all' && (row.planType ?? 'unknown') !== filters.plan) return false;
    if (!matchesStatusFilter(row, filters.status)) return false;
    if (!matchesQuotaBand(row, filters.quotaBand)) return false;
    if (!search) return true;
    const values = [
      row.accountLabel,
      row.fileName,
      row.provider,
      row.planType,
      row.authIndex,
      row.projectId,
      row.statusMessage,
      row.quota.source,
      row.quota.error,
      row.quota.observedTraceId,
      row.quota.observedErrorKind,
      row.quota.observedErrorCode,
      row.quota.activeLimit,
      row.quota.creditsBalance,
      row.quota.rateLimitReachedType,
      row.inspection?.actionReason,
    ];
    return values.some((value) => readString(value).toLowerCase().includes(search));
  });
};

export const sortAccountRows = (rows: AccountRow[], sort?: AccountRowSort): AccountRow[] => {
  const defaultSorted = [...rows].sort(compareDefaultAccountRows);
  if (!sort || sort.key === 'default') return defaultSorted;

  return defaultSorted.sort((left, right) => {
    const byColumn = compareAccountRowsBySort(left, right, sort);
    return byColumn === 0 ? compareDefaultAccountRows(left, right) : byColumn;
  });
};

export const getProviderOptions = (rows: AccountRow[]) =>
  Array.from(new Set(rows.map((row) => row.provider))).sort();

export const getPlanOptions = (rows: AccountRow[]) =>
  Array.from(
    new Set(rows.map((row) => row.planType).filter((value): value is string => Boolean(value)))
  ).sort();

const matchesStatusFilter = (row: AccountRow, status: AccountStatusFilter) => {
  if (status === 'all') return true;
  if (status === 'available') return !row.disabled && !row.statusMessage;
  if (status === 'disabled') return row.disabled;
  if (status === 'problem') return Boolean(row.statusMessage) || row.quota.status === 'error';
  if (status === 'low') return row.quota.status === 'low';
  if (status === 'exhausted') return row.quota.status === 'exhausted';
  if (status === 'inspection') return Boolean(row.inspection && row.inspection.action !== 'keep');
  return true;
};

const matchesQuotaBand = (row: AccountRow, band: AccountQuotaBand) => {
  if (band === 'all') return true;
  const remaining = row.quota.remainingPercent;
  if (band === 'spent') return remaining !== null && remaining <= 0;
  if (band === 'lt20')
    return remaining !== null && remaining > 0 && remaining < QUOTA_LOW_THRESHOLD;
  if (band === 'between20and50') {
    return remaining !== null && remaining >= QUOTA_LOW_THRESHOLD && remaining < QUOTA_OK_THRESHOLD;
  }
  if (band === 'ge50') return remaining !== null && remaining >= QUOTA_OK_THRESHOLD;
  return true;
};

const getRiskRank = (row: AccountRow) => {
  if (row.inspection && row.inspection.action !== 'keep') return 6;
  if (row.quota.status === 'exhausted') return 5;
  if (row.quota.status === 'low') return 4;
  if (row.quota.status === 'error') return 3;
  if (row.disabled) return 2;
  if (row.statusMessage) return 1;
  return 0;
};

const compareDefaultAccountRows = (left: AccountRow, right: AccountRow) => {
  const leftRisk = getRiskRank(left);
  const rightRisk = getRiskRank(right);
  if (leftRisk !== rightRisk) return rightRisk - leftRisk;
  if (left.provider !== right.provider) return left.provider.localeCompare(right.provider);
  return left.fileName.localeCompare(right.fileName, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const compareAccountRowsBySort = (left: AccountRow, right: AccountRow, sort: AccountRowSort) => {
  if (sort.key === 'priority') {
    return compareNumbers(left.priority ?? 0, right.priority ?? 0, sort.direction);
  }
  if (sort.key === 'recent') {
    const leftTotal = left.usage.success + left.usage.failure;
    const rightTotal = right.usage.success + right.usage.failure;
    return compareNumbers(leftTotal, rightTotal, sort.direction);
  }
  if (sort.key === 'reset') {
    return compareResetLabels(left.quota.resetLabel, right.quota.resetLabel, sort.direction);
  }
  return 0;
};

const compareNumbers = (left: number, right: number, direction: AccountRowSortDirection) => {
  const result = left - right;
  return direction === 'asc' ? result : -result;
};

const compareResetLabels = (
  leftRaw: string,
  rightRaw: string,
  direction: AccountRowSortDirection
) => {
  const left = normalizeResetSortLabel(leftRaw);
  const right = normalizeResetSortLabel(rightRaw);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const result = left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  return direction === 'asc' ? result : -result;
};

const normalizeResetSortLabel = (value: string) => {
  const label = readString(value);
  const normalized = label.toLowerCase();
  if (!label || label === '-' || normalized.includes('unknown') || label.includes('未知')) {
    return null;
  }
  return label;
};
