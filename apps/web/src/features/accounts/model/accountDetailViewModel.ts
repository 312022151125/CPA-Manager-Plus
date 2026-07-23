import type { CodexQuotaState, XaiQuotaState } from '@/types';
import { getSortedCodexResetCreditExpiries } from '@/components/quota/quotaConfigs';
import type {
  AccountActionCandidate,
  MonitoringAccountHistoryItem,
  MonitoringAccountWindowUsageItem,
  QuotaCooldownInfo,
} from '@/services/api';
import type { AuthFileCodexStatusSummary } from '@/features/authFiles/model/authFilesPageModel';
import type { AccountRow } from './accountRows';
import {
  buildAccountListItem,
  getRecommendationActionLabelKey,
  type AccountListHealthStatusKey,
  type AccountListPresentationItem,
} from './accountListPresentation';
import type { AccountQuotaDisplayWindow } from './accountQuotaDisplayWindows';
import { accountWindowUsageRequestKey } from './accountWindowUsageRows';
import type { AccountRecommendation } from './quotaRecommendations';
import type { UsageValueRow, UsageValueSource } from './usageValueRows';

export type AccountDetailValueKind = 'text' | 'i18n' | 'number' | 'percent' | 'money' | 'timestamp';

export interface AccountDetailField {
  key: string;
  labelKey: string;
  value: string | number | null;
  valueKind?: AccountDetailValueKind;
}

export interface AccountDetailQuotaWindowInput extends Omit<
  AccountQuotaDisplayWindow,
  'limitWindowSeconds' | 'resetAtMs' | 'fromMs' | 'toMs'
> {
  limitWindowSeconds?: number | null;
  resetAtMs?: number | null;
  fromMs?: number | null;
  toMs?: number | null;
}

export interface AccountDetailWindowUsageSummary {
  matched: boolean;
  totalRequests: number;
  successCalls: number;
  failureCalls: number;
  totalTokens: number;
  totalCost: number;
  successRate: number | null;
  lastSeenMs: number | null;
  syncStatus: string;
}

export interface AccountDetailQuotaWindow extends AccountDetailQuotaWindowInput {
  usage: AccountDetailWindowUsageSummary | null;
}

export interface AccountDetailResetCreditExpiry {
  id: string;
  expiresAtMs: number;
}

export interface AccountDetailActionCandidateSummary {
  id: number;
  actionType: string;
  status: string;
  reason: string;
  hitCount: number;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  updatedAtMs: number;
  accountSnapshot: string;
  authLabel: string;
  hasEvidence: boolean;
}

export interface AccountDetailValueSummary {
  requests: number;
  successRate: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  lastSeenMs: number | null;
  source: UsageValueSource;
}

export interface AccountDetailHistorySummary {
  matched: boolean;
  totalRequests: number;
  successCalls: number;
  failureCalls: number;
  totalTokens: number;
  totalCost: number;
  successRate: number | null;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
  syncStatus: string;
}

export interface AccountDetailCodexBadge {
  kind: string;
  tone: 'danger' | 'warning' | 'info';
  labelKey: string;
  defaultLabel: string;
  titleKey?: string;
  defaultTitle?: string;
  labelParams?: Record<string, string | number>;
}

export interface AccountDetailViewModel {
  selectionKey: string;
  identity: {
    title: string;
    subtitle: string;
    fileName: string;
    accountLabel: string;
    provider: string;
    planType: string | null;
    authIndex: string;
    projectId: string;
    priority: number;
    disabled: boolean;
    runtimeOnly: boolean;
  };
  health: {
    status: AccountListHealthStatusKey;
    labelKey: string;
    tooltipKey: string;
    tooltipParams: Record<string, string | number>;
    reasonKey: string;
    reasonParams: Record<string, string | number>;
  };
  overview: {
    statusDescriptionKey: string;
    metrics: AccountDetailField[];
  };
  quota: {
    statusLabelKey: string;
    sourceShortLabelKey: string;
    fields: AccountDetailField[];
    diagnostics: AccountDetailField[];
    windows: AccountDetailQuotaWindow[];
    cooldown: QuotaCooldownInfo | null;
    resetCreditsAvailableCount: number | null;
    resetCreditExpiries: AccountDetailResetCreditExpiry[];
  };
  auth: {
    fields: AccountDetailField[];
  };
  strategy: {
    recommendation: AccountRecommendation | null;
    recommendationActionLabelKey: string;
    recommendationReasonKey: string;
    inspectionFields: AccountDetailField[];
    codexBadges: AccountDetailCodexBadge[];
    actionCandidates: AccountDetailActionCandidateSummary[];
  };
  value: AccountDetailValueSummary;
  history: AccountDetailHistorySummary | null;
}

export interface BuildAccountDetailViewModelOptions {
  recommendation?: AccountRecommendation | null;
  quotaCooldown?: QuotaCooldownInfo | null;
  codexStatus?: AuthFileCodexStatusSummary | null;
  quotaWindows?: AccountDetailQuotaWindowInput[];
  windowUsageByKey?: Map<string, MonitoringAccountWindowUsageItem>;
  actionCandidates?: AccountActionCandidate[];
  matchedActionCandidates?: AccountActionCandidate[];
  history?: MonitoringAccountHistoryItem | null;
  valueRow?: UsageValueRow | null;
  codexQuota?: CodexQuotaState | null;
  xaiQuota?: XaiQuotaState | null;
}

const normalizeAuthIndexKey = (value: unknown): string => {
  if (value === undefined || value === null) return '-';
  const normalized = String(value).trim();
  return normalized || '-';
};

const field = (
  key: string,
  labelKey: string,
  value: string | number | null | undefined,
  valueKind: AccountDetailValueKind = 'text'
): AccountDetailField | null => {
  if (value === undefined || value === null || value === '') return null;
  return { key, labelKey, value, valueKind };
};

const booleanField = (
  key: string,
  labelKey: string,
  value: boolean | null | undefined
): AccountDetailField | null => {
  if (value === undefined || value === null) return null;
  return field(key, labelKey, value ? 'common.yes' : 'common.no', 'i18n');
};

const compactFields = (
  fields: Array<AccountDetailField | null | undefined>
): AccountDetailField[] =>
  fields.filter((item): item is AccountDetailField => item !== null && item !== undefined);

const isMatchingActionCandidate = (row: AccountRow, candidate: AccountActionCandidate): boolean =>
  candidate.authFileName === row.fileName &&
  normalizeAuthIndexKey(candidate.authIndex) === normalizeAuthIndexKey(row.authIndex);

const toActionCandidateSummary = (
  candidate: AccountActionCandidate
): AccountDetailActionCandidateSummary => ({
  id: candidate.id,
  actionType: candidate.actionType,
  status: candidate.status,
  reason: candidate.reason,
  hitCount: candidate.hitCount,
  firstSeenAtMs: candidate.firstSeenAtMs,
  lastSeenAtMs: candidate.lastSeenAtMs,
  updatedAtMs: candidate.updatedAtMs,
  accountSnapshot: candidate.accountSnapshot ?? '',
  authLabel: candidate.authLabel ?? '',
  hasEvidence: candidate.evidence !== undefined && candidate.evidence !== null,
});

const toWindowUsageSummary = (
  item: MonitoringAccountWindowUsageItem | undefined
): AccountDetailWindowUsageSummary | null => {
  if (!item) return null;
  return {
    matched: item.matched,
    totalRequests: item.total_requests,
    successCalls: item.success_calls,
    failureCalls: item.failure_calls,
    totalTokens: item.total_tokens,
    totalCost: item.total_cost,
    successRate: item.success_rate === null ? null : item.success_rate * 100,
    lastSeenMs: item.last_seen_ms,
    syncStatus: item.sync_status,
  };
};

const toHistorySummary = (
  item: MonitoringAccountHistoryItem | null | undefined
): AccountDetailHistorySummary | null => {
  if (!item) return null;
  return {
    matched: item.matched,
    totalRequests: item.total_requests,
    successCalls: item.success_calls,
    failureCalls: item.failure_calls,
    totalTokens: item.total_tokens,
    totalCost: item.total_cost,
    successRate: item.success_rate === null ? null : item.success_rate * 100,
    firstSeenMs: item.first_seen_ms,
    lastSeenMs: item.last_seen_ms,
    syncStatus: item.sync_status,
  };
};

const isValueRowForAccount = (row: AccountRow, valueRow: UsageValueRow): boolean => {
  if (valueRow.row) return valueRow.row.selectionKey === row.selectionKey;
  return valueRow.fileName === row.fileName && normalizeAuthIndexKey(row.authIndex) === '-';
};

const buildValueSummary = (
  row: AccountRow,
  valueRow: UsageValueRow | null | undefined
): AccountDetailValueSummary => {
  const matchedValue = valueRow && isValueRowForAccount(row, valueRow) ? valueRow : null;
  const requests = matchedValue?.requests ?? row.usage.success + row.usage.failure;
  const inputTokens = matchedValue?.inputTokens ?? 0;
  const outputTokens = matchedValue?.outputTokens ?? 0;
  return {
    requests,
    successRate: matchedValue?.successRate ?? row.usage.successRate,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost: matchedValue?.estimatedCost ?? requests * 0.018,
    lastSeenMs: matchedValue?.lastSeenMs ?? null,
    source: matchedValue?.source ?? 'recent',
  };
};

const buildQuotaWindows = (
  row: AccountRow,
  quotaWindows: AccountDetailQuotaWindowInput[],
  windowUsageByKey: Map<string, MonitoringAccountWindowUsageItem>
): AccountDetailQuotaWindow[] =>
  quotaWindows.map((window) => ({
    ...window,
    usage: toWindowUsageSummary(
      windowUsageByKey.get(accountWindowUsageRequestKey(row.selectionKey, window.key))
    ),
  }));

const buildQuotaDiagnostics = (
  row: AccountRow,
  xaiQuota?: XaiQuotaState | null
): AccountDetailField[] => {
  const xaiBilling = xaiQuota?.billing;
  const quotaErrorGuidance =
    row.quota.errorStatus === 404
      ? 'common.quota_update_required'
      : row.quota.errorStatus === 403
        ? 'common.quota_check_credential'
        : null;
  return compactFields([
    field('fetchedAtMs', 'accounts.detail_fetched_at', row.quota.fetchedAtMs, 'timestamp'),
    field('observedAtMs', 'accounts.detail_observed_at', row.quota.observedAtMs, 'timestamp'),
    field('trace', 'accounts.detail_header_trace', row.quota.observedTraceId),
    field('errorKind', 'accounts.detail_header_error_kind', row.quota.observedErrorKind),
    field('errorCode', 'accounts.detail_header_error_code', row.quota.observedErrorCode),
    field('activeLimit', 'accounts.detail_active_limit', row.quota.activeLimit),
    field('creditsBalance', 'accounts.detail_credits_balance', row.quota.creditsBalance),
    booleanField(
      'creditsHasCredits',
      'accounts.detail_credits_available',
      row.quota.creditsHasCredits
    ),
    booleanField(
      'creditsUnlimited',
      'accounts.detail_credits_unlimited',
      row.quota.creditsUnlimited
    ),
    booleanField(
      'creditsOverageLimitReached',
      'accounts.detail_credits_overage_reached',
      row.quota.creditsOverageLimitReached
    ),
    field(
      'creditsApproxLocalMessages',
      'accounts.detail_credits_approx_local_messages',
      row.quota.creditsApproxLocalMessages,
      'number'
    ),
    field(
      'creditsApproxCloudMessages',
      'accounts.detail_credits_approx_cloud_messages',
      row.quota.creditsApproxCloudMessages,
      'number'
    ),
    booleanField(
      'spendControlReached',
      'accounts.detail_spend_control_reached',
      row.quota.spendControlReached
    ),
    field(
      'spendControlIndividualLimit',
      'accounts.detail_spend_control_individual_limit',
      row.quota.spendControlIndividualLimit,
      'number'
    ),
    field(
      'rateLimitReachedType',
      'accounts.detail_rate_limit_reached_type',
      row.quota.rateLimitReachedType
    ),
    field(
      'primaryOverSecondary',
      'accounts.detail_primary_over_secondary',
      row.quota.primaryOverSecondaryLimitPercent,
      'percent'
    ),
    field('error', 'common.error', row.quota.error),
    field('errorGuidance', 'accounts.detail_quota_error_guidance', quotaErrorGuidance, 'i18n'),
    field(
      'xaiOfficialApiHealth',
      'xai_quota.official_api_plan',
      xaiBilling?.officialApiHealth ? 'xai_quota.official_api_health' : null,
      'i18n'
    ),
    booleanField('xaiPartial', 'accounts.detail_xai_partial', xaiBilling?.partial),
    ...(xaiBilling?.diagnostics ?? []).map((diagnostic, index) =>
      field(
        `xaiDiagnostic-${index}`,
        'accounts.detail_xai_diagnostic',
        [diagnostic.statusCode ? `HTTP ${diagnostic.statusCode}` : '', diagnostic.message]
          .filter(Boolean)
          .join(' · ')
      )
    ),
  ]);
};

const quotaSourceLabelKey = (source: AccountRow['quota']['source']) => {
  switch (source) {
    case 'observed-header':
      return 'accounts.quota_source_observed_header';
    case 'cache':
      return 'accounts.quota_source_cache';
    case 'none':
    default:
      return 'accounts.quota_source_none';
  }
};

const buildQuotaFields = (row: AccountRow, listItem: AccountListPresentationItem) =>
  compactFields([
    field('status', 'accounts.detail_status', listItem.quota.statusLabelKey, 'i18n'),
    field('used', 'accounts.detail_used', row.quota.usedPercent, 'percent'),
    field('remaining', 'accounts.detail_quota', row.quota.remainingPercent, 'percent'),
    field('reset', 'accounts.detail_reset', row.quota.resetLabel),
    field('source', 'accounts.detail_source', quotaSourceLabelKey(row.quota.source), 'i18n'),
  ]);

const buildAuthFields = (row: AccountRow): AccountDetailField[] =>
  compactFields([
    field('authIndex', 'accounts.detail_auth_index', row.authIndex || '-'),
    field('projectId', 'accounts.detail_project_id', row.projectId || '-'),
    field('provider', 'accounts.col_provider', row.provider),
    field('planType', 'accounts.col_plan', row.planType || '-'),
    field('priority', 'accounts.col_priority', row.priority ?? 0, 'number'),
    field(
      'status',
      'common.status',
      row.disabled ? 'accounts.detail_auth_status_disabled' : 'accounts.detail_auth_status_enabled',
      'i18n'
    ),
    field(
      'runtime',
      'accounts.detail_runtime_source',
      row.runtimeOnly ? 'accounts.detail_runtime_only' : 'accounts.detail_local_auth_file',
      'i18n'
    ),
  ]);

const buildInspectionFields = (row: AccountRow): AccountDetailField[] => {
  if (!row.inspection) return [];
  return compactFields([
    field(
      'source',
      'accounts.detail_inspection_source',
      `accounts.inspection_source_${row.inspection.source}`,
      'i18n'
    ),
    field('action', 'common.action', `accounts.action_${row.inspection.action}`, 'i18n'),
    field('httpStatus', 'accounts.detail_http_status', row.inspection.statusCode ?? '-'),
    field(
      'reason',
      'accounts.detail_reason',
      row.inspection.actionReason || '-',
      row.inspection.actionReason.startsWith('monitoring.') ? 'i18n' : 'text'
    ),
    field('actionStatus', 'accounts.detail_action_status', row.inspection.actionStatus || '-'),
    field('usedPercent', 'accounts.detail_used', row.inspection.usedPercent, 'percent'),
    field('createdAtMs', 'accounts.detail_observed_at', row.inspection.createdAtMs, 'timestamp'),
  ]);
};

const buildOverviewMetrics = (
  row: AccountRow,
  value: AccountDetailValueSummary,
  history: AccountDetailHistorySummary | null
): AccountDetailField[] =>
  compactFields([
    field('quota', 'accounts.detail_quota', row.quota.remainingPercent, 'percent'),
    field('priority', 'accounts.col_priority', row.priority ?? 0, 'number'),
    field('successRate', 'accounts.detail_success_rate', value.successRate, 'percent'),
    field(
      'requests',
      'accounts.value_requests',
      history?.totalRequests ?? value.requests,
      'number'
    ),
    field('inputTokens', 'accounts.value_input_tokens', value.inputTokens, 'number'),
    field('outputTokens', 'accounts.value_output_tokens', value.outputTokens, 'number'),
    field(
      'tokens',
      'usage_analytics.trend_metric_totalTokens',
      history?.totalTokens ?? value.totalTokens,
      'number'
    ),
    field('cost', 'accounts.history_cost', history?.totalCost ?? value.estimatedCost, 'money'),
    field('lastSeenMs', 'accounts.value_recent', value.lastSeenMs, 'timestamp'),
  ]);

export const buildAccountDetailViewModel = (
  row: AccountRow,
  options: BuildAccountDetailViewModelOptions = {}
): AccountDetailViewModel => {
  const recommendation = options.recommendation ?? null;
  const quotaCooldown = options.quotaCooldown ?? null;
  const quotaWindows = options.quotaWindows ?? [];
  const listItem = buildAccountListItem(row, {
    recommendation,
    quotaCooldown,
    codexStatus: options.codexStatus ?? null,
    quotaWindows,
  });
  const value = buildValueSummary(row, options.valueRow);
  const history = toHistorySummary(options.history);
  const actionCandidates = [
    ...(options.matchedActionCandidates ??
      (options.actionCandidates ?? []).filter((candidate) =>
        isMatchingActionCandidate(row, candidate)
      )),
  ]
    .sort((left, right) => right.lastSeenAtMs - left.lastSeenAtMs)
    .map(toActionCandidateSummary);

  return {
    selectionKey: row.selectionKey,
    identity: {
      title: row.accountLabel,
      subtitle: [row.fileName, row.authIndex ? `#${row.authIndex}` : '', row.projectId || '']
        .filter(Boolean)
        .join(' · '),
      fileName: row.fileName,
      accountLabel: row.accountLabel,
      provider: row.provider,
      planType: row.planType,
      authIndex: row.authIndex,
      projectId: row.projectId,
      priority: row.priority ?? 0,
      disabled: row.disabled,
      runtimeOnly: row.runtimeOnly,
    },
    health: {
      status: listItem.health.status,
      labelKey: listItem.health.labelKey,
      tooltipKey: listItem.health.tooltipKey,
      tooltipParams: listItem.health.tooltipParams,
      reasonKey: listItem.health.reasonKey,
      reasonParams: listItem.health.reasonParams,
    },
    overview: {
      statusDescriptionKey: row.disabled
        ? 'accounts.detail_overview_disabled'
        : 'accounts.detail_overview_enabled',
      metrics: buildOverviewMetrics(row, value, history),
    },
    quota: {
      statusLabelKey: listItem.quota.statusLabelKey,
      sourceShortLabelKey: listItem.quota.sourceShortLabelKey,
      fields: buildQuotaFields(row, listItem),
      diagnostics: buildQuotaDiagnostics(row, options.xaiQuota),
      windows: buildQuotaWindows(row, quotaWindows, options.windowUsageByKey ?? new Map()),
      cooldown: quotaCooldown,
      resetCreditsAvailableCount: options.codexQuota?.rateLimitResetCreditsAvailableCount ?? null,
      resetCreditExpiries: getSortedCodexResetCreditExpiries(
        options.codexQuota?.rateLimitResetCredits
      ).map((item) => ({ id: item.id, expiresAtMs: item.expiresAtMs })),
    },
    auth: {
      fields: buildAuthFields(row),
    },
    strategy: {
      recommendation,
      recommendationActionLabelKey: recommendation
        ? getRecommendationActionLabelKey(recommendation.action)
        : 'accounts.recommend_normal',
      recommendationReasonKey: recommendation?.reasonKey ?? 'accounts.recommend_normal_desc',
      inspectionFields: buildInspectionFields(row),
      codexBadges: options.codexStatus?.badges ?? [],
      actionCandidates,
    },
    value,
    history,
  };
};
