import type { QuotaCooldownInfo } from '@/services/api';
import type { AccountRow } from './accountRows';
import type { AccountRecommendation } from './quotaRecommendations';

export type AccountListHealthStatusKey =
  | 'reauth'
  | 'cooldown'
  | 'exhausted'
  | 'low'
  | 'problem'
  | 'disabled'
  | 'loading'
  | 'available'
  | 'unknown';

export interface AccountListPresentationItem {
  identity: {
    title: string;
    subtitle: string;
    fileName: string;
    provider: string;
    planType: string | null;
    priority: number;
    priorityIsNegative: boolean;
  };
  health: {
    status: AccountListHealthStatusKey;
    labelKey: string;
    cooldown: QuotaCooldownInfo | null;
  };
  quota: {
    remainingPercent: number | null;
    usedPercent: number | null;
    resetLabel: string;
    statusLabelKey: string;
    sourceShortLabelKey: string;
  };
  activity: {
    recentTotal: number;
    successRate: number | null;
    estimatedValue: number;
  };
  recommendation: {
    item: AccountRecommendation | null;
    hasRecommendation: boolean;
    actionLabelKey: string;
    reasonKey: string;
    priority: AccountRecommendation['priority'] | null;
  };
}

export interface AccountListPresentationOptions {
  recommendation?: AccountRecommendation | null;
  quotaCooldown?: QuotaCooldownInfo | null;
  estimatedValuePerRequest?: number;
}

const DEFAULT_ESTIMATED_VALUE_PER_REQUEST = 0.018;

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

const quotaSourceShortLabelKey = (source: AccountRow['quota']['source']) => {
  switch (source) {
    case 'observed-header':
      return 'accounts.quota_source_short_observed';
    case 'cache':
      return 'accounts.quota_source_short_cache';
    case 'none':
    default:
      return 'accounts.quota_source_short_none';
  }
};

export const getRecommendationActionLabelKey = (action: AccountRecommendation['action']) => {
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

const isAuthProblem = (row: AccountRow, recommendation?: AccountRecommendation | null) => {
  if (recommendation?.action === 'reauth') return true;
  if (row.inspection?.action === 'reauth' || row.inspection?.statusCode === 401) return true;
  const statusMessage = row.statusMessage.trim().toLowerCase();
  return ['unauthorized', 'unauthenticated', 'expired', 'token_expired'].includes(statusMessage);
};

const resolveHealthStatus = (
  row: AccountRow,
  recommendation?: AccountRecommendation | null,
  quotaCooldown?: QuotaCooldownInfo | null
): AccountListHealthStatusKey => {
  if (isAuthProblem(row, recommendation)) return 'reauth';
  if (quotaCooldown) return 'cooldown';
  if (row.quota.status === 'exhausted') return 'exhausted';
  if (row.quota.status === 'low') return 'low';
  if (row.quota.status === 'error' || row.statusMessage) return 'problem';
  if (row.inspection && row.inspection.action !== 'keep') return 'problem';
  if (row.disabled || row.quota.status === 'disabled') return 'disabled';
  if (row.quota.status === 'loading') return 'loading';
  if (row.quota.status === 'ok') return 'available';
  return 'unknown';
};

const buildIdentitySubtitle = (row: AccountRow) =>
  [row.fileName, row.authIndex ? `#${row.authIndex}` : '', row.projectId || '']
    .filter(Boolean)
    .join(' · ');

export const buildRecommendationBySelectionKey = (recommendations: AccountRecommendation[]) => {
  const map = new Map<string, AccountRecommendation>();
  recommendations.forEach((item) => {
    map.set(item.row.selectionKey, item);
  });
  return map;
};

export const buildAccountListItem = (
  row: AccountRow,
  options: AccountListPresentationOptions = {}
): AccountListPresentationItem => {
  const recommendation = options.recommendation ?? null;
  const quotaCooldown = options.quotaCooldown ?? null;
  const recentTotal = row.usage.success + row.usage.failure;
  const estimatedValue =
    recentTotal * (options.estimatedValuePerRequest ?? DEFAULT_ESTIMATED_VALUE_PER_REQUEST);
  const healthStatus = resolveHealthStatus(row, recommendation, quotaCooldown);

  return {
    identity: {
      title: row.accountLabel,
      subtitle: buildIdentitySubtitle(row),
      fileName: row.fileName,
      provider: row.provider,
      planType: row.planType,
      priority: row.priority ?? 0,
      priorityIsNegative: row.priority !== null && row.priority < 0,
    },
    health: {
      status: healthStatus,
      labelKey: `accounts.health_${healthStatus}`,
      cooldown: quotaCooldown,
    },
    quota: {
      remainingPercent: row.quota.remainingPercent,
      usedPercent: row.quota.usedPercent,
      resetLabel: row.quota.resetLabel,
      statusLabelKey: quotaStatusLabelKey(row.quota.status),
      sourceShortLabelKey: quotaSourceShortLabelKey(row.quota.source),
    },
    activity: {
      recentTotal,
      successRate: row.usage.successRate,
      estimatedValue,
    },
    recommendation: {
      item: recommendation,
      hasRecommendation: recommendation !== null,
      actionLabelKey: recommendation
        ? getRecommendationActionLabelKey(recommendation.action)
        : 'accounts.recommend_normal',
      reasonKey: recommendation?.reasonKey ?? 'accounts.recommend_normal_desc',
      priority: recommendation?.priority ?? null,
    },
  };
};
