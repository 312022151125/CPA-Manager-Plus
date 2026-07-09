import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  KimiQuotaState,
  XaiBillingSummary,
  XaiQuotaState,
} from '@/types';
import type { UsageHeaderSnapshot } from '@/services/api/usageService';
import { getAuthFileSelectionKey } from '@/features/authFiles/model/authFilesPageModel';
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
export type AccountQuotaSource = 'cache' | 'observed-header' | 'none';
export type AccountQuotaSortDirection = 'asc' | 'desc';

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

const QUOTA_LOW_THRESHOLD = 20;

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

const readTimestampMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export const readAuthFileCreatedAtMs = (file: AuthFileItem): number | null => {
  const candidates = [
    file['createdAtMs'],
    file['created_at_ms'],
    file['createdAt'],
    file['created_at'],
    file['created'],
    file['uploadedAtMs'],
    file['uploaded_at_ms'],
    file['uploadedAt'],
    file['uploaded_at'],
    file['modtime'],
    file.modified,
    file['updatedAt'],
    file['updated_at'],
    file.lastRefresh,
    file['last_refresh'],
  ];
  for (const value of candidates) {
    const timestamp = readTimestampMs(value);
    if (timestamp !== null) return timestamp;
  }
  return null;
};

export const normalizeAccountProvider = (file: AuthFileItem): string => {
  const raw = readString(file.provider) || readString(file.type) || 'unknown';
  const key = raw.toLowerCase().replace(/_/g, '-');
  if (key === 'x-ai' || key === 'grok') return 'xai';
  return key || 'unknown';
};

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

const getQuotaStatusFromRemaining = (remainingPercent: number | null): AccountQuotaStatus => {
  if (remainingPercent === null) return 'unknown';
  if (remainingPercent <= 0) return 'exhausted';
  if (remainingPercent < QUOTA_LOW_THRESHOLD) return 'low';
  return 'ok';
};

const remainingPercentFromUsed = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? clampPercent(100 - value) : null;

const quotaFromRemainingWindows = (
  windows: Array<{
    remainingPercent: number | null;
    usedPercent?: number | null;
    resetLabel?: string;
  }>,
  planType: string | null,
  options: AccountQuotaObservationFields = {}
): AccountQuotaSummary => {
  const source = options.source ?? 'cache';
  const candidates = windows
    .map((window) => {
      const remainingPercent =
        typeof window.remainingPercent === 'number' && Number.isFinite(window.remainingPercent)
          ? clampPercent(window.remainingPercent)
          : remainingPercentFromUsed(window.usedPercent);
      if (remainingPercent === null) return null;
      return {
        remainingPercent,
        usedPercent: clampPercent(100 - remainingPercent),
        resetLabel: readString(window.resetLabel),
      };
    })
    .filter(
      (window): window is { remainingPercent: number; usedPercent: number; resetLabel: string } =>
        window !== null
    );

  if (candidates.length === 0) {
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

  const selected = candidates.reduce((current, next) =>
    next.remainingPercent < current.remainingPercent ? next : current
  );
  const resetLabel =
    selected.resetLabel ||
    candidates.find((window) => readString(window.resetLabel))?.resetLabel ||
    '-';
  return {
    status: getQuotaStatusFromRemaining(selected.remainingPercent),
    remainingPercent: selected.remainingPercent,
    usedPercent: selected.usedPercent,
    resetLabel,
    planType,
    ...options,
    source,
  };
};

const quotaFromUsedWindows = (
  windows: Array<{ usedPercent: number | null; resetLabel?: string }>,
  planType: string | null,
  options: AccountQuotaObservationFields = {}
): AccountQuotaSummary =>
  quotaFromRemainingWindows(
    windows.map((window) => ({
      remainingPercent: remainingPercentFromUsed(window.usedPercent),
      usedPercent: window.usedPercent,
      resetLabel: window.resetLabel,
    })),
    planType,
    options
  );

const quotaFromXaiBilling = (
  billing: XaiBillingSummary | null | undefined,
  planType: string | null
): AccountQuotaSummary => {
  if (!billing) {
    return quotaFromRemainingWindows([{ remainingPercent: null }], planType);
  }

  const resetLabel = billing.billingPeriodEnd ?? '-';
  const periodResetLabel = billing.periodEnd ?? resetLabel;
  const periodRemainingPercent =
    billing.periodType === 'weekly' ? remainingPercentFromUsed(billing.usagePercent) : null;
  const monthlyLimitCents = billing.monthlyLimitCents;
  const monthlyRemainingCents =
    monthlyLimitCents !== null && billing.includedUsedCents !== null
      ? Math.max(0, monthlyLimitCents - billing.includedUsedCents)
      : null;
  const onDemandEnabled = billing.onDemandCapCents !== null && billing.onDemandCapCents > 0;
  const onDemandRemainingCents =
    onDemandEnabled && billing.onDemandUsedCents !== null && billing.onDemandCapCents !== null
      ? Math.max(0, billing.onDemandCapCents - billing.onDemandUsedCents)
      : null;
  const hasMonthlyComponent = monthlyLimitCents !== null && monthlyLimitCents > 0;
  const monthlyComponentKnown = !hasMonthlyComponent || monthlyRemainingCents !== null;
  const onDemandComponentKnown = !onDemandEnabled || onDemandRemainingCents !== null;
  const totalLimitCents =
    (monthlyLimitCents ?? 0) + (onDemandEnabled ? (billing.onDemandCapCents ?? 0) : 0);
  const totalRemainingCents =
    (monthlyRemainingCents ?? 0) + (onDemandEnabled ? (onDemandRemainingCents ?? 0) : 0);

  if (totalLimitCents > 0 && monthlyComponentKnown && onDemandComponentKnown) {
    return quotaFromRemainingWindows(
      [
        ...(periodRemainingPercent !== null
          ? [
              {
                remainingPercent: periodRemainingPercent,
                usedPercent: billing.usagePercent,
                resetLabel: periodResetLabel,
              },
            ]
          : []),
        {
          remainingPercent: (totalRemainingCents / totalLimitCents) * 100,
          resetLabel,
        },
      ],
      planType
    );
  }

  if (onDemandEnabled) {
    const onDemandRemainingPercent = remainingPercentFromUsed(billing.onDemandUsedPercent);
    if (onDemandRemainingPercent !== null) {
      return quotaFromRemainingWindows(
        [
          ...(periodRemainingPercent !== null
            ? [
                {
                  remainingPercent: periodRemainingPercent,
                  usedPercent: billing.usagePercent,
                  resetLabel: periodResetLabel,
                },
              ]
            : []),
          {
            remainingPercent: onDemandRemainingPercent,
            usedPercent: billing.onDemandUsedPercent,
            resetLabel,
          },
        ],
        planType
      );
    }

    const monthlyRemainingPercent = remainingPercentFromUsed(billing.usedPercent);
    if (monthlyRemainingPercent !== null && monthlyRemainingPercent <= 0) {
      return quotaFromRemainingWindows([{ remainingPercent: null, resetLabel }], planType);
    }
  }

  return quotaFromRemainingWindows(
    [
      ...(periodRemainingPercent !== null
        ? [
            {
              remainingPercent: periodRemainingPercent,
              usedPercent: billing.usagePercent,
              resetLabel: periodResetLabel,
            },
          ]
        : []),
      {
        remainingPercent: remainingPercentFromUsed(billing.usedPercent),
        usedPercent: billing.usedPercent,
        resetLabel,
      },
    ],
    planType
  );
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
    return quotaFromRemainingWindows(
      buckets.map((bucket) => ({
        remainingPercent:
          typeof bucket.remainingFraction === 'number' && Number.isFinite(bucket.remainingFraction)
            ? bucket.remainingFraction * 100
            : null,
        resetLabel: bucket.resetTime,
      })),
      planType
    );
  }

  if (provider === 'kimi') {
    const quota = stores.kimiQuota[file.name];
    if (!quota) return emptyQuota(filePlanType);
    if (quota.status === 'loading') return loadingQuota(filePlanType);
    if (quota.status === 'error') return quotaFromError(quota.error, filePlanType);
    return quotaFromRemainingWindows(
      quota.rows.map((row) => ({
        remainingPercent:
          row.limit > 0 ? (Math.max(0, row.limit - row.used) / row.limit) * 100 : null,
        resetLabel: row.resetHint,
      })),
      filePlanType
    );
  }

  if (provider === 'xai') {
    const quota = stores.xaiQuota[file.name];
    if (!quota) return emptyQuota(filePlanType);
    if (quota.status === 'loading') return loadingQuota(filePlanType);
    if (quota.status === 'error') return quotaFromError(quota.error, filePlanType);
    return quotaFromXaiBilling(quota.billing, filePlanType);
  }

  return emptyQuota(filePlanType);
};

export const compareQuotaResetLabels = (
  leftRaw: string,
  rightRaw: string,
  direction: AccountQuotaSortDirection
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
