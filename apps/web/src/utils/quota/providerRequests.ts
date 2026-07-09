import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaGroup,
  AntigravityQuotaSubscription,
  AntigravityQuotaSummaryPayload,
  AuthFileItem,
  ClaudeExtraUsage,
  ClaudeProfileResponse,
  ClaudeQuotaWindow,
  ClaudeUsagePayload,
  CodexRateLimitResetCredit,
  CodexQuotaWindow,
  CodexUsagePayload,
  KimiQuotaRow,
  XaiBillingConfig,
  XaiBillingPayload,
  XaiBillingPeriodType,
  XaiProductUsageSummary,
  XaiBillingSummary,
} from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api/apiCall';
import {
  antigravitySubscriptionApi,
  type AntigravitySubscriptionSummary,
} from '@/services/api/antigravitySubscription';
import { authFilesApi } from '@/services/api/authFiles';
import {
  ANTIGRAVITY_AVAILABLE_MODELS_URLS,
  ANTIGRAVITY_QUOTA_SUMMARY_URLS,
  ANTIGRAVITY_REQUEST_HEADERS,
  CLAUDE_PROFILE_URL,
  CLAUDE_REQUEST_HEADERS,
  CLAUDE_USAGE_URL,
  CLAUDE_USAGE_WINDOW_KEYS,
  CODEX_RATE_LIMIT_RESET_CREDITS_URL,
  CODEX_USAGE_URL,
  KIMI_REQUEST_HEADERS,
  KIMI_USAGE_URL,
  XAI_BILLING_URL,
  XAI_REQUEST_HEADERS,
} from './constants';
import { buildAntigravityQuotaGroups, buildKimiQuotaRows } from './builders';
import { createStatusError, formatQuotaResetTime, getStatusFromError } from './formatters';
import {
  normalizeAuthIndex,
  normalizeNumberValue,
  normalizePlanType,
  normalizeStringValue,
  parseAntigravityPayload,
  parseClaudeUsagePayload,
  parseCodexUsagePayload,
  parseKimiUsagePayload,
  parseXaiBillingPayload,
} from './parsers';
import { resolveCodexChatgptAccountId, resolveCodexPlanType } from './resolvers';
import { buildCodexQuotaWindowInfos } from './codexQuota';
import {
  buildCodexResetCreditsRequestHeaders,
  buildCodexUsageRequestHeaders,
} from './codexRequestHeaders';
import { normalizeCodexResetCreditsPayload } from './resetCredits';

const DEFAULT_ANTIGRAVITY_PROJECT_ID = 'bamboo-precept-lgxtn';
const CODEX_RESET_CREDITS_REQUEST_TIMEOUT_MS = 8000;

export type CodexQuotaData = {
  planType: string | null;
  windows: CodexQuotaWindow[];
  subscriptionActiveUntil: string | null;
  creditsHasCredits?: boolean | null;
  creditsUnlimited?: boolean | null;
  creditsBalance?: string | null;
  creditsOverageLimitReached?: boolean | null;
  creditsApproxLocalMessages?: number | null;
  creditsApproxCloudMessages?: number | null;
  spendControlReached?: boolean | null;
  spendControlIndividualLimit?: number | null;
  rateLimitResetCreditsAvailableCount: number | null;
  rateLimitResetCredits: CodexRateLimitResetCredit[];
  rateLimitResetCreditsError: string | null;
};

export type ClaudeQuotaData = {
  windows: ClaudeQuotaWindow[];
  extraUsage?: ClaudeExtraUsage | null;
  planType?: string | null;
};

export type AntigravityQuotaData = {
  groups: AntigravityQuotaGroup[];
  subscription?: AntigravityQuotaSubscription | null;
  serverTimeOffsetMs: number | null;
};

const antigravitySubscriptionRequests = new Map<
  string,
  Promise<AntigravityQuotaSubscription | null>
>();

const toAntigravityQuotaSubscription = (
  summary: AntigravitySubscriptionSummary | null
): AntigravityQuotaSubscription | null => {
  if (!summary) return null;
  return {
    plan: summary.plan,
    tierName: summary.tierName,
    tierId: summary.tierId,
  };
};

const fetchAntigravityQuotaSubscription = (
  authIndex: string
): Promise<AntigravityQuotaSubscription | null> => {
  const existing = antigravitySubscriptionRequests.get(authIndex);
  if (existing) return existing;

  const request = antigravitySubscriptionApi
    .get(authIndex)
    .then(toAntigravityQuotaSubscription)
    .catch(() => null)
    .finally(() => {
      antigravitySubscriptionRequests.delete(authIndex);
    });
  antigravitySubscriptionRequests.set(authIndex, request);
  return request;
};

export const resolveAntigravityProjectId = async (file: AuthFileItem): Promise<string> => {
  const directProjectId = normalizeStringValue(file.project_id ?? file.projectId);
  if (directProjectId) return directProjectId;

  const metadata =
    file.metadata && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const metadataProjectId = metadata
    ? normalizeStringValue(metadata.project_id ?? metadata.projectId)
    : null;
  if (metadataProjectId) return metadataProjectId;

  const attributes =
    file.attributes && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;
  const attributesProjectId = attributes
    ? normalizeStringValue(
        attributes.project_id ?? attributes.projectId ?? attributes.gemini_virtual_project
      )
    : null;
  if (attributesProjectId) return attributesProjectId;

  try {
    const text = await authFilesApi.downloadText(file.name);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;

    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const topLevel = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (topLevel) return topLevel;

    const installed =
      parsed.installed && typeof parsed.installed === 'object' && parsed.installed !== null
        ? (parsed.installed as Record<string, unknown>)
        : null;
    const installedProjectId = installed
      ? normalizeStringValue(installed.project_id ?? installed.projectId)
      : null;
    if (installedProjectId) return installedProjectId;

    const web =
      parsed.web && typeof parsed.web === 'object' && parsed.web !== null
        ? (parsed.web as Record<string, unknown>)
        : null;
    const webProjectId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webProjectId) return webProjectId;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }

  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

const resolveResponseServerTimeOffsetMs = (
  header: Record<string, string[]> | undefined
): number | null => {
  if (!header) return null;
  const dateEntry = Object.entries(header).find(([key]) => key.toLowerCase() === 'date');
  const rawDate = dateEntry?.[1]?.[0];
  if (!rawDate) return null;
  const serverTime = new Date(rawDate).getTime();
  if (Number.isNaN(serverTime)) return null;
  return serverTime - Date.now();
};

export const fetchAntigravityQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<AntigravityQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('antigravity_quota.missing_auth_index'));
  }

  const projectId = await resolveAntigravityProjectId(file);
  const requestBody = JSON.stringify({ project: projectId });
  const subscriptionPromise = fetchAntigravityQuotaSubscription(authIndex);

  let lastError = '';
  let lastStatus: number | undefined;
  let priorityStatus: number | undefined;
  let hadSuccess = false;

  for (const url of [...ANTIGRAVITY_QUOTA_SUMMARY_URLS, ...ANTIGRAVITY_AVAILABLE_MODELS_URLS]) {
    try {
      const result = await apiCallApi.request({
        authIndex,
        method: 'POST',
        url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS },
        data: requestBody,
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        lastError = getApiCallErrorMessage(result);
        lastStatus = result.statusCode;
        if (result.statusCode === 403 || result.statusCode === 404) {
          priorityStatus ??= result.statusCode;
        }
        continue;
      }

      hadSuccess = true;
      const payload = parseAntigravityPayload(
        result.body ?? result.bodyText
      ) as AntigravityQuotaSummaryPayload | null;
      if (!payload) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      const groups = buildAntigravityQuotaGroups(payload);
      if (groups.length === 0) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      return {
        groups,
        subscription: await subscriptionPromise,
        serverTimeOffsetMs: resolveResponseServerTimeOffsetMs(result.header),
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      if (status) {
        lastStatus = status;
        if (status === 403 || status === 404) {
          priorityStatus ??= status;
        }
      }
    }
  }

  if (hadSuccess) {
    return {
      groups: [],
      subscription: await subscriptionPromise,
      serverTimeOffsetMs: null,
    };
  }

  throw createStatusError(lastError || t('common.unknown_error'), priorityStatus ?? lastStatus);
};

export const buildCodexQuotaWindows = (
  payload: CodexUsagePayload,
  t: TFunction,
  planType?: string | null
): CodexQuotaWindow[] =>
  buildCodexQuotaWindowInfos(payload, { planType }).map((window) => ({
    id: window.id,
    label: t(window.labelKey, window.labelParams),
    labelKey: window.labelKey,
    labelParams: window.labelParams,
    usedPercent: window.usedPercent,
    resetLabel: window.resetLabel,
    limitWindowSeconds: window.limitWindowSeconds,
  }));

const resolveCodexRateLimitResetCreditsAvailableCount = (
  payload: CodexUsagePayload
): number | null => {
  const credits = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits;
  return normalizeNumberValue(credits?.available_count ?? credits?.availableCount);
};

const resolveCodexSubscriptionActiveUntil = (payload: CodexUsagePayload): string | null =>
  normalizeStringValue(payload.subscription_active_until ?? payload.subscriptionActiveUntil);

const normalizeBooleanValue = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return null;
};

const resolveCodexCreditsInfo = (payload: CodexUsagePayload) => {
  const credits = payload.credits;
  return {
    creditsHasCredits: normalizeBooleanValue(credits?.has_credits ?? credits?.hasCredits),
    creditsUnlimited: normalizeBooleanValue(credits?.unlimited),
    creditsBalance: normalizeStringValue(credits?.balance),
    creditsOverageLimitReached: normalizeBooleanValue(
      credits?.overage_limit_reached ?? credits?.overageLimitReached
    ),
    creditsApproxLocalMessages: normalizeNumberValue(
      credits?.approx_local_messages ?? credits?.approxLocalMessages
    ),
    creditsApproxCloudMessages: normalizeNumberValue(
      credits?.approx_cloud_messages ?? credits?.approxCloudMessages
    ),
  };
};

const resolveCodexSpendControlInfo = (payload: CodexUsagePayload) => {
  const spendControl = payload.spend_control ?? payload.spendControl;
  return {
    spendControlReached: normalizeBooleanValue(spendControl?.reached),
    spendControlIndividualLimit: normalizeNumberValue(
      spendControl?.individual_limit ?? spendControl?.individualLimit
    ),
  };
};

type CodexResetCreditsData = {
  availableCount: number | null;
  credits: CodexRateLimitResetCredit[];
  error: string | null;
};

const resolveCodexResetCreditsAvailableCount = (
  resetCredits: CodexResetCreditsData,
  usageAvailableCount: number | null
): number | null => {
  if (resetCredits.availableCount !== null) return resetCredits.availableCount;
  if (resetCredits.credits.length > 0) return resetCredits.credits.length;
  return usageAvailableCount;
};

const fetchCodexResetCredits = async (
  authIndex: string,
  accountId: string | null | undefined,
  t: TFunction
): Promise<CodexResetCreditsData> => {
  try {
    const result = await apiCallApi.request(
      {
        authIndex,
        method: 'GET',
        url: CODEX_RATE_LIMIT_RESET_CREDITS_URL,
        header: buildCodexResetCreditsRequestHeaders(accountId),
      },
      { timeout: CODEX_RESET_CREDITS_REQUEST_TIMEOUT_MS }
    );

    if (result.statusCode < 200 || result.statusCode >= 300) {
      return {
        availableCount: null,
        credits: [],
        error: getApiCallErrorMessage(result),
      };
    }

    const payload = normalizeCodexResetCreditsPayload(result.body ?? result.bodyText);
    if (payload.invalidPayload) {
      return {
        availableCount: null,
        credits: [],
        error: t('codex_quota.reset_credits_invalid_payload'),
      };
    }

    return {
      availableCount: payload.availableCount,
      credits: payload.credits,
      error: null,
    };
  } catch (err: unknown) {
    return {
      availableCount: null,
      credits: [],
      error: err instanceof Error ? err.message : 'Failed to fetch Codex reset credits',
    };
  }
};

export const fetchCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<CodexQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const planTypeFromFile = resolveCodexPlanType(file);
  const accountId = resolveCodexChatgptAccountId(file);
  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: CODEX_USAGE_URL,
    header: buildCodexUsageRequestHeaders(accountId),
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('codex_quota.empty_windows'));
  }

  const planTypeFromUsage = normalizePlanType(payload.plan_type ?? payload.planType);
  const planType = planTypeFromUsage ?? planTypeFromFile;
  const windows = buildCodexQuotaWindows(payload, t, planType);
  const usageResetCreditsAvailableCount = resolveCodexRateLimitResetCreditsAvailableCount(payload);
  const resetCredits = await fetchCodexResetCredits(authIndex, accountId, t);
  return {
    planType,
    windows,
    subscriptionActiveUntil: resolveCodexSubscriptionActiveUntil(payload),
    ...resolveCodexCreditsInfo(payload),
    ...resolveCodexSpendControlInfo(payload),
    rateLimitResetCreditsAvailableCount: resolveCodexResetCreditsAvailableCount(
      resetCredits,
      usageResetCreditsAvailableCount
    ),
    rateLimitResetCredits: resetCredits.credits,
    rateLimitResetCreditsError: resetCredits.error,
  };
};

const normalizeFlagValue = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return undefined;
};

const parseClaudeProfilePayload = (payload: unknown): ClaudeProfileResponse | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClaudeProfileResponse;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as ClaudeProfileResponse;
  }
  return null;
};

const resolveClaudePlanType = (profile: ClaudeProfileResponse | null): string | null => {
  if (!profile) return null;

  const hasClaudeMax = normalizeFlagValue(profile.account?.has_claude_max);
  if (hasClaudeMax) return 'plan_max';

  const hasClaudePro = normalizeFlagValue(profile.account?.has_claude_pro);
  if (hasClaudePro) return 'plan_pro';

  const organizationType = normalizeStringValue(
    profile.organization?.organization_type
  )?.toLowerCase();
  const subscriptionStatus = normalizeStringValue(
    profile.organization?.subscription_status
  )?.toLowerCase();

  if (organizationType === 'claude_team' && subscriptionStatus === 'active') {
    return 'plan_team';
  }

  if (hasClaudeMax === false && hasClaudePro === false) return 'plan_free';

  return null;
};

const buildClaudeQuotaWindows = (
  payload: ClaudeUsagePayload,
  t: TFunction
): ClaudeQuotaWindow[] => {
  const structuredWindows = buildClaudeStructuredQuotaWindows(payload, t);
  if (structuredWindows.length > 0) return structuredWindows;

  const windows: ClaudeQuotaWindow[] = [];

  for (const { key, id, labelKey } of CLAUDE_USAGE_WINDOW_KEYS) {
    const window = payload[key as keyof ClaudeUsagePayload];
    if (!window || typeof window !== 'object' || !('utilization' in window)) continue;
    const typedWindow = window as { utilization: number; resets_at: string };
    const usedPercent = normalizeNumberValue(typedWindow.utilization);
    const resetLabel = formatQuotaResetTime(typedWindow.resets_at);
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      usedPercent,
      resetLabel,
    });
  }

  return windows;
};

const resolveClaudeStructuredLimitLabel = (
  limit: NonNullable<ClaudeUsagePayload['limits']>[number],
  t: TFunction,
  index: number
): Pick<ClaudeQuotaWindow, 'id' | 'label' | 'labelKey'> => {
  const kind = normalizeStringValue(limit.kind)?.toLowerCase();
  if (kind === 'session') {
    return {
      id: 'five-hour',
      label: t('claude_quota.five_hour'),
      labelKey: 'claude_quota.five_hour',
    };
  }
  if (kind === 'weekly_all') {
    return {
      id: 'seven-day',
      label: t('claude_quota.seven_day'),
      labelKey: 'claude_quota.seven_day',
    };
  }

  const modelName =
    normalizeStringValue(
      limit.scope?.model?.display_name ??
        limit.scope?.model?.displayName ??
        limit.scope?.model?.name
    ) ?? null;
  const normalizedModelName = modelName?.toLowerCase() ?? '';
  if (normalizedModelName.includes('opus')) {
    return {
      id: 'seven-day-opus',
      label: t('claude_quota.seven_day_opus'),
      labelKey: 'claude_quota.seven_day_opus',
    };
  }
  if (normalizedModelName.includes('sonnet')) {
    return {
      id: 'seven-day-sonnet',
      label: t('claude_quota.seven_day_sonnet'),
      labelKey: 'claude_quota.seven_day_sonnet',
    };
  }

  const idSuffix = normalizeStringValue(kind) ?? modelName ?? `limit-${index + 1}`;
  return {
    id: `structured-${idSuffix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}`,
    label: modelName
      ? t('claude_quota.weekly_scoped_model', { model: modelName })
      : t('claude_quota.limit_index', { index: index + 1 }),
  };
};

const buildClaudeStructuredQuotaWindows = (
  payload: ClaudeUsagePayload,
  t: TFunction
): ClaudeQuotaWindow[] => {
  if (!Array.isArray(payload.limits)) return [];

  return payload.limits
    .map((limit, index): ClaudeQuotaWindow | null => {
      if (!limit || typeof limit !== 'object') return null;
      const usedPercent = normalizeNumberValue(limit.percent ?? limit.utilization);
      const resetAt = normalizeStringValue(limit.resets_at ?? limit.reset_at);
      if (usedPercent === null && !resetAt) return null;
      return {
        ...resolveClaudeStructuredLimitLabel(limit, t, index),
        usedPercent,
        resetLabel: formatQuotaResetTime(resetAt ?? undefined),
      };
    })
    .filter((window): window is ClaudeQuotaWindow => window !== null);
};

export const fetchClaudeQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<ClaudeQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('claude_quota.missing_auth_index'));
  }

  const [usageResult, profileResult] = await Promise.allSettled([
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_USAGE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_PROFILE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
  ]);

  if (usageResult.status === 'rejected') {
    throw usageResult.reason;
  }

  const result = usageResult.value;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseClaudeUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('claude_quota.empty_windows'));
  }

  const windows = buildClaudeQuotaWindows(payload, t);
  const planType =
    profileResult.status === 'fulfilled' &&
    profileResult.value.statusCode >= 200 &&
    profileResult.value.statusCode < 300
      ? resolveClaudePlanType(
          parseClaudeProfilePayload(profileResult.value.body ?? profileResult.value.bodyText)
        )
      : null;

  return { windows, extraUsage: payload.extra_usage, planType };
};

export const fetchKimiQuota = async (file: AuthFileItem, t: TFunction): Promise<KimiQuotaRow[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('kimi_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: KIMI_USAGE_URL,
    header: { ...KIMI_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseKimiUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('kimi_quota.empty_data'));
  }

  return buildKimiQuotaRows(payload);
};

const normalizeXaiCentValue = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return normalizeNumberValue((value as { val?: unknown }).val);
  }
  return normalizeNumberValue(value);
};

const resolveXaiBillingConfig = (payload: XaiBillingPayload | null): XaiBillingConfig | null => {
  if (!payload || typeof payload !== 'object') return null;
  return payload.config ?? (payload as XaiBillingConfig);
};

const resolveXaiPeriodType = (
  period: XaiBillingConfig['currentPeriod'] | XaiBillingConfig['current_period']
): XaiBillingPeriodType => {
  const rawType = normalizeStringValue(period?.type)?.toLowerCase() ?? '';
  if (rawType.includes('weekly')) return 'weekly';
  if (rawType.includes('monthly')) return 'monthly';
  return 'unknown';
};

const normalizeXaiProductUsage = (
  productUsage: XaiBillingConfig['productUsage'],
  fallbackPrefix: string
): XaiProductUsageSummary[] => {
  if (!Array.isArray(productUsage)) return [];

  return productUsage
    .map((item, index): XaiProductUsageSummary | null => {
      if (!item || typeof item !== 'object') return null;
      const product = normalizeStringValue(item.product) ?? `${fallbackPrefix} ${index + 1}`;
      const usagePercent = normalizeNumberValue(item.usagePercent ?? item.usage_percent);
      return { product, usagePercent };
    })
    .filter((item): item is XaiProductUsageSummary => item !== null);
};

export const buildXaiBillingSummary = (
  config: XaiBillingConfig | null | undefined
): XaiBillingSummary | null => {
  if (!config || typeof config !== 'object') return null;

  const currentPeriod = config.currentPeriod ?? config.current_period ?? null;
  const periodType = resolveXaiPeriodType(currentPeriod);
  const creditUsagePercent = normalizeNumberValue(
    config.creditUsagePercent ?? config.credit_usage_percent
  );
  const productUsage = normalizeXaiProductUsage(
    config.productUsage ?? config.product_usage,
    'Product'
  );
  const periodStart =
    normalizeStringValue(currentPeriod?.start) ??
    normalizeStringValue(config.billingPeriodStart ?? config.billing_period_start) ??
    undefined;
  const periodEnd =
    normalizeStringValue(currentPeriod?.end) ??
    normalizeStringValue(config.billingPeriodEnd ?? config.billing_period_end) ??
    undefined;
  const billingCycle = config.billingCycle ?? config.billing_cycle ?? null;
  const nestedUsage = config.usage ?? null;
  const monthlyLimitCents = normalizeXaiCentValue(config.monthlyLimit ?? config.monthly_limit);
  const nestedIncludedUsedCents = normalizeXaiCentValue(
    nestedUsage?.includedUsed ?? nestedUsage?.included_used
  );
  const explicitOnDemandUsedCents = normalizeXaiCentValue(
    config.onDemandUsed ??
      config.on_demand_used ??
      nestedUsage?.onDemandUsed ??
      nestedUsage?.on_demand_used
  );
  const rawUsedCents = normalizeXaiCentValue(
    config.used ?? nestedUsage?.totalUsed ?? nestedUsage?.total_used
  );
  const usedCents =
    rawUsedCents ??
    (nestedIncludedUsedCents !== null || explicitOnDemandUsedCents !== null
      ? (nestedIncludedUsedCents ?? 0) + (explicitOnDemandUsedCents ?? 0)
      : null);
  const onDemandCapCents = normalizeXaiCentValue(config.onDemandCap ?? config.on_demand_cap);
  const billingPeriodStart =
    normalizeStringValue(
      config.billingPeriodStart ??
        config.billing_period_start ??
        billingCycle?.billingPeriodStart ??
        billingCycle?.billing_period_start
    ) ?? undefined;
  const billingPeriodEnd =
    normalizeStringValue(
      config.billingPeriodEnd ??
        config.billing_period_end ??
        billingCycle?.billingPeriodEnd ??
        billingCycle?.billing_period_end
    ) ?? undefined;

  const hasWeeklyData =
    creditUsagePercent !== null || periodType === 'weekly' || productUsage.length > 0;
  const hasMonthlyData =
    monthlyLimitCents !== null ||
    usedCents !== null ||
    onDemandCapCents !== null ||
    !!billingPeriodEnd;

  if (!hasWeeklyData && !hasMonthlyData) {
    return null;
  }

  const includedUsedCents =
    nestedIncludedUsedCents ??
    (usedCents === null
      ? null
      : monthlyLimitCents !== null && monthlyLimitCents > 0
        ? Math.min(usedCents, monthlyLimitCents)
        : usedCents);
  const onDemandUsedCents =
    explicitOnDemandUsedCents ??
    (usedCents !== null && monthlyLimitCents !== null
      ? Math.max(0, usedCents - monthlyLimitCents)
      : null);
  const usedPercent =
    monthlyLimitCents !== null && monthlyLimitCents > 0 && includedUsedCents !== null
      ? (includedUsedCents / monthlyLimitCents) * 100
      : null;
  const onDemandUsedPercent =
    onDemandCapCents !== null && onDemandCapCents > 0 && onDemandUsedCents !== null
      ? (onDemandUsedCents / onDemandCapCents) * 100
      : null;

  return {
    periodType: hasWeeklyData ? (periodType === 'unknown' ? 'weekly' : periodType) : 'monthly',
    usagePercent: hasWeeklyData ? creditUsagePercent : usedPercent,
    periodStart: hasWeeklyData ? periodStart : billingPeriodStart,
    periodEnd: hasWeeklyData ? periodEnd : billingPeriodEnd,
    productUsage,
    monthlyLimitCents,
    usedCents,
    includedUsedCents,
    onDemandCapCents,
    onDemandUsedCents,
    onDemandUsedPercent,
    billingPeriodStart,
    billingPeriodEnd,
    usedPercent,
  };
};

export const fetchXaiQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<XaiBillingSummary> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('xai_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: XAI_BILLING_URL,
    header: { ...XAI_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseXaiBillingPayload(result.body ?? result.bodyText);
  const summary = buildXaiBillingSummary(resolveXaiBillingConfig(payload));
  if (!summary) {
    throw new Error(t('xai_quota.empty_data'));
  }

  return summary;
};
