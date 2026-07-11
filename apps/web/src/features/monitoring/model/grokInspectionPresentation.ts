import type { TFunction } from 'i18next';
import type {
  GrokInspectionAction,
  GrokInspectionAutoActionMode,
  GrokInspectionConfigurableSettings,
  GrokInspectionProgressSnapshot,
  GrokInspectionResultItem,
  GrokInspectionRunResult,
} from '@/features/monitoring/grokInspection';
import {
  ACTION_FILTERS,
  HANDLING_FILTERS,
  buildCodexInspectionPaginationState,
  countActions as countCodexActions,
  countHandlingStates as countCodexHandlingStates,
  filterInspectionResults as filterCodexInspectionResults,
  formatPercent,
  formatTime,
  formatTimestamp,
  getActionFilterCounts as getCodexActionFilterCounts,
  getAutoActionTone,
  normalizeActionFilter,
  type ActionFilter,
  type ConfigOverviewItem,
  type ExecutionTriggerSource,
  type HandlingFilter,
  type InspectionLogEntry,
  type RunStatus,
  type StatusTone,
  type SummaryCard,
} from '@/features/monitoring/model/codexInspectionPresentation';

export {
  ACTION_FILTERS,
  HANDLING_FILTERS,
  buildCodexInspectionPaginationState,
  formatPercent,
  formatTime,
  formatTimestamp,
  normalizeActionFilter,
  type ActionFilter,
  type ConfigOverviewItem,
  type ExecutionTriggerSource,
  type HandlingFilter,
  type InspectionLogEntry,
  type RunStatus,
  type StatusTone,
  type SummaryCard,
};

export const CODEX_INSPECTION_RESULT_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const GROK_INSPECTION_RESULT_PAGE_SIZE_OPTIONS = CODEX_INSPECTION_RESULT_PAGE_SIZE_OPTIONS;

export type GrokInspectionSettingsDraft = {
  workers: string;
  retries: string;
  timeout: string;
  usedPercentThreshold: string;
  sampleSize: string;
  autoActionMode: GrokInspectionAutoActionMode;
};

export type GrokInspectionSettingsDraftField = Exclude<
  keyof GrokInspectionSettingsDraft,
  'autoActionMode'
>;

export type GrokInspectionConfigFieldErrors = Partial<
  Record<GrokInspectionSettingsDraftField, string>
>;

export const toGrokSettingsDraft = (
  settings: GrokInspectionConfigurableSettings
): GrokInspectionSettingsDraft => ({
  workers: String(settings.workers),
  retries: String(settings.retries),
  timeout: String(settings.timeout),
  usedPercentThreshold: String(settings.usedPercentThreshold),
  sampleSize: String(settings.sampleSize),
  autoActionMode: settings.autoActionMode,
});

export const formatGrokActionLabel = (action: GrokInspectionAction, t: TFunction) => {
  switch (action) {
    case 'delete':
      return t('monitoring.grok_inspection_action_delete');
    case 'disable':
      return t('monitoring.grok_inspection_action_disable');
    case 'enable':
      return t('monitoring.grok_inspection_action_enable');
    case 'reauth':
      return t('monitoring.grok_inspection_action_reauth');
    case 'keep':
    default:
      return t('monitoring.grok_inspection_action_keep');
  }
};

export const formatGrokAutoActionModeLabel = (
  mode: GrokInspectionAutoActionMode,
  t: TFunction
) => {
  switch (mode) {
    case 'delete':
      return t('monitoring.grok_inspection_settings_auto_action_mode_delete');
    case 'disable':
      return t('monitoring.grok_inspection_settings_auto_action_mode_disable');
    case 'enable':
      return t('monitoring.grok_inspection_settings_auto_action_mode_enable');
    case 'none':
    default:
      return t('monitoring.grok_inspection_settings_auto_action_mode_none');
  }
};

export const countActions = (items: GrokInspectionResultItem[]) =>
  countCodexActions(items as never);

export const countHandlingStates = (items: GrokInspectionResultItem[]) =>
  countCodexHandlingStates(items as never);

export const getActionFilterCounts = (items: GrokInspectionResultItem[]) =>
  getCodexActionFilterCounts(items as never);

export const filterInspectionResults = (
  items: GrokInspectionResultItem[],
  handlingFilter: HandlingFilter,
  actionFilter: ActionFilter
) => filterCodexInspectionResults(items as never, handlingFilter, actionFilter) as GrokInspectionResultItem[];

export const createIdleProgressSnapshot = (): GrokInspectionProgressSnapshot => ({
  total: 0,
  completed: 0,
  inFlight: 0,
  pending: 0,
  percent: 0,
  status: 'idle',
  summary: {
    totalFiles: 0,
    probeSetCount: 0,
    sampledCount: 0,
    deleteCount: 0,
    disableCount: 0,
    enableCount: 0,
    reauthCount: 0,
    keepCount: 0,
  },
  startedAt: Date.now(),
  updatedAt: Date.now(),
});

export const createCompletedProgressSnapshot = (
  result: GrokInspectionRunResult
): GrokInspectionProgressSnapshot => {
  const total = Math.max(0, result.summary.sampledCount || result.results.length);
  return {
    total,
    completed: total,
    inFlight: 0,
    pending: 0,
    percent: total > 0 ? 100 : 0,
    status: 'completed',
    summary: {
      totalFiles: result.summary.totalFiles,
      probeSetCount: result.summary.probeSetCount,
      sampledCount: result.summary.sampledCount,
      deleteCount: result.summary.deleteCount,
      disableCount: result.summary.disableCount,
      enableCount: result.summary.enableCount,
      reauthCount: result.summary.reauthCount,
      keepCount: result.summary.keepCount,
    },
    startedAt: result.startedAt,
    updatedAt: result.finishedAt || Date.now(),
  };
};

export const validateGrokInspectionConfigFields = (
  draft: GrokInspectionSettingsDraft,
  t: TFunction
): GrokInspectionConfigFieldErrors => {
  const errors: GrokInspectionConfigFieldErrors = {};

  const checkInteger = (
    field: GrokInspectionSettingsDraftField,
    min: number,
    labelKey: string
  ) => {
    const parsed = Number(draft[field].trim());
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
      errors[field] = t('monitoring.grok_inspection_settings_invalid_integer', {
        field: t(labelKey),
        min,
      });
    }
  };

  checkInteger('workers', 1, 'monitoring.grok_inspection_settings_workers_label');
  checkInteger('timeout', 1, 'monitoring.grok_inspection_settings_timeout_label');
  checkInteger('retries', 0, 'monitoring.grok_inspection_settings_retries_label');
  checkInteger('sampleSize', 0, 'monitoring.grok_inspection_settings_sample_size_label');

  const threshold = Number(draft.usedPercentThreshold.trim());
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    errors.usedPercentThreshold = t('monitoring.grok_inspection_settings_invalid_threshold', {
      field: t('monitoring.grok_inspection_settings_used_percent_threshold_label'),
    });
  }

  return errors;
};

export const hasGrokInspectionConfigFieldErrors = (
  errors: GrokInspectionConfigFieldErrors
): boolean => Object.values(errors).some(Boolean);

export const validateGrokInspectionConfigDraft = (
  draft: GrokInspectionSettingsDraft,
  t: TFunction
):
  | {
      ok: true;
      errors: GrokInspectionConfigFieldErrors;
      values: GrokInspectionConfigurableSettings;
    }
  | {
      ok: false;
      errors: GrokInspectionConfigFieldErrors;
      values: null;
    } => {
  const errors = validateGrokInspectionConfigFields(draft, t);
  if (hasGrokInspectionConfigFieldErrors(errors)) {
    return { ok: false, errors, values: null };
  }

  const autoActionMode =
    draft.autoActionMode === 'enable' ||
    draft.autoActionMode === 'disable' ||
    draft.autoActionMode === 'delete'
      ? draft.autoActionMode
      : 'none';

  return {
    ok: true,
    errors,
    values: {
      workers: Number(draft.workers.trim()),
      retries: Number(draft.retries.trim()),
      timeout: Number(draft.timeout.trim()),
      usedPercentThreshold: Number(draft.usedPercentThreshold.trim()),
      sampleSize: Number(draft.sampleSize.trim()),
      autoActionMode,
    },
  };
};

export const buildGrokConfigOverviewItems = (
  settings: GrokInspectionConfigurableSettings,
  t: TFunction
): ConfigOverviewItem[] => {
  const sampleSizeLabel =
    settings.sampleSize > 0
      ? String(settings.sampleSize)
      : t('monitoring.server_codex_inspection_sample_all');

  return [
    {
      key: 'threshold',
      label: t('monitoring.grok_inspection_threshold'),
      value: `${settings.usedPercentThreshold}%`,
      field: 'usedPercentThreshold',
    },
    {
      key: 'sample',
      label: t('monitoring.grok_inspection_sample_size'),
      value: sampleSizeLabel,
      field: 'sampleSize',
    },
    {
      key: 'auto',
      label: t('monitoring.grok_inspection_settings_auto_action_mode_label'),
      value: formatGrokAutoActionModeLabel(settings.autoActionMode, t),
      tone: getAutoActionTone(settings.autoActionMode),
      field: 'autoActionMode',
    },
    {
      key: 'concurrency',
      label: t('monitoring.grok_inspection_workers'),
      value: String(settings.workers),
      hint: `${t('monitoring.grok_inspection_settings_timeout_label')}: ${settings.timeout}s`,
      field: 'workers',
    },
  ];
};

// Adapter: Grok results are structurally compatible with Codex panels for action/display fields.
export const asCodexCompatibleResults = (items: GrokInspectionResultItem[]) =>
  items.map((item) => ({
    ...item,
    accountId: null,
    statusCode: item.statusCode ?? null,
    error: item.error ?? '',
    planType: item.planType ?? null,
    quotaWindows: (item.quotaWindows ?? []).map((window) => ({
      ...window,
      limitWindowSeconds: null,
    })),
  }));

export const asCodexCompatibleRunResult = (result: GrokInspectionRunResult | null) => {
  if (!result) return null;
  return {
    ...result,
    settings: {
      ...result.settings,
      targetType: 'xai',
      deleteWorkers: result.settings.workers,
      userAgent: '',
    },
    results: asCodexCompatibleResults(result.results),
    summary: {
      ...result.summary,
      disabledCount: result.results.filter((item) => item.disabled).length,
      enabledCount: result.results.filter((item) => !item.disabled).length,
      usedPercentThreshold: result.settings.usedPercentThreshold,
      sampled: result.settings.sampleSize > 0,
      plannedActionPreview: result.results
        .filter((item) => item.action !== 'keep')
        .slice(0, 10)
        .map((item) => `${item.displayAccount} -> ${item.action}`),
    },
  };
};
