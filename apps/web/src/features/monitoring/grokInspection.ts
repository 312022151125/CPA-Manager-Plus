import type { TFunction } from 'i18next';
import type { AuthFileItem } from '@/types';
import { authFilesApi } from '@/services/api/authFiles';
import { isXaiFile } from '@/utils/quota';
import {
  GROK_INSPECTION_AUTO_ACTION_MODES,
  GROK_INSPECTION_SETTINGS_STORAGE_KEY,
  DEFAULT_GROK_INSPECTION_SETTINGS,
  clearGrokInspectionConfigurableSettings,
  loadGrokInspectionConfigurableSettings,
  normalizeAutoActionMode,
  normalizeConfigurableSettings,
  readString,
  saveGrokInspectionConfigurableSettings,
} from '@/features/monitoring/model/grokInspectionSettings';
import {
  GROK_INSPECTION_LAST_RUN_STORAGE_KEY,
  clearGrokInspectionLastRun,
  hydrateGrokInspectionLastRun,
  loadGrokInspectionLastRun,
  saveGrokInspectionLastRun,
  serializeGrokInspectionLastRun,
  sortGrokInspectionResults as sortResults,
} from '@/features/monitoring/model/grokInspectionStorage';
import {
  inspectSingleGrokAccount,
  toGrokInspectionAccount,
} from '@/features/monitoring/model/grokInspectionProbe';
import { executeGrokInspectionActions } from '@/features/monitoring/model/grokInspectionExecution';

export {
  GROK_INSPECTION_AUTO_ACTION_MODES,
  GROK_INSPECTION_SETTINGS_STORAGE_KEY,
  DEFAULT_GROK_INSPECTION_SETTINGS,
  clearGrokInspectionConfigurableSettings,
  loadGrokInspectionConfigurableSettings,
  saveGrokInspectionConfigurableSettings,
};

export {
  GROK_INSPECTION_LAST_RUN_STORAGE_KEY,
  clearGrokInspectionLastRun,
  hydrateGrokInspectionLastRun,
  loadGrokInspectionLastRun,
  saveGrokInspectionLastRun,
  serializeGrokInspectionLastRun,
};

export { executeGrokInspectionActions };
export { resolveGrokProbeAction, toGrokInspectionAccount, buildGrokQuotaWindows, inspectSingleGrokAccount } from '@/features/monitoring/model/grokInspectionProbe';

export type GrokInspectionLogLevel = 'info' | 'success' | 'warning' | 'error';
export type GrokInspectionAction = 'keep' | 'delete' | 'disable' | 'enable' | 'reauth';
export type GrokInspectionExecutionAction = Extract<
  GrokInspectionAction,
  'delete' | 'disable' | 'enable'
>;
export type GrokInspectionProgressStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';
export type GrokInspectionAutoActionMode = 'none' | 'enable' | 'disable' | 'delete';
export type GrokInspectionStoredActionFilter =
  | 'all'
  | 'delete'
  | 'disable'
  | 'enable'
  | 'reauth'
  | 'keep';

export type GrokInspectionAccount = {
  key: string;
  fileName: string;
  displayAccount: string;
  authIndex: string;
  provider: string;
  disabled: boolean;
  status: string;
  state: string;
  raw: AuthFileItem;
};

export type GrokInspectionQuotaWindow = {
  id: string;
  labelKey: string;
  labelParams?: Record<string, string | number>;
  usedPercent: number | null;
  resetLabel: string;
};

export type GrokInspectionResultItem = {
  key: string;
  fileName: string;
  displayAccount: string;
  authIndex: string;
  provider: string;
  disabled: boolean;
  status: string;
  state: string;
  raw: AuthFileItem;
  action: GrokInspectionAction;
  actionReason: string;
  statusCode?: number | null;
  usedPercent: number | null;
  isQuota: boolean;
  planType?: string;
  quotaWindows?: GrokInspectionQuotaWindow[];
  error?: string;
  errorKind?: string;
  errorDetail?: string;
  handled?: boolean;
  executedAction?: string;
  actionError?: string;
};

export type GrokInspectionConfigurableSettings = {
  workers: number;
  retries: number;
  timeout: number;
  usedPercentThreshold: number;
  sampleSize: number;
  autoActionMode: GrokInspectionAutoActionMode;
  autoRecoverEnabled: boolean;
};

export type GrokInspectionSettings = GrokInspectionConfigurableSettings & {
  baseUrl: string;
  token: string;
};

export type GrokInspectionSummary = {
  totalFiles: number;
  probeSetCount: number;
  sampledCount: number;
  deleteCount: number;
  disableCount: number;
  enableCount: number;
  reauthCount: number;
  keepCount: number;
};

export type GrokInspectionProgressSummary = GrokInspectionSummary;

export type GrokInspectionRunResult = {
  settings: GrokInspectionSettings;
  files: AuthFileItem[];
  results: GrokInspectionResultItem[];
  summary: GrokInspectionSummary;
  startedAt: number;
  finishedAt: number;
};

export type GrokInspectionProgressSnapshot = {
  total: number;
  completed: number;
  inFlight: number;
  pending: number;
  percent: number;
  status: GrokInspectionProgressStatus;
  summary: GrokInspectionProgressSummary;
  startedAt: number;
  updatedAt: number;
};

export type GrokInspectionExecutionOutcome = {
  action: GrokInspectionExecutionAction;
  fileName: string;
  displayAccount: string;
  success: boolean;
  error: string;
};

export type GrokInspectionExecutionResult = {
  outcomes: GrokInspectionExecutionOutcome[];
  refreshedFiles: AuthFileItem[];
  refreshError: string;
};

export type GrokInspectionStoredLogEntry = {
  id: string;
  level: GrokInspectionLogLevel;
  message: string;
  timestamp: number;
};

export type GrokInspectionLastRunState = {
  result: GrokInspectionRunResult;
  logs: GrokInspectionStoredLogEntry[];
  logsCollapsed: boolean;
  actionFilter: GrokInspectionStoredActionFilter;
  connectionFingerprint: string | null;
  savedAt: number;
};

type LogHandler = (level: GrokInspectionLogLevel, message: string) => void;
type ProgressHandler = (progress: GrokInspectionProgressSnapshot) => void;
type ResultsChangeHandler = (result: GrokInspectionRunResult) => void;

type CreateGrokInspectionSessionOptions = {
  apiBase: string;
  managementKey: string;
  settings?: Partial<GrokInspectionConfigurableSettings> | null;
  t: TFunction;
  onLog?: LogHandler;
  onProgress?: ProgressHandler;
  onResultsChange?: ResultsChangeHandler;
};

type GrokInspectionSessionPromiseState = {
  promise: Promise<GrokInspectionRunResult>;
  resolve: (value: GrokInspectionRunResult) => void;
  reject: (reason?: unknown) => void;
};

export type GrokInspectionSession = {
  id: string;
  start: () => Promise<GrokInspectionRunResult>;
  resume: () => void;
  pause: () => void;
  stop: () => void;
  getProgress: () => GrokInspectionProgressSnapshot;
};

export class GrokInspectionStoppedError extends Error {
  constructor(message: string = 'Inspection stopped') {
    super(message);
    this.name = 'GrokInspectionStoppedError';
  }
}

export const createGrokInspectionConnectionFingerprint = (
  apiBase: string,
  managementKey: string
) => {
  const normalizedApiBase = readString(apiBase).replace(/\/+$/, '');
  const normalizedManagementKey = readString(managementKey);
  if (!normalizedApiBase || !normalizedManagementKey) return null;

  const input = `${normalizedApiBase}\u0000${normalizedManagementKey}`;
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193);
    hashB = Math.imul(hashB ^ code, 0x85ebca6b);
  }

  return `grok:v1:${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`;
};

const createDeferred = (): GrokInspectionSessionPromiseState => {
  let resolve: ((value: GrokInspectionRunResult) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;

  const promise = new Promise<GrokInspectionRunResult>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve: (value) => resolve?.(value),
    reject: (reason) => reject?.(reason),
  };
};

const pickSample = <T>(items: T[], sampleSize: number): T[] => {
  if (sampleSize <= 0 || sampleSize >= items.length) return [...items];

  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, sampleSize);
};

const createEmptyProgressSummary = (): GrokInspectionProgressSummary => ({
  totalFiles: 0,
  probeSetCount: 0,
  sampledCount: 0,
  deleteCount: 0,
  disableCount: 0,
  enableCount: 0,
  reauthCount: 0,
  keepCount: 0,
});

const buildProgressSummary = (
  files: AuthFileItem[],
  probeSet: GrokInspectionAccount[],
  sampledAccounts: GrokInspectionAccount[],
  results: GrokInspectionResultItem[]
): GrokInspectionProgressSummary => {
  const deleteCount = results.filter((item) => item.action === 'delete').length;
  const disableCount = results.filter((item) => item.action === 'disable').length;
  const enableCount = results.filter((item) => item.action === 'enable').length;
  const reauthCount = results.filter((item) => item.action === 'reauth').length;
  const keepCount = results.length - deleteCount - disableCount - enableCount - reauthCount;

  return {
    totalFiles: files.length,
    probeSetCount: probeSet.length,
    sampledCount: sampledAccounts.length,
    deleteCount,
    disableCount,
    enableCount,
    reauthCount,
    keepCount,
  };
};

const createProgressSnapshot = (
  total: number,
  completed: number,
  inFlight: number,
  status: GrokInspectionProgressStatus,
  startedAt: number,
  updatedAt: number = Date.now(),
  summary: GrokInspectionProgressSummary = createEmptyProgressSummary()
): GrokInspectionProgressSnapshot => {
  const pending = Math.max(0, total - completed - inFlight);
  return {
    total,
    completed,
    inFlight,
    pending,
    percent: total <= 0 ? 0 : Math.round((Math.min(total, completed) / total) * 100),
    status,
    summary,
    startedAt,
    updatedAt,
  };
};

const buildSummary = (
  files: AuthFileItem[],
  sampledAccounts: GrokInspectionAccount[],
  results: GrokInspectionResultItem[]
): GrokInspectionSummary => {
  const deleteCount = results.filter((item) => item.action === 'delete').length;
  const disableCount = results.filter((item) => item.action === 'disable').length;
  const enableCount = results.filter((item) => item.action === 'enable').length;
  const reauthCount = results.filter((item) => item.action === 'reauth').length;
  const keepCount = results.length - deleteCount - disableCount - enableCount - reauthCount;

  return {
    totalFiles: files.length,
    probeSetCount: sampledAccounts.length,
    sampledCount: results.length,
    deleteCount,
    disableCount,
    enableCount,
    reauthCount,
    keepCount,
  };
};

export const resolveGrokInspectionSettings = (
  apiBase: string,
  managementKey: string,
  settingsOverride?: Partial<GrokInspectionConfigurableSettings> | null
): GrokInspectionSettings => {
  const configurable = normalizeConfigurableSettings(settingsOverride ?? null);
  return {
    baseUrl: readString(apiBase),
    token: readString(managementKey),
    ...configurable,
  };
};

export const createGrokInspectionSession = ({
  apiBase,
  managementKey,
  settings,
  t,
  onLog,
  onProgress,
  onResultsChange,
}: CreateGrokInspectionSessionOptions): GrokInspectionSession => {
  const resolvedSettings = resolveGrokInspectionSettings(apiBase, managementKey, settings);
  const sessionId = `grok-inspection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let status: GrokInspectionProgressStatus = 'idle';
  let startedAt = 0;
  let finishedAt = 0;
  let files: AuthFileItem[] = [];
  let probeSet: GrokInspectionAccount[] = [];
  let sampledAccounts: GrokInspectionAccount[] = [];
  let cursor = 0;
  let inFlight = 0;
  let finalResult: GrokInspectionRunResult | null = null;
  let deferred: GrokInspectionSessionPromiseState | null = null;
  const resultMap = new Map<string, GrokInspectionResultItem>();

  const emitProgress = () => {
    const baseTime = startedAt || Date.now();
    const summary = buildProgressSummary(
      files,
      probeSet,
      sampledAccounts,
      Array.from(resultMap.values())
    );
    onProgress?.(
      createProgressSnapshot(
        sampledAccounts.length,
        resultMap.size,
        inFlight,
        status,
        baseTime,
        Date.now(),
        summary
      )
    );
  };

  const buildRunResult = (finishedTime: number): GrokInspectionRunResult => {
    const results = sortResults(Array.from(resultMap.values()));
    const summary = buildSummary(files, probeSet, results);
    return {
      settings: resolvedSettings,
      files,
      results,
      summary,
      startedAt,
      finishedAt: finishedTime,
    };
  };

  const emitResultsChange = (latestResult: GrokInspectionResultItem) => {
    if (latestResult.action === 'keep') return;
    onResultsChange?.(buildRunResult(0));
  };

  const settleStopped = () => {
    if (!deferred) return;
    const currentDeferred = deferred;
    deferred = null;
    currentDeferred.reject(new GrokInspectionStoppedError());
  };

  const settleCompleted = () => {
    if (!deferred) return;
    const currentDeferred = deferred;
    deferred = null;
    finishedAt = Date.now();
    finalResult = buildRunResult(finishedAt);
    status = 'completed';
    emitProgress();
    onLog?.(
      'success',
      `Inspection complete: delete ${finalResult.summary.deleteCount}, disable ${finalResult.summary.disableCount}, enable ${finalResult.summary.enableCount}, reauth ${finalResult.summary.reauthCount}, keep ${finalResult.summary.keepCount}`
    );
    currentDeferred.resolve(finalResult);
  };

  const maybeSettle = () => {
    if (status === 'stopped') {
      if (inFlight === 0) {
        settleStopped();
      }
      return;
    }

    if (cursor >= sampledAccounts.length && inFlight === 0) {
      settleCompleted();
    }
  };

  const pump = () => {
    if (status !== 'running') {
      maybeSettle();
      return;
    }

    while (
      status === 'running' &&
      inFlight < resolvedSettings.workers &&
      cursor < sampledAccounts.length
    ) {
      const account = sampledAccounts[cursor];
      cursor += 1;
      inFlight += 1;
      emitProgress();

      void inspectSingleGrokAccount({
        account,
        settings: resolvedSettings,
        t,
        onLog,
      })
        .then((inspectionResult) => {
          resultMap.set(inspectionResult.key, inspectionResult);
          emitResultsChange(inspectionResult);
        })
        .catch((error) => {
          const fallbackResult: GrokInspectionResultItem = {
            ...account,
            action: 'keep',
            actionReason: t('monitoring.grok_inspection_reason_probe_failed'),
            statusCode: null,
            usedPercent: null,
            isQuota: false,
            error: error instanceof Error ? error.message : String(error || 'probe failed'),
          };
          resultMap.set(account.key, fallbackResult);
          emitResultsChange(fallbackResult);
        })
        .finally(() => {
          inFlight = Math.max(0, inFlight - 1);
          emitProgress();
          pump();
        });
    }

    maybeSettle();
  };

  const ensureStarted = () => {
    if (startedAt <= 0) {
      startedAt = Date.now();
    }
    if (!deferred) {
      deferred = createDeferred();
    }
    return deferred;
  };

  const initialize = async () => {
    onLog?.('info', 'Loading auth files (xAI/Grok)');

    const authFilesResponse = await authFilesApi.list();
    files = Array.isArray(authFilesResponse.files) ? authFilesResponse.files : [];
    probeSet = files.filter(isXaiFile).map(toGrokInspectionAccount);
    sampledAccounts =
      resolvedSettings.sampleSize > 0
        ? pickSample(probeSet, Math.min(resolvedSettings.sampleSize, probeSet.length))
        : probeSet;

    if (probeSet.length === 0) {
      onLog?.('warning', t('monitoring.grok_inspection_empty_accounts'));
    } else {
      onLog?.(
        'info',
        `Probe set ${probeSet.length} account(s), sampling ${sampledAccounts.length}`
      );
    }
    emitProgress();
  };

  const start = () => {
    if (finalResult) {
      return Promise.resolve(finalResult);
    }

    if (status === 'completed') {
      return Promise.reject(new Error('Inspection finished; start again'));
    }

    if (status === 'running') {
      return ensureStarted().promise;
    }

    if (status === 'paused') {
      status = 'running';
      onLog?.('info', 'Resuming inspection');
      emitProgress();
      pump();
      return ensureStarted().promise;
    }

    if (status === 'stopped') {
      return Promise.reject(new GrokInspectionStoppedError('Inspection stopped; start again'));
    }

    const currentDeferred = ensureStarted();
    status = 'running';
    emitProgress();

    void initialize()
      .then(() => {
        pump();
      })
      .catch((error) => {
        status = 'completed';
        emitProgress();
        const activeDeferred = deferred;
        deferred = null;
        activeDeferred?.reject(error);
      });

    return currentDeferred.promise;
  };

  const resume = () => {
    if (status !== 'paused') return;
    status = 'running';
    onLog?.('info', 'Resuming inspection');
    emitProgress();
    pump();
  };

  const pause = () => {
    if (status !== 'running') return;
    status = 'paused';
    onLog?.(
      'info',
      inFlight > 0 ? `Paused; waiting for ${inFlight} in-flight probe(s)` : 'Paused'
    );
    emitProgress();
    maybeSettle();
  };

  const stop = () => {
    if (status === 'completed' || status === 'stopped' || status === 'idle') return;
    status = 'stopped';
    onLog?.(
      'warning',
      inFlight > 0 ? `Stopped; waiting for ${inFlight} in-flight probe(s)` : 'Stopped'
    );
    emitProgress();
    maybeSettle();
  };

  return {
    id: sessionId,
    start,
    resume,
    pause,
    stop,
    getProgress: () =>
      createProgressSnapshot(
        sampledAccounts.length,
        resultMap.size,
        inFlight,
        status,
        startedAt || Date.now(),
        Date.now(),
        buildProgressSummary(files, probeSet, sampledAccounts, Array.from(resultMap.values()))
      ),
  };
};

export const buildGrokInspectionError = (message: string) => message;

export const buildExecutionFailureMessage = (outcome: GrokInspectionExecutionOutcome) =>
  `${outcome.displayAccount}: ${outcome.error || 'execution failed'}`;

export const isSuggestedAction = (item: GrokInspectionResultItem) => item.action !== 'keep';

export const isExecutableAction = (item: GrokInspectionResultItem) =>
  item.action === 'delete' || item.action === 'disable' || item.action === 'enable';

export const isReauthAction = (item: GrokInspectionResultItem) => item.action === 'reauth';

export const toReauthDeleteExecutionItem = (
  item: GrokInspectionResultItem
): GrokInspectionResultItem => ({
  ...item,
  action: 'delete',
  actionReason: item.actionReason
    ? `${item.actionReason}; delete reauth account`
    : 'delete reauth account',
});

export const resolveGrokInspectionAutoActionItems = (
  mode: GrokInspectionAutoActionMode,
  autoRecoverEnabled: boolean,
  items: GrokInspectionResultItem[]
): GrokInspectionResultItem[] => {
  const normalizedMode = normalizeAutoActionMode(mode);
  const canAutoRecover = (item: GrokInspectionResultItem) =>
    autoRecoverEnabled && item.action === 'enable';

  if (normalizedMode === 'none' || normalizedMode === 'enable') {
    return items.filter(canAutoRecover);
  }

  if (normalizedMode === 'disable') {
    return items
      .filter(
        (item) => canAutoRecover(item) || item.action === 'delete' || item.action === 'disable'
      )
      .map((item) =>
        item.action === 'delete'
          ? {
              ...item,
              action: 'disable' as const,
              actionReason: item.actionReason
                ? `${item.actionReason}; auto-disable policy`
                : 'auto-disable policy',
            }
          : item
      );
  }

  return items.filter(
    (item) => canAutoRecover(item) || item.action === 'delete' || item.action === 'disable'
  );
};

export const isGrokInspectionStoppedError = (
  error: unknown
): error is GrokInspectionStoppedError => error instanceof GrokInspectionStoppedError;

export const applyGrokInspectionExecutionResult = (
  previousResult: GrokInspectionRunResult,
  execution: GrokInspectionExecutionResult
): GrokInspectionRunResult => {
  const successfulOutcomes = new Map(
    execution.outcomes.filter((item) => item.success).map((item) => [item.fileName, item] as const)
  );
  const refreshedAccounts = new Map(
    execution.refreshedFiles.filter(isXaiFile).map((file) => {
      const account = toGrokInspectionAccount(file);
      return [account.fileName, account] as const;
    })
  );

  const nextResults = sortResults(
    previousResult.results.map((item) => {
      const refreshedAccount = refreshedAccounts.get(item.fileName);
      const baseItem: GrokInspectionResultItem = refreshedAccount
        ? {
            ...item,
            ...refreshedAccount,
            raw: refreshedAccount.raw,
          }
        : item;
      const outcome = successfulOutcomes.get(item.fileName);

      if (!outcome) {
        return baseItem;
      }

      return {
        ...baseItem,
        disabled:
          outcome.action === 'disable'
            ? true
            : outcome.action === 'enable'
              ? false
              : baseItem.disabled,
        action: 'keep' as const,
        actionReason: 'No action needed',
        error: '',
        handled: true,
        executedAction: outcome.action,
      };
    })
  );

  const deleteCount = nextResults.filter((item) => item.action === 'delete').length;
  const disableCount = nextResults.filter((item) => item.action === 'disable').length;
  const enableCount = nextResults.filter((item) => item.action === 'enable').length;
  const reauthCount = nextResults.filter((item) => item.action === 'reauth').length;
  const keepCount = nextResults.length - deleteCount - disableCount - enableCount - reauthCount;

  return {
    ...previousResult,
    files: execution.refreshedFiles,
    results: nextResults,
    summary: {
      ...previousResult.summary,
      totalFiles: execution.refreshedFiles.length,
      deleteCount,
      disableCount,
      enableCount,
      reauthCount,
      keepCount,
    },
    finishedAt: Date.now(),
  };
};

export const buildSuggestedActionCountLabel = (summary: GrokInspectionSummary) =>
  summary.deleteCount + summary.disableCount + summary.enableCount + summary.reauthCount;
