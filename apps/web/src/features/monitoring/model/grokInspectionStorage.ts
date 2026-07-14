import type {
  GrokInspectionLastRunState,
  GrokInspectionQuotaWindow,
  GrokInspectionResultItem,
  GrokInspectionRunResult,
  GrokInspectionSettings,
  GrokInspectionStoredActionFilter,
  GrokInspectionStoredLogEntry,
  GrokInspectionSummary,
} from '@/features/monitoring/grokInspection';
import { normalizeNumberValue } from '@/utils/quota';
import {
  DEFAULT_GROK_INSPECTION_SETTINGS,
  clampPositiveInteger,
  isRecord,
  normalizeConfigurableSettings,
  normalizeInspectionAction,
  normalizeLogLevel,
  normalizeStoredActionFilter,
  readBoolean,
  readNonNegativeInteger,
  readNullableNumber,
  readNullableString,
  readString,
} from './grokInspectionSettings';

export const GROK_INSPECTION_LAST_RUN_STORAGE_KEY = 'cli-proxy-grok-inspection-last-run-v1';

const GROK_INSPECTION_LAST_RUN_STORAGE_VERSION = 1;

export const sortGrokInspectionResults = (items: GrokInspectionResultItem[]) =>
  [...items].sort(
    (left, right) =>
      left.fileName.localeCompare(right.fileName) ||
      left.displayAccount.localeCompare(right.displayAccount) ||
      left.key.localeCompare(right.key)
  );

const sanitizeInspectionSettingsForStorage = (
  settings: GrokInspectionSettings
): GrokInspectionSettings => ({
  baseUrl: '',
  token: '',
  workers: clampPositiveInteger(settings.workers, DEFAULT_GROK_INSPECTION_SETTINGS.workers),
  retries: Math.max(0, Math.floor(normalizeNumberValue(settings.retries) ?? 0)),
  timeout: clampPositiveInteger(settings.timeout, DEFAULT_GROK_INSPECTION_SETTINGS.timeout),
  usedPercentThreshold:
    normalizeNumberValue(settings.usedPercentThreshold) ??
    DEFAULT_GROK_INSPECTION_SETTINGS.usedPercentThreshold,
  sampleSize: Math.max(0, Math.floor(normalizeNumberValue(settings.sampleSize) ?? 0)),
  autoActionMode: settings.autoActionMode ?? DEFAULT_GROK_INSPECTION_SETTINGS.autoActionMode,
  autoRecoverEnabled:
    settings.autoRecoverEnabled ?? DEFAULT_GROK_INSPECTION_SETTINGS.autoRecoverEnabled,
});

const normalizeStoredSettings = (value: unknown): GrokInspectionSettings => {
  const input = isRecord(value) ? value : {};
  const configurable = normalizeConfigurableSettings({
    workers: input.workers,
    retries: input.retries,
    timeout: input.timeout,
    usedPercentThreshold: input.usedPercentThreshold,
    sampleSize: input.sampleSize,
    autoActionMode: input.autoActionMode,
    autoRecoverEnabled: input.autoRecoverEnabled,
  });

  return {
    baseUrl: '',
    token: '',
    ...configurable,
  };
};

type StoredGrokInspectionResultItem = Omit<GrokInspectionResultItem, 'raw'>;

const normalizeQuotaWindowLabelParams = (
  value: unknown
): Record<string, string | number> | undefined => {
  if (!isRecord(value)) return undefined;
  const params: Record<string, string | number> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      params[key] = raw;
      return;
    }
    const text = readString(raw);
    if (text) {
      params[key] = text;
    }
  });
  return Object.keys(params).length > 0 ? params : undefined;
};

const serializeQuotaWindow = (window: GrokInspectionQuotaWindow): GrokInspectionQuotaWindow => ({
  id: readString(window.id),
  labelKey: readString(window.labelKey),
  labelParams: normalizeQuotaWindowLabelParams(window.labelParams),
  usedPercent: readNullableNumber(window.usedPercent),
  resetLabel: readString(window.resetLabel),
});

const hydrateQuotaWindow = (value: unknown): GrokInspectionQuotaWindow | null => {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const labelKey = readString(value.labelKey);
  if (!id || !labelKey) return null;

  return {
    id,
    labelKey,
    labelParams: normalizeQuotaWindowLabelParams(value.labelParams),
    usedPercent: readNullableNumber(value.usedPercent),
    resetLabel: readString(value.resetLabel),
  };
};

const serializeResultItemForStorage = (
  item: GrokInspectionResultItem
): StoredGrokInspectionResultItem => ({
  key: item.key,
  fileName: item.fileName,
  displayAccount: item.displayAccount,
  authIndex: item.authIndex,
  provider: item.provider,
  disabled: item.disabled,
  status: item.status,
  state: item.state,
  action: item.action,
  actionReason: item.actionReason,
  statusCode: item.statusCode ?? null,
  usedPercent: item.usedPercent,
  isQuota: item.isQuota,
  error: item.error,
  planType: item.planType,
  quotaWindows: (item.quotaWindows ?? []).map(serializeQuotaWindow),
  errorKind: item.errorKind,
  errorDetail: item.errorDetail,
  handled: item.handled,
  executedAction: item.executedAction,
  actionError: item.actionError,
});

const hydrateStoredResultItem = (
  value: unknown,
  _settings: GrokInspectionSettings
): GrokInspectionResultItem | null => {
  if (!isRecord(value)) return null;
  const fileName = readString(value.fileName);
  if (!fileName) return null;

  const authIndex = readString(value.authIndex);
  const provider = readString(value.provider) || 'xai';
  const disabled = readBoolean(value.disabled, false);
  const key = readString(value.key) || `${fileName}::${authIndex || '-'}`;

  return {
    key,
    fileName,
    displayAccount: readString(value.displayAccount) || fileName,
    authIndex,
    provider,
    disabled,
    status: readString(value.status),
    state: readString(value.state),
    raw: {
      name: fileName,
      type: provider,
      authIndex,
      disabled,
    },
    action: normalizeInspectionAction(value.action),
    actionReason: readString(value.actionReason),
    statusCode: readNullableNumber(value.statusCode),
    usedPercent: readNullableNumber(value.usedPercent),
    isQuota: readBoolean(value.isQuota, false),
    error: readString(value.error),
    planType: readString(value.planType),
    quotaWindows: Array.isArray(value.quotaWindows)
      ? value.quotaWindows
          .map(hydrateQuotaWindow)
          .filter((item): item is GrokInspectionQuotaWindow => item !== null)
      : [],
    errorKind: readString(value.errorKind),
    errorDetail: readString(value.errorDetail),
    handled: readBoolean(value.handled, false),
    executedAction: readString(value.executedAction),
    actionError: readString(value.actionError),
  };
};

const buildSummaryFromStoredResult = (
  storedSummary: unknown,
  results: GrokInspectionResultItem[],
  _settings: GrokInspectionSettings
): GrokInspectionSummary => {
  const summary = isRecord(storedSummary) ? storedSummary : {};
  const deleteCount = results.filter((item) => item.action === 'delete').length;
  const disableCount = results.filter((item) => item.action === 'disable').length;
  const enableCount = results.filter((item) => item.action === 'enable').length;
  const reauthCount = results.filter((item) => item.action === 'reauth').length;
  const keepCount = results.length - deleteCount - disableCount - enableCount - reauthCount;

  return {
    totalFiles: readNonNegativeInteger(summary.totalFiles, results.length),
    probeSetCount: readNonNegativeInteger(summary.probeSetCount, results.length),
    sampledCount: readNonNegativeInteger(summary.sampledCount, results.length),
    deleteCount,
    disableCount,
    enableCount,
    reauthCount,
    keepCount,
  };
};

const hydrateStoredLogEntry = (value: unknown): GrokInspectionStoredLogEntry | null => {
  if (!isRecord(value)) return null;
  const message = readString(value.message);
  if (!message) return null;
  const timestamp = readNullableNumber(value.timestamp) ?? Date.now();
  const id = readString(value.id) || `${timestamp}-${message.slice(0, 12)}`;

  return {
    id,
    level: normalizeLogLevel(value.level),
    message,
    timestamp,
  };
};
export type GrokInspectionLastRunInput = {
  result: GrokInspectionRunResult;
  logs?: GrokInspectionStoredLogEntry[];
  logsCollapsed?: boolean;
  actionFilter?: GrokInspectionStoredActionFilter;
  connectionFingerprint?: string | null;
};

export const serializeGrokInspectionLastRun = ({
  result,
  logs,
  logsCollapsed = true,
  actionFilter = 'all',
  connectionFingerprint = null,
}: GrokInspectionLastRunInput) => ({
  version: GROK_INSPECTION_LAST_RUN_STORAGE_VERSION,
  savedAt: Date.now(),
  logsCollapsed,
  actionFilter,
  connectionFingerprint: readNullableString(connectionFingerprint),
  result: {
    settings: sanitizeInspectionSettingsForStorage(result.settings),
    results: result.results.map(serializeResultItemForStorage),
    summary: result.summary,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
  },
  logs: (logs ?? []).slice(-500),
});

export const hydrateGrokInspectionLastRun = (
  value: unknown,
  options: { expectedConnectionFingerprint?: string | null } = {}
): GrokInspectionLastRunState | null => {
  if (!isRecord(value)) return null;
  if (value.version !== GROK_INSPECTION_LAST_RUN_STORAGE_VERSION) return null;
  if (!isRecord(value.result)) return null;

  const connectionFingerprint = readNullableString(value.connectionFingerprint);
  const expectedConnectionFingerprint = readNullableString(options.expectedConnectionFingerprint);
  if (expectedConnectionFingerprint && connectionFingerprint !== expectedConnectionFingerprint) {
    return null;
  }

  const settings = normalizeStoredSettings(value.result.settings);
  const resultItemsRaw = Array.isArray(value.result.results) ? value.result.results : [];
  const results = sortGrokInspectionResults(
    resultItemsRaw
      .map((item) => hydrateStoredResultItem(item, settings))
      .filter((item): item is GrokInspectionResultItem => item !== null)
  );

  const startedAt = readNullableNumber(value.result.startedAt) ?? Date.now();
  const finishedAt = readNullableNumber(value.result.finishedAt) ?? startedAt;
  const logsRaw = Array.isArray(value.logs) ? value.logs : [];
  const logs = logsRaw
    .map(hydrateStoredLogEntry)
    .filter((item): item is GrokInspectionStoredLogEntry => item !== null)
    .slice(-500);

  return {
    result: {
      settings,
      files: [],
      results,
      summary: buildSummaryFromStoredResult(value.result.summary, results, settings),
      startedAt,
      finishedAt,
    },
    logs,
    logsCollapsed: readBoolean(value.logsCollapsed, true),
    actionFilter: normalizeStoredActionFilter(value.actionFilter),
    connectionFingerprint,
    savedAt: readNullableNumber(value.savedAt) ?? finishedAt,
  };
};

export const loadGrokInspectionLastRun = (
  expectedConnectionFingerprint?: string | null
): GrokInspectionLastRunState | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(GROK_INSPECTION_LAST_RUN_STORAGE_KEY);
    if (!raw) return null;
    return hydrateGrokInspectionLastRun(JSON.parse(raw), { expectedConnectionFingerprint });
  } catch {
    return null;
  }
};

export const saveGrokInspectionLastRun = (input: GrokInspectionLastRunInput) => {
  const payload = serializeGrokInspectionLastRun(input);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GROK_INSPECTION_LAST_RUN_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    console.warn('Failed to save Grok inspection last run');
  }
  return hydrateGrokInspectionLastRun(payload);
};

export const clearGrokInspectionLastRun = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(GROK_INSPECTION_LAST_RUN_STORAGE_KEY);
    }
  } catch {
    console.warn('Failed to clear Grok inspection last run');
  }
};
