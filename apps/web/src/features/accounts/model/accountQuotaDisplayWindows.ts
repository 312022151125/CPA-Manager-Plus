import type { TFunction } from 'i18next';
import type { AuthFileItem, ClaudeExtraUsage, CodexQuotaState, XaiBillingSummary } from '@/types';
import { formatKimiResetHint, formatQuotaResetTime } from '@/utils/quota/formatters';
import type { AccountRow } from './accountRows';
import type { AccountQuotaStores } from './accountQuotaSummary';

export type AccountQuotaWindowKind =
  | 'five_hour'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'billing'
  | 'payg'
  | 'product'
  | 'summary'
  | 'unknown';

export type AccountQuotaWindowSource =
  | 'codex'
  | 'claude'
  | 'antigravity'
  | 'kimi'
  | 'xai'
  | 'summary';

export interface AccountQuotaDisplayWindow {
  key: string;
  label: string;
  kind?: AccountQuotaWindowKind;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetLabel: string;
  limitWindowSeconds: number | null;
  resetAtMs: number | null;
  fromMs: number | null;
  toMs: number | null;
  amountLabel?: string;
  description?: string;
  groupLabel?: string;
  source?: AccountQuotaWindowSource;
}

export type TranslateQuotaWindowLabel = (
  label: string | undefined,
  labelKey?: string,
  labelParams?: Record<string, string | number>
) => string;

export interface BuildAccountQuotaDisplayWindowsOptions {
  stores: AccountQuotaStores;
  getDisplayCodexQuota?: (file: AuthFileItem) => CodexQuotaState | undefined;
  translateQuotaWindowLabel: TranslateQuotaWindowLabel;
  t: TFunction;
  nowMs?: number;
}

const ANTIGRAVITY_GROUP_LABEL_KEYS = new Map<string, string>([
  ['gemini models', 'group_gemini_models'],
  ['claude and gpt models', 'group_claude_gpt_models'],
]);

const ANTIGRAVITY_BUCKET_LABEL_KEYS = new Map<string, string>([
  ['weekly limit', 'weekly_limit'],
  ['daily limit', 'daily_limit'],
  ['5 hour limit', 'five_hour_limit'],
  ['5-hour limit', 'five_hour_limit'],
  ['five hour limit', 'five_hour_limit'],
  ['monthly limit', 'monthly_limit'],
]);

export const clampDisplayPercent = (value: number) => Math.max(0, Math.min(100, value));

export const remainingPercentFromUsed = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? clampDisplayPercent(100 - value) : null;

const formatTimestamp = (value: number | null, locale: string) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export const formatQuotaResetInlineLabel = (value: string, locale: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return '';
  const timestamp = Date.parse(trimmed);
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && Number.isFinite(timestamp)) {
    return formatTimestamp(timestamp, locale);
  }
  return trimmed;
};

const normalizeText = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const translateAntigravityQuotaLabel = (
  value: string,
  keys: Map<string, string>,
  t: TFunction
): string => {
  const key = keys.get(normalizeText(value));
  return key ? t(`antigravity_quota.${key}`) : value;
};

const translateAntigravityQuotaDescription = (
  value: string | undefined,
  t: TFunction
): string | undefined => {
  if (!value) return undefined;
  const modelsMatch = value.match(/^models within this group:\s*(.+)$/i);
  if (modelsMatch) {
    return t('antigravity_quota.group_models_description', {
      models: modelsMatch[1].trim(),
    });
  }
  return value;
};

const formatDisplayResetTime = (value: string | undefined): string => {
  if (!value) return '-';
  const formatted = formatQuotaResetTime(value);
  return formatted === '-' ? value : formatted;
};

const formatXaiCurrency = (value: number | null): string => {
  if (value === null) return '--';
  return `$${(value / 100).toFixed(2)}`;
};

const formatClaudeExtraUsageAmount = (extraUsage: ClaudeExtraUsage): string =>
  `$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`;

const getClaudeExtraUsageUsedPercent = (extraUsage: ClaudeExtraUsage): number | null => {
  if (typeof extraUsage.utilization === 'number' && Number.isFinite(extraUsage.utilization)) {
    return clampDisplayPercent(extraUsage.utilization);
  }
  if (extraUsage.monthly_limit > 0) {
    return clampDisplayPercent((extraUsage.used_credits / extraUsage.monthly_limit) * 100);
  }
  return null;
};

const formatXaiMonthlyAmount = (billing: XaiBillingSummary, t: TFunction): string => {
  const remainingCents =
    billing.monthlyLimitCents !== null && billing.includedUsedCents !== null
      ? Math.max(0, billing.monthlyLimitCents - billing.includedUsedCents)
      : null;
  return t('xai_quota.usage_amount', {
    remaining: formatXaiCurrency(remainingCents),
    limit: formatXaiCurrency(billing.monthlyLimitCents),
  });
};

const formatXaiPaygAmount = (billing: XaiBillingSummary, t: TFunction): string => {
  const remainingCents =
    billing.onDemandCapCents !== null && billing.onDemandUsedCents !== null
      ? Math.max(0, billing.onDemandCapCents - billing.onDemandUsedCents)
      : null;
  return t('xai_quota.usage_amount', {
    remaining: formatXaiCurrency(remainingCents),
    limit: formatXaiCurrency(billing.onDemandCapCents),
  });
};

const getXaiPeriodWindowLabel = (billing: XaiBillingSummary, t: TFunction): string => {
  if (billing.periodType === 'weekly') return t('accounts.quota_rate_limit_type_weekly');
  if (billing.periodType === 'monthly') return t('xai_quota.monthly_credits');
  return t('xai_quota.monthly_credits');
};

const durationKindFromSeconds = (
  value: number | null | undefined
): AccountQuotaWindowKind | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 4 * 60 * 60 && value <= 6 * 60 * 60) return 'five_hour';
  if (value >= 23 * 60 * 60 && value <= 25 * 60 * 60) return 'daily';
  if (value >= 6 * 24 * 60 * 60 && value <= 8 * 24 * 60 * 60) return 'weekly';
  if (value >= 27 * 24 * 60 * 60 && value <= 32 * 24 * 60 * 60) return 'monthly';
  return null;
};

export const inferAccountQuotaWindowKind = ({
  key,
  label,
  limitWindowSeconds,
}: {
  key: string;
  label: string;
  limitWindowSeconds?: number | null;
}): AccountQuotaWindowKind | null => {
  const durationKind = durationKindFromSeconds(limitWindowSeconds);
  if (durationKind) return durationKind;

  const text = `${key} ${label}`.toLowerCase();
  if (/(pay-as-you-go|payg|on[-_\s]?demand|按量|按需)/.test(text)) return 'payg';
  if (/(billing|账单|帳單)/.test(text)) return 'billing';
  if (/(product|model|模型|产品|產品)/.test(text)) return 'product';
  if (/(month|monthly|30d|31d|月)/.test(text)) return 'monthly';
  if (/(week|weekly|7d|7 day|seven|周|週)/.test(text)) return 'weekly';
  if (/(day|daily|24h|24 h|日)/.test(text)) return 'daily';
  if (/(five|5h|5 h|5-hour|5_hour|five-hour|5小时|5 小时|五小时|primary)/.test(text)) {
    return 'five_hour';
  }
  if (/(summary|quota|额度|額度)/.test(text)) return 'summary';
  return null;
};

export const getQuotaWindowShortLabel = (window: AccountQuotaDisplayWindow) => {
  const kind =
    window.kind ??
    inferAccountQuotaWindowKind({
      key: window.key,
      label: window.label,
      limitWindowSeconds: window.limitWindowSeconds,
    });

  if (kind === 'five_hour') return '5H';
  if (kind === 'daily') return '24H';
  if (kind === 'weekly') return '7D';
  if (kind === 'monthly' || kind === 'billing') return '30D';
  if (kind === 'payg') return 'PAYG';
  if (kind === 'product') return 'PROD';
  if (kind === 'summary') return 'SUM';
  return window.label.slice(0, 3).toUpperCase();
};

export const parseQuotaResetLabelMs = (value: string, nowMs = Date.now()) => {
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

export const buildQuotaWindowRange = (
  resetLabel: string,
  limitWindowSeconds: number | null | undefined,
  nowMs = Date.now()
) => {
  const resetAtMs = parseQuotaResetLabelMs(resetLabel, nowMs);
  if (!limitWindowSeconds || limitWindowSeconds <= 0) {
    return { resetAtMs, fromMs: null, toMs: null };
  }
  if (!resetAtMs) return { resetAtMs: null, fromMs: null, toMs: null };
  const durationMs = Math.round(limitWindowSeconds * 1000);
  const fromMs = resetAtMs - durationMs;
  const toMs = Math.min(nowMs, resetAtMs);
  if (fromMs <= 0 || toMs <= fromMs) {
    return { resetAtMs, fromMs: null, toMs: null };
  }
  return { resetAtMs, fromMs, toMs };
};

export const buildAccountQuotaDisplayWindow = ({
  key,
  label,
  kind,
  remainingPercent,
  usedPercent,
  resetLabel,
  limitWindowSeconds = null,
  amountLabel,
  description,
  groupLabel,
  source,
  nowMs,
}: {
  key: string;
  label: string;
  kind?: AccountQuotaWindowKind;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetLabel: string;
  limitWindowSeconds?: number | null;
  amountLabel?: string;
  description?: string;
  groupLabel?: string;
  source?: AccountQuotaWindowSource;
  nowMs?: number;
}): AccountQuotaDisplayWindow => {
  const normalizedResetLabel = resetLabel || '-';
  const normalizedLimitWindowSeconds = limitWindowSeconds ?? null;
  const range = buildQuotaWindowRange(normalizedResetLabel, normalizedLimitWindowSeconds, nowMs);
  return {
    key,
    label,
    kind:
      kind ??
      inferAccountQuotaWindowKind({
        key,
        label,
        limitWindowSeconds: normalizedLimitWindowSeconds,
      }) ??
      undefined,
    remainingPercent,
    usedPercent,
    resetLabel: normalizedResetLabel,
    limitWindowSeconds: normalizedLimitWindowSeconds,
    amountLabel,
    description,
    groupLabel,
    source,
    ...range,
  };
};

const buildCodexQuotaDisplayWindows = (
  row: AccountRow,
  options: BuildAccountQuotaDisplayWindowsOptions
): AccountQuotaDisplayWindow[] => {
  const quota = options.getDisplayCodexQuota?.(row.raw) ?? options.stores.codexQuota[row.fileName];
  if (!quota?.windows?.length) return [];
  return quota.windows.map((window) =>
    buildAccountQuotaDisplayWindow({
      key: window.id,
      label: options.translateQuotaWindowLabel(window.label, window.labelKey, window.labelParams),
      remainingPercent: remainingPercentFromUsed(window.usedPercent),
      usedPercent: window.usedPercent,
      resetLabel: window.resetLabel || '-',
      limitWindowSeconds: window.limitWindowSeconds ?? null,
      source: 'codex',
      nowMs: options.nowMs,
    })
  );
};

const buildClaudeQuotaDisplayWindows = (
  row: AccountRow,
  options: BuildAccountQuotaDisplayWindowsOptions
): AccountQuotaDisplayWindow[] => {
  const quota = options.stores.claudeQuota[row.fileName];
  if (!quota) return [];
  const windows =
    quota.windows?.map((window) =>
      buildAccountQuotaDisplayWindow({
        key: window.id,
        label: options.translateQuotaWindowLabel(window.label, window.labelKey),
        remainingPercent: remainingPercentFromUsed(window.usedPercent),
        usedPercent: window.usedPercent,
        resetLabel: window.resetLabel || '-',
        source: 'claude',
        nowMs: options.nowMs,
      })
    ) ?? [];

  if (quota.extraUsage?.is_enabled) {
    const usedPercent = getClaudeExtraUsageUsedPercent(quota.extraUsage);
    windows.push(
      buildAccountQuotaDisplayWindow({
        key: 'extra-usage',
        label: options.t('claude_quota.extra_usage_label'),
        kind: 'monthly',
        remainingPercent: remainingPercentFromUsed(usedPercent),
        usedPercent,
        resetLabel: '-',
        amountLabel: formatClaudeExtraUsageAmount(quota.extraUsage),
        source: 'claude',
        nowMs: options.nowMs,
      })
    );
  }

  return windows;
};

const buildAntigravityQuotaDisplayWindows = (
  row: AccountRow,
  options: BuildAccountQuotaDisplayWindowsOptions
): AccountQuotaDisplayWindow[] => {
  const quota = options.stores.antigravityQuota[row.fileName];
  const groups = quota?.groups ?? [];
  return groups.flatMap((group) => {
    const groupLabel = translateAntigravityQuotaLabel(
      group.label,
      ANTIGRAVITY_GROUP_LABEL_KEYS,
      options.t
    );
    const groupDescription = translateAntigravityQuotaDescription(group.description, options.t);

    return group.buckets.map((bucket) => {
      const remainingPercent = clampDisplayPercent(bucket.remainingFraction * 100);
      const label = translateAntigravityQuotaLabel(
        bucket.label || bucket.id,
        ANTIGRAVITY_BUCKET_LABEL_KEYS,
        options.t
      );
      const description =
        translateAntigravityQuotaDescription(bucket.description, options.t) ?? groupDescription;
      const kind =
        inferAccountQuotaWindowKind({
          key: bucket.window ?? '',
          label,
        }) ??
        inferAccountQuotaWindowKind({
          key: bucket.id,
          label,
        }) ??
        undefined;
      return buildAccountQuotaDisplayWindow({
        key: `${group.id}:${bucket.id}`,
        label,
        kind,
        remainingPercent,
        usedPercent: clampDisplayPercent(100 - remainingPercent),
        resetLabel: formatDisplayResetTime(bucket.resetTime),
        description,
        groupLabel,
        source: 'antigravity',
        nowMs: options.nowMs,
      });
    });
  });
};

const buildKimiQuotaDisplayWindows = (
  row: AccountRow,
  options: BuildAccountQuotaDisplayWindowsOptions
): AccountQuotaDisplayWindow[] => {
  const quota = options.stores.kimiQuota[row.fileName];
  if (!quota?.rows?.length) return [];
  return quota.rows.map((quotaRow) => {
    const remainingPercent =
      quotaRow.limit > 0
        ? clampDisplayPercent(((quotaRow.limit - quotaRow.used) / quotaRow.limit) * 100)
        : null;
    const label = options.translateQuotaWindowLabel(
      quotaRow.label,
      quotaRow.labelKey,
      quotaRow.labelParams
    );
    return buildAccountQuotaDisplayWindow({
      key: quotaRow.id,
      label,
      remainingPercent,
      usedPercent: remainingPercent === null ? null : clampDisplayPercent(100 - remainingPercent),
      resetLabel: formatKimiResetHint(options.t, quotaRow.resetHint) || '-',
      amountLabel: `${quotaRow.used} / ${quotaRow.limit}`,
      source: 'kimi',
      nowMs: options.nowMs,
    });
  });
};

const buildXaiQuotaDisplayWindows = (
  row: AccountRow,
  options: BuildAccountQuotaDisplayWindowsOptions
): AccountQuotaDisplayWindow[] => {
  const billing = options.stores.xaiQuota[row.fileName]?.billing;
  if (!billing) return [];

  const resetLabel = billing.billingPeriodEnd
    ? formatDisplayResetTime(billing.billingPeriodEnd)
    : '-';
  const windows: AccountQuotaDisplayWindow[] = [];
  const periodUsedPercent =
    typeof billing.usagePercent === 'number' && Number.isFinite(billing.usagePercent)
      ? clampDisplayPercent(billing.usagePercent)
      : null;

  if (billing.periodType === 'weekly' || (billing.productUsage?.length ?? 0) > 0) {
    windows.push(
      buildAccountQuotaDisplayWindow({
        key: 'credits-period',
        label: getXaiPeriodWindowLabel(billing, options.t),
        kind: billing.periodType === 'weekly' ? 'weekly' : 'billing',
        remainingPercent: remainingPercentFromUsed(periodUsedPercent),
        usedPercent: periodUsedPercent,
        resetLabel: billing.periodEnd ? formatDisplayResetTime(billing.periodEnd) : '-',
        source: 'xai',
        nowMs: options.nowMs,
      })
    );
  }

  const monthlyUsedPercent =
    typeof billing.usedPercent === 'number' && Number.isFinite(billing.usedPercent)
      ? clampDisplayPercent(billing.usedPercent)
      : null;

  if (
    monthlyUsedPercent !== null ||
    billing.monthlyLimitCents !== null ||
    billing.includedUsedCents !== null ||
    billing.billingPeriodEnd
  ) {
    windows.push(
      buildAccountQuotaDisplayWindow({
        key: 'billing',
        label: options.t('xai_quota.monthly_credits'),
        kind: 'billing',
        remainingPercent: remainingPercentFromUsed(monthlyUsedPercent),
        usedPercent: monthlyUsedPercent,
        resetLabel,
        amountLabel: formatXaiMonthlyAmount(billing, options.t),
        source: 'xai',
        nowMs: options.nowMs,
      })
    );
  }

  const onDemandCap = billing.onDemandCapCents ?? 0;
  if (onDemandCap > 0) {
    const paygUsedPercent =
      typeof billing.onDemandUsedPercent === 'number' &&
      Number.isFinite(billing.onDemandUsedPercent)
        ? clampDisplayPercent(billing.onDemandUsedPercent)
        : null;
    windows.push(
      buildAccountQuotaDisplayWindow({
        key: 'pay-as-you-go',
        label: options.t('xai_quota.pay_as_you_go_label'),
        kind: 'payg',
        remainingPercent: remainingPercentFromUsed(paygUsedPercent),
        usedPercent: paygUsedPercent,
        resetLabel,
        amountLabel: formatXaiPaygAmount(billing, options.t),
        source: 'xai',
        nowMs: options.nowMs,
      })
    );
  }

  return windows;
};

const buildSummaryQuotaDisplayWindow = (
  row: AccountRow,
  options: BuildAccountQuotaDisplayWindowsOptions
): AccountQuotaDisplayWindow[] => {
  if (row.quota.remainingPercent === null && row.quota.usedPercent === null) return [];
  return [
    buildAccountQuotaDisplayWindow({
      key: 'summary',
      label: options.t('accounts.col_quota'),
      kind: 'summary',
      remainingPercent: row.quota.remainingPercent,
      usedPercent: row.quota.usedPercent,
      resetLabel: row.quota.resetLabel,
      source: 'summary',
      nowMs: options.nowMs,
    }),
  ];
};

export const buildAccountQuotaDisplayWindows = (
  row: AccountRow,
  options: BuildAccountQuotaDisplayWindowsOptions
): AccountQuotaDisplayWindow[] => {
  if (row.provider === 'codex') {
    const windows = buildCodexQuotaDisplayWindows(row, options);
    if (windows.length) return windows;
  }

  if (row.provider === 'claude') {
    const windows = buildClaudeQuotaDisplayWindows(row, options);
    if (windows.length) return windows;
  }

  if (row.provider === 'antigravity') {
    const windows = buildAntigravityQuotaDisplayWindows(row, options);
    if (windows.length) return windows;
  }

  if (row.provider === 'kimi') {
    const windows = buildKimiQuotaDisplayWindows(row, options);
    if (windows.length) return windows;
  }

  if (row.provider === 'xai') {
    const windows = buildXaiQuotaDisplayWindows(row, options);
    if (windows.length) return windows;
  }

  return buildSummaryQuotaDisplayWindow(row, options);
};
