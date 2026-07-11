import type { TFunction } from 'i18next';
import type { AuthFileItem, XaiBillingSummary } from '@/types';
import {
  formatQuotaResetTime,
  getStatusFromError,
  isDisabledAuthFile,
  fetchXaiQuota,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';
import type {
  GrokInspectionAccount,
  GrokInspectionLogLevel,
  GrokInspectionQuotaWindow,
  GrokInspectionResultItem,
  GrokInspectionSettings,
} from '@/features/monitoring/grokInspection';
import { readString } from './grokInspectionSettings';

type LogHandler = (level: GrokInspectionLogLevel, message: string) => void;

const MAX_INSPECTION_ERROR_DETAIL_LENGTH = 2048;

export const truncateInspectionDetail = (value: unknown) => {
  const text = readString(value);
  if (!text) return '';
  if (text.length <= MAX_INSPECTION_ERROR_DETAIL_LENGTH) return text;
  return `${text.slice(0, MAX_INSPECTION_ERROR_DETAIL_LENGTH - 3)}...`;
};

const readAuthFileName = (file: AuthFileItem) => {
  const name = readString(file.name);
  if (name) return name;
  const id = readString(file.id);
  if (id) return id;
  const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
  return authIndex || 'unknown-auth-file';
};

const readDisplayAccount = (file: AuthFileItem) =>
  readString(file.account) ||
  readString(file.email) ||
  readString(file.label) ||
  readString(file.name) ||
  readString(file.id) ||
  normalizeAuthIndex(file['auth_index'] ?? file.authIndex) ||
  '-';

export const toGrokInspectionAccount = (file: AuthFileItem): GrokInspectionAccount => ({
  key: `${readAuthFileName(file)}::${normalizeAuthIndex(file['auth_index'] ?? file.authIndex) || '-'}`,
  fileName: readAuthFileName(file),
  displayAccount: readDisplayAccount(file),
  authIndex: normalizeAuthIndex(file['auth_index'] ?? file.authIndex) || '',
  provider: 'xai',
  disabled: isDisabledAuthFile(file),
  status: readString(file.status),
  state: readString(file.state),
  raw: file,
});

const withRetry = async <T>(retries: number, task: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const maxUsedPercent = (windows: GrokInspectionQuotaWindow[]): number | null => {
  let max: number | null = null;
  for (const window of windows) {
    if (window.usedPercent === null || !Number.isFinite(window.usedPercent)) continue;
    if (max === null || window.usedPercent > max) {
      max = window.usedPercent;
    }
  }
  return max;
};

export const buildGrokQuotaWindows = (billing: XaiBillingSummary): GrokInspectionQuotaWindow[] => {
  const windows: GrokInspectionQuotaWindow[] = [
    {
      id: 'weekly',
      labelKey: 'xai_quota.weekly_limit',
      usedPercent: billing.periodType === 'weekly' ? billing.usagePercent : null,
      resetLabel: formatQuotaResetTime(billing.periodEnd),
    },
    {
      id: 'monthly',
      labelKey: 'xai_quota.monthly_credits',
      usedPercent: billing.usedPercent,
      resetLabel: formatQuotaResetTime(billing.billingPeriodEnd),
    },
  ];

  (billing.productUsage ?? []).forEach((item, index) => {
    windows.push({
      id: `product-${index}`,
      labelKey: 'xai_quota.product_usage',
      labelParams: { product: item.product || String(index + 1) },
      usedPercent: item.usagePercent,
      resetLabel: '',
    });
  });

  return windows;
};

export const resolveGrokProbeAction = (
  account: Pick<GrokInspectionAccount, 'disabled'>,
  usedPercent: number | null,
  threshold: number
): Pick<GrokInspectionResultItem, 'action' | 'actionReason' | 'isQuota'> => {
  if (usedPercent !== null && usedPercent >= threshold && !account.disabled) {
    return {
      action: 'disable',
      actionReason: 'monitoring.grok_inspection_reason_quota_high',
      isQuota: true,
    };
  }
  if (usedPercent !== null && usedPercent >= threshold && account.disabled) {
    return {
      action: 'keep',
      actionReason: 'monitoring.grok_inspection_reason_quota_high_already_disabled',
      isQuota: true,
    };
  }
  if (account.disabled && (usedPercent === null || usedPercent < threshold)) {
    return {
      action: 'enable',
      actionReason: 'monitoring.grok_inspection_reason_recovered',
      isQuota: false,
    };
  }
  return {
    action: 'keep',
    actionReason: 'monitoring.grok_inspection_reason_ok',
    isQuota: false,
  };
};

const translateReason = (t: TFunction | undefined, key: string) => {
  if (!t) return key;
  const translated = t(key);
  return translated || key;
};

export const inspectSingleGrokAccount = async ({
  account,
  settings,
  t,
  onLog,
}: {
  account: GrokInspectionAccount;
  settings: GrokInspectionSettings;
  t: TFunction;
  onLog?: LogHandler;
}): Promise<GrokInspectionResultItem> => {
  try {
    const billing = await withRetry(settings.retries, () => fetchXaiQuota(account.raw, t));
    const quotaWindows = buildGrokQuotaWindows(billing);
    const usedPercent = maxUsedPercent(quotaWindows);
    const decision = resolveGrokProbeAction(
      account,
      usedPercent,
      settings.usedPercentThreshold
    );
    const actionReason = translateReason(t, decision.actionReason);

    const successLevel =
      decision.action === 'disable'
        ? 'warning'
        : decision.action === 'enable'
          ? 'success'
          : 'info';
    const percentText = usedPercent === null ? '--' : `${usedPercent.toFixed(1)}%`;
    onLog?.(
      successLevel,
      `${account.displayAccount} -> ${decision.action} (HTTP 200 · used ${percentText})`
    );

    return {
      ...account,
      action: decision.action,
      actionReason,
      statusCode: 200,
      usedPercent,
      isQuota: decision.isQuota,
      planType: '',
      quotaWindows,
      error: '',
      errorKind: '',
      errorDetail: '',
    };
  } catch (error) {
    const statusCode = getStatusFromError(error) ?? null;
    const errorMessage = error instanceof Error ? error.message : String(error || 'probe failed');
    const errorDetail = truncateInspectionDetail(errorMessage) || 'probe failed';

    if (statusCode === 401 || statusCode === 403) {
      const actionReason = translateReason(t, 'monitoring.grok_inspection_reason_reauth');
      onLog?.(
        'warning',
        `${account.displayAccount} -> reauth (HTTP ${statusCode})`
      );
      return {
        ...account,
        action: 'reauth',
        actionReason,
        statusCode,
        usedPercent: null,
        isQuota: false,
        planType: '',
        quotaWindows: [],
        error: errorMessage,
        errorKind: 'http_status',
        errorDetail,
      };
    }

    const actionReason = translateReason(t, 'monitoring.grok_inspection_reason_probe_failed');
    onLog?.(
      'warning',
      `${account.displayAccount} probe failed, keep: ${errorMessage}`
    );
    return {
      ...account,
      action: 'keep',
      actionReason,
      statusCode,
      usedPercent: null,
      isQuota: false,
      planType: '',
      quotaWindows: [],
      error: errorMessage,
      errorKind: 'request_error',
      errorDetail,
    };
  }
};
