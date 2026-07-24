import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  applyGrokInspectionExecutionResult,
  buildGrokInspectionError,
  buildExecutionFailureMessage,
  clearGrokInspectionConfigurableSettings,
  createGrokInspectionConnectionFingerprint,
  createGrokInspectionSession,
  DEFAULT_GROK_INSPECTION_SETTINGS,
  executeGrokInspectionActions,
  isGrokInspectionStoppedError,
  isExecutableAction,
  isReauthAction,
  isSuggestedAction,
  loadGrokInspectionLastRun,
  resolveGrokInspectionAutoActionItems,
  loadGrokInspectionConfigurableSettings,
  saveGrokInspectionLastRun,
  saveGrokInspectionConfigurableSettings,
  toReauthDeleteExecutionItem,
  type GrokInspectionAutoActionMode,
  type GrokInspectionConfigurableSettings,
  type GrokInspectionLastRunState,
  type GrokInspectionLogLevel,
  type GrokInspectionProgressSnapshot,
  type GrokInspectionResultItem,
  type GrokInspectionRunResult,
  type GrokInspectionSession,
} from '@/features/monitoring/grokInspection';
import { Button } from '@/components/ui/Button';
import { CodexInspectionLogsPanel } from '@/features/monitoring/components/CodexInspectionLogsPanel';
import { CodexInspectionResultsPanel } from '@/features/monitoring/components/CodexInspectionResultsPanel';
import { CodexInspectionStatusPanel } from '@/features/monitoring/components/CodexInspectionStatusPanel';
import { InspectionConfigDrawer } from '@/features/monitoring/components/InspectionConfigDrawer';
import { GrokInspectionConfigFields } from '@/features/monitoring/components/GrokInspectionConfigFields';
import {
  GROK_INSPECTION_RESULT_PAGE_SIZE_OPTIONS,
  asCodexCompatibleResults,
  asCodexCompatibleRunResult,
  buildCodexInspectionPaginationState,
  buildGrokConfigOverviewItems,
  countActions,
  countHandlingStates,
  createCompletedProgressSnapshot,
  createIdleProgressSnapshot,
  filterInspectionResults,
  formatGrokActionLabel,
  formatGrokAutoActionModeLabel,
  formatTime,
  getActionFilterCounts,
  normalizeActionFilter,
  toGrokSettingsDraft,
  validateGrokInspectionConfigDraft,
  validateGrokInspectionConfigFields,
  type ActionFilter,
  type ExecutionTriggerSource,
  type HandlingFilter,
  type InspectionLogEntry,
  type GrokInspectionSettingsDraft,
  type GrokInspectionSettingsDraftField,
  type RunStatus,
  type StatusTone,
  type SummaryCard,
} from '@/features/monitoring/model/grokInspectionPresentation';
import {
  isCodexInspectionAutoExecutionEnabled,
  toLocalInspectionLogViewEntry,
  type InspectionLogLevelFilter,
} from '@/features/monitoring/model/codexInspectionPresentation';
import { useAuthStore, useNotificationStore } from '@/stores';
import styles from './CodexInspectionPage.module.scss';

export function GrokInspectionPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionFingerprint = useMemo(
    () => createGrokInspectionConnectionFingerprint(apiBase, managementKey),
    [apiBase, managementKey]
  );
  const initialLastRunRef = useRef<GrokInspectionLastRunState | null | undefined>(
    undefined
  );
  if (initialLastRunRef.current === undefined) {
    initialLastRunRef.current = connectionFingerprint
      ? loadGrokInspectionLastRun(connectionFingerprint)
      : null;
  }
  const initialLastRun = initialLastRunRef.current;

  const [inspectionSettings, setInspectionSettings] = useState<GrokInspectionConfigurableSettings>(
    () => loadGrokInspectionConfigurableSettings()
  );
  const [settingsDraft, setSettingsDraft] = useState<GrokInspectionSettingsDraft>(() =>
    toGrokSettingsDraft(loadGrokInspectionConfigurableSettings())
  );
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [configFocusField, setConfigFocusField] = useState<string | null>(null);
  const [logs, setLogs] = useState<InspectionLogEntry[]>(() => initialLastRun?.logs ?? []);
  const [logsCollapsed, setLogsCollapsed] = useState(() => initialLastRun?.logsCollapsed ?? true);
  const [logLevelFilter, setLogLevelFilter] = useState<InspectionLogLevelFilter>('all');
  const [runStatus, setRunStatus] = useState<RunStatus>(() =>
    initialLastRun?.result ? 'success' : 'idle'
  );
  const [progress, setProgress] = useState<GrokInspectionProgressSnapshot>(() =>
    initialLastRun?.result
      ? createCompletedProgressSnapshot(initialLastRun.result)
      : createIdleProgressSnapshot()
  );
  const [result, setResult] = useState<GrokInspectionRunResult | null>(
    () => initialLastRun?.result ?? null
  );
  const [resultConnectionFingerprint, setResultConnectionFingerprint] = useState<string | null>(
    () => initialLastRun?.connectionFingerprint ?? null
  );
  const [executing, setExecuting] = useState(false);
  const [actionFilter, setActionFilter] = useState<ActionFilter>(() =>
    normalizeActionFilter(initialLastRun?.actionFilter ?? 'all')
  );
  const [handlingFilter, setHandlingFilter] = useState<HandlingFilter>('all');
  const [resultPage, setResultPage] = useState(1);
  const [resultPageSize, setResultPageSize] = useState<number>(
    GROK_INSPECTION_RESULT_PAGE_SIZE_OPTIONS[0]
  );
  const logCounterRef = useRef(initialLastRun?.logs.length ?? 0);
  const sessionRef = useRef<GrokInspectionSession | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const restoredConnectionFingerprintRef = useRef<string | null>(connectionFingerprint);
  const logListRef = useRef<HTMLDivElement | null>(null);
  const localLogEntries = useMemo(
    () => logs.map((entry) => toLocalInspectionLogViewEntry(entry, t)),
    [logs, t]
  );
  const executeItemsRef = useRef<
    ((
      items: GrokInspectionResultItem[],
      options?: {
        resultOverride?: GrokInspectionRunResult | null;
        source?: ExecutionTriggerSource;
        connectionFingerprint?: string | null;
      }
    ) => Promise<void>) | null
  >(null);

  useEffect(() => {
    if (restoredConnectionFingerprintRef.current === connectionFingerprint) return;
    restoredConnectionFingerprintRef.current = connectionFingerprint;

    activeSessionIdRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setExecuting(false);

    const restored = connectionFingerprint
      ? loadGrokInspectionLastRun(connectionFingerprint)
      : null;

    setLogs(restored?.logs ?? []);
    setLogsCollapsed(restored?.logsCollapsed ?? true);
    setRunStatus(restored?.result ? 'success' : 'idle');
    setProgress(
      restored?.result
        ? createCompletedProgressSnapshot(restored.result)
        : createIdleProgressSnapshot()
    );
    setResult(restored?.result ?? null);
    setResultConnectionFingerprint(restored?.connectionFingerprint ?? null);
    setActionFilter(normalizeActionFilter(restored?.actionFilter ?? 'all'));
    setHandlingFilter('all');
    logCounterRef.current = restored?.logs.length ?? 0;
  }, [connectionFingerprint]);

  useEffect(() => {
    if (!result || result.finishedAt <= 0) return;
    if (runStatus === 'running' || runStatus === 'paused') return;
    if (!connectionFingerprint || resultConnectionFingerprint !== connectionFingerprint) return;
    saveGrokInspectionLastRun({
      result,
      logs,
      logsCollapsed,
      actionFilter,
      connectionFingerprint,
    });
  }, [
    actionFilter,
    connectionFingerprint,
    logs,
    logsCollapsed,
    result,
    resultConnectionFingerprint,
    runStatus,
  ]);

  const appendLog = useCallback((level: GrokInspectionLogLevel, message: string) => {
    logCounterRef.current += 1;
    setLogs((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${logCounterRef.current}`,
        level,
        message,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const scrollLogsToBottom = useCallback(() => {
    const element = logListRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, []);

  useEffect(() => {
    if (logsCollapsed) return;
    scrollLogsToBottom();
  }, [logs, logsCollapsed, scrollLogsToBottom]);

  useEffect(() => {
    return () => {
      activeSessionIdRef.current = null;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  const attachSessionPromise = useCallback(
    (
      session: GrokInspectionSession,
      promise: Promise<GrokInspectionRunResult>,
      autoActionMode: GrokInspectionAutoActionMode,
      autoRecoverEnabled: boolean,
      runConnectionFingerprint: string | null
    ) => {
      const sessionId = session.id;

      void promise
        .then((nextResult) => {
          if (activeSessionIdRef.current !== sessionId) return;
          const nextSuggestedResults = nextResult.results.filter(isSuggestedAction);
          const autoTargets = resolveGrokInspectionAutoActionItems(
            autoActionMode,
            autoRecoverEnabled,
            nextSuggestedResults
          );
          setResult(nextResult);
          setResultConnectionFingerprint(runConnectionFingerprint);
          setProgress(session.getProgress());
          setRunStatus('success');
          setLogsCollapsed(true);
          if (isCodexInspectionAutoExecutionEnabled(autoActionMode, autoRecoverEnabled)) {
            const autoExecutionLabel =
              autoActionMode === 'none' && autoRecoverEnabled
                ? t('monitoring.codex_inspection_settings_auto_recover_on')
                : formatGrokAutoActionModeLabel(autoActionMode, t);
            if (autoTargets.length > 0 && executeItemsRef.current) {
              const startedMessage = t('monitoring.grok_inspection_auto_execute_started', {
                count: autoTargets.length,
                mode: autoExecutionLabel,
              });
              appendLog('info', startedMessage);
              showNotification(startedMessage, 'info');
              void executeItemsRef.current(autoTargets, {
                resultOverride: nextResult,
                source: 'auto',
                connectionFingerprint: runConnectionFingerprint,
              });
              return;
            }

            if (nextSuggestedResults.length > 0) {
              const skippedMessage = t('monitoring.grok_inspection_auto_execute_skipped_by_mode', {
                mode: autoExecutionLabel,
                count: nextSuggestedResults.length,
              });
              appendLog('warning', skippedMessage);
              showNotification(skippedMessage, 'info');
              return;
            }
          }

          const noActionsMessage =
            nextSuggestedResults.length === 0
              ? t('monitoring.grok_inspection_auto_execute_no_actions')
              : t('monitoring.grok_inspection_run_success');
          appendLog('success', noActionsMessage);
          showNotification(noActionsMessage, 'success');
        })
        .catch((error) => {
          if (activeSessionIdRef.current !== sessionId) return;
          if (isGrokInspectionStoppedError(error)) {
            setRunStatus('idle');
            setProgress(createIdleProgressSnapshot());
            return;
          }

          const message = buildGrokInspectionError(
            error instanceof Error ? error.message : String(error || t('common.unknown_error'))
          );
          appendLog('error', message);
          setRunStatus('error');
          setLogsCollapsed(false);
          showNotification(message, 'error');
        });
    },
    [appendLog, showNotification, t]
  );

  const startFreshInspection = useCallback(
    (
      preserveLogs: boolean = false,
      introMessage: string = '',
      options?: {
        autoActionMode?: GrokInspectionAutoActionMode;
      }
    ) => {
      if (connectionStatus !== 'connected') {
        const message = t('notification.connection_required');
        showNotification(message, 'warning');
        return;
      }
      if (!connectionFingerprint) {
        const message = t('notification.connection_required');
        showNotification(message, 'warning');
        return;
      }

      const autoActionMode = options?.autoActionMode ?? inspectionSettings.autoActionMode;
      const runConnectionFingerprint = connectionFingerprint;

      if (!preserveLogs) {
        setLogs([]);
      }
      if (introMessage) {
        appendLog('info', introMessage);
      }

      setResult(null);
      setResultConnectionFingerprint(runConnectionFingerprint);
      setRunStatus('running');
      setLogsCollapsed(false);
      setActionFilter('all');
      setHandlingFilter('all');

      const session = createGrokInspectionSession({
        apiBase,
        managementKey,
        settings: inspectionSettings,
        t,
        onLog: (level, message) => {
          if (activeSessionIdRef.current !== session.id) return;
          appendLog(level, message);
        },
        onProgress: (snapshot) => {
          if (activeSessionIdRef.current !== session.id) return;
          setProgress(snapshot);
          if (snapshot.status === 'running') {
            setRunStatus('running');
            return;
          }
          if (snapshot.status === 'paused') {
            setRunStatus('paused');
          }
        },
        onResultsChange: (nextResult) => {
          if (activeSessionIdRef.current !== session.id) return;
          setResult(nextResult);
          setResultConnectionFingerprint(runConnectionFingerprint);
        },
      });

      sessionRef.current = session;
      activeSessionIdRef.current = session.id;
      setProgress(session.getProgress());
      attachSessionPromise(
        session,
        session.start(),
        autoActionMode,
        inspectionSettings.autoRecoverEnabled,
        runConnectionFingerprint
      );
    },
    [
      apiBase,
      appendLog,
      attachSessionPromise,
      connectionFingerprint,
      connectionStatus,
      inspectionSettings,
      managementKey,
      showNotification,
      t,
    ]
  );

  const handleRunInspection = useCallback(() => {
    if (runStatus === 'paused' && sessionRef.current) {
      setLogsCollapsed(false);
      sessionRef.current.resume();
      return;
    }

    startFreshInspection(false);
  }, [runStatus, startFreshInspection]);

  const handlePauseInspection = useCallback(() => {
    if (runStatus !== 'running') return;
    sessionRef.current?.pause();
  }, [runStatus]);

  const handleStopInspection = useCallback(() => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    appendLog('warning', t('monitoring.grok_inspection_stopped'));
    activeSessionIdRef.current = null;
    sessionRef.current = null;
    currentSession.stop();
    setRunStatus('idle');
    setProgress(createIdleProgressSnapshot());
    setResult(null);
    setResultConnectionFingerprint(null);
    setLogsCollapsed(false);
  }, [appendLog, t]);

  const executeItems = useCallback(
    async (
      items: GrokInspectionResultItem[],
      options?: {
        resultOverride?: GrokInspectionRunResult | null;
        source?: ExecutionTriggerSource;
        connectionFingerprint?: string | null;
      }
    ) => {
      const currentResult = options?.resultOverride ?? result;
      const source = options?.source ?? 'manual';
      if (!currentResult) return;
      const currentResultFingerprint =
        options?.connectionFingerprint ?? resultConnectionFingerprint;
      if (!connectionFingerprint || currentResultFingerprint !== connectionFingerprint) {
        showNotification(t('notification.connection_required'), 'warning');
        return;
      }
      const targets = items.filter(isExecutableAction);
      if (targets.length === 0) {
        showNotification(t('monitoring.grok_inspection_no_pending_actions'), 'info');
        return;
      }

      setExecuting(true);
      setLogsCollapsed(false);
      appendLog('info', t('monitoring.grok_inspection_execute_started'));

      try {
        const execution = await executeGrokInspectionActions({
          settings: currentResult.settings,
          items: targets,
          previousFiles: currentResult.files,
          onLog: appendLog,
        });

        const failed = execution.outcomes.filter((item) => !item.success);
        if (failed.length > 0) {
          showNotification(
            `${t('monitoring.grok_inspection_execute_partial')}: ${failed
              .slice(0, 2)
              .map(buildExecutionFailureMessage)
              .join('; ')}`,
            'warning'
          );
        } else {
          showNotification(t('monitoring.grok_inspection_execute_success'), 'success');
        }
        const nextResult = applyGrokInspectionExecutionResult(currentResult, execution);
        setResult(nextResult);
        setResultConnectionFingerprint(currentResultFingerprint);

        if (source === 'auto') {
          const successCount = execution.outcomes.filter((item) => item.success).length;
          const failedCount = execution.outcomes.length - successCount;
          const remainingCount = nextResult.results.filter(isSuggestedAction).length;
          const summaryMessage =
            failedCount > 0 || remainingCount > 0
              ? t('monitoring.grok_inspection_auto_execute_summary_partial', {
                  total: targets.length,
                  success: successCount,
                  failed: failedCount,
                  remaining: remainingCount,
                })
              : t('monitoring.grok_inspection_auto_execute_summary_success', {
                  total: targets.length,
                  success: successCount,
                });
          appendLog(failedCount > 0 || remainingCount > 0 ? 'warning' : 'success', summaryMessage);
          showNotification(
            summaryMessage,
            failedCount > 0 || remainingCount > 0 ? 'warning' : 'success'
          );
        }
      } finally {
        setExecuting(false);
      }
    },
    [appendLog, connectionFingerprint, result, resultConnectionFingerprint, showNotification, t]
  );

  useEffect(() => {
    executeItemsRef.current = executeItems;
  }, [executeItems]);


  const displayResults = useMemo(() => (result ? result.results : []), [result]);

  const executableResults = useMemo(
    () => (result ? result.results.filter(isExecutableAction) : []),
    [result]
  );

  const reauthResults = useMemo(
    () => (result ? result.results.filter(isReauthAction) : []),
    [result]
  );

  const filteredResults = useMemo(
    () => filterInspectionResults(displayResults, handlingFilter, actionFilter),
    [displayResults, handlingFilter, actionFilter]
  );

  const resultPagination = useMemo(
    () => buildCodexInspectionPaginationState(filteredResults, resultPage, resultPageSize),
    [filteredResults, resultPage, resultPageSize]
  );

  useEffect(() => {
    setResultPage(1);
  }, [actionFilter, handlingFilter, result?.startedAt, result?.finishedAt]);

  useEffect(() => {
    if (resultPage === resultPagination.currentPage) return;
    setResultPage(resultPagination.currentPage);
  }, [resultPage, resultPagination.currentPage]);

  const handleResultPageSizeChange = useCallback((pageSize: number) => {
    setResultPageSize(pageSize);
    setResultPage(1);
  }, []);

  const handleExecutePlanned = useCallback(() => {
    if (!result) return;

    const targets = executableResults;
    const counts = countActions(targets);
    showConfirmation({
      title: t('monitoring.grok_inspection_execute_confirm_title'),
      message: t('monitoring.grok_inspection_execute_confirm_body', {
        total: targets.length,
        delete: counts.delete,
        disable: counts.disable,
        enable: counts.enable,
      }),
      confirmText: t('monitoring.grok_inspection_execute_now'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: () => executeItems(targets),
    });
  }, [executableResults, executeItems, result, showConfirmation, t]);

  const handleExecuteSingle = useCallback(
    (item: GrokInspectionResultItem) => {
      const actionLabel = formatGrokActionLabel(item.action, t);
      showConfirmation({
        title: t('monitoring.grok_inspection_execute_single_title'),
        message: t('monitoring.grok_inspection_execute_single_body', {
          account: item.displayAccount,
          action: actionLabel,
        }),
        confirmText: actionLabel,
        cancelText: t('common.cancel'),
        variant: item.action === 'delete' ? 'danger' : 'primary',
        onConfirm: () => executeItems([item]),
      });
    },
    [executeItems, showConfirmation, t]
  );

  const handleDeleteReauthPlanned = useCallback(() => {
    if (!result) return;

    const targets = reauthResults.map(toReauthDeleteExecutionItem);
    showConfirmation({
      title: t('monitoring.grok_inspection_delete_reauth_confirm_title'),
      message: t('monitoring.grok_inspection_delete_reauth_confirm_body', {
        count: targets.length,
      }),
      confirmText: t('monitoring.grok_inspection_delete_reauth_now'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: () => executeItems(targets),
    });
  }, [executeItems, reauthResults, result, showConfirmation, t]);

  const handleDeleteSingleReauth = useCallback(
    (item: GrokInspectionResultItem) => {
      showConfirmation({
        title: t('monitoring.grok_inspection_delete_reauth_single_title'),
        message: t('monitoring.grok_inspection_delete_reauth_single_body', {
          account: item.displayAccount,
          file: item.fileName,
        }),
        confirmText: t('monitoring.grok_inspection_action_delete'),
        cancelText: t('common.cancel'),
        variant: 'danger',
        onConfirm: () => executeItems([toReauthDeleteExecutionItem(item)]),
      });
    },
    [executeItems, showConfirmation, t]
  );

  const handleReauthAccount = useCallback(() => {
    showNotification(t('monitoring.grok_inspection_reauth_hint'), 'info');
    navigate('/oauth');
  }, [navigate, showNotification, t]);

  const summaryCards = useMemo<SummaryCard[]>(() => {
    const summarySource =
      runStatus === 'running' || runStatus === 'paused' ? progress.summary : result?.summary ?? null;
    const blank = '--';
    const dash = '—';
    const probeSetCount = summarySource ? summarySource.probeSetCount : null;
    const sampledTotal = summarySource ? summarySource.sampledCount : null;
    const sampledCompleted =
      summarySource === null
        ? null
        : runStatus === 'running' || runStatus === 'paused'
          ? progress.completed
          : summarySource.sampledCount;
    const deleteCount = summarySource ? summarySource.deleteCount : null;
    const disableCount = summarySource ? summarySource.disableCount : null;
    const enableCount = summarySource ? summarySource.enableCount : null;
    const reauthCount = summarySource ? summarySource.reauthCount : null;
    const keepCount = summarySource ? summarySource.keepCount : null;
    const actionCounts =
      summarySource !== null
        ? summarySource.deleteCount +
          summarySource.disableCount +
          summarySource.enableCount +
          summarySource.reauthCount
        : null;

    const probeMeta = summarySource
      ? t('monitoring.server_codex_inspection_total_files', {
          count: summarySource.totalFiles,
        })
      : t('monitoring.server_codex_inspection_total_files', { count: 0 });

    const sampledMeta = (() => {
      if (sampledTotal === null) {
        return t('monitoring.grok_inspection_sampled_meta_idle');
      }
      if (runStatus === 'running' || runStatus === 'paused') {
        return t('monitoring.grok_inspection_sampled_meta_running', {
          total: sampledTotal,
          percent: progress.percent,
        });
      }
      return t('monitoring.grok_inspection_sampled_meta_done', { total: sampledTotal });
    })();

    return [
      {
        key: 'probe-total',
        label: t('monitoring.grok_inspection_total_accounts'),
        value: probeSetCount === null ? blank : String(probeSetCount),
        meta: probeMeta,
        icon: 'probe',
        accent: 'blue',
      },
      {
        key: 'sampled',
        label: t('monitoring.grok_inspection_sampled_accounts'),
        value: sampledCompleted === null ? blank : String(sampledCompleted),
        meta: sampledMeta,
        icon: 'sampled',
        accent: 'cyan',
      },
      {
        key: 'delete',
        label: t('monitoring.grok_inspection_delete_count'),
        value: deleteCount === null ? blank : String(deleteCount),
        meta:
          actionCounts === null
            ? dash
            : t('monitoring.server_codex_inspection_action_total_value', { count: actionCounts }),
        tone: deleteCount && deleteCount > 0 ? 'bad' : undefined,
        icon: 'delete',
        accent: 'red',
      },
      {
        key: 'disable',
        label: t('monitoring.grok_inspection_disable_count'),
        value: disableCount === null ? blank : String(disableCount),
        meta: `${t('monitoring.grok_inspection_threshold')}: ${inspectionSettings.usedPercentThreshold}%`,
        tone: disableCount && disableCount > 0 ? 'warn' : undefined,
        icon: 'disable',
        accent: 'amber',
      },
      {
        key: 'enable',
        label: t('monitoring.grok_inspection_enable_count'),
        value: enableCount === null ? blank : String(enableCount),
        meta:
          keepCount === null
            ? dash
            : t('monitoring.server_codex_inspection_keep_count', { count: keepCount }),
        tone: enableCount && enableCount > 0 ? 'good' : undefined,
        icon: 'enable',
        accent: 'green',
      },
      {
        key: 'reauth',
        label: t('monitoring.grok_inspection_reauth_count'),
        value: reauthCount === null ? blank : String(reauthCount),
        meta: t('monitoring.grok_inspection_action_reauth'),
        tone: reauthCount && reauthCount > 0 ? 'info' : undefined,
        icon: 'reauth',
        accent: 'violet',
      },
    ];
  }, [
    inspectionSettings.usedPercentThreshold,
    progress.completed,
    progress.percent,
    progress.summary,
    result,
    runStatus,
    t,
  ]);

  const pendingActionCount = executableResults.length;
  const progressLabel =
    progress.total > 0
      ? t('monitoring.grok_inspection_progress_status', {
          completed: progress.completed,
          total: progress.total,
          inFlight: progress.inFlight,
          pending: progress.pending,
          percent: progress.percent,
        })
      : t('monitoring.grok_inspection_progress_idle');
  const showProgressBar = runStatus === 'running' || runStatus === 'paused';

  const statusToneMap: Record<RunStatus, StatusTone> = {
    idle: 'idle',
    running: 'info',
    paused: 'warn',
    success: 'good',
    error: 'bad',
  };

  const statusLabelMap: Record<RunStatus, string> = {
    idle: t('monitoring.grok_inspection_status_idle'),
    running: t('monitoring.grok_inspection_status_running'),
    paused: t('monitoring.grok_inspection_status_paused'),
    success: t('monitoring.grok_inspection_status_success'),
    error: t('monitoring.grok_inspection_status_error'),
  };

  const statusTone = statusToneMap[runStatus];
  const statusLabel = statusLabelMap[runStatus];

  const lastFinishedLabel =
    result && result.finishedAt > 0
      ? `${t('monitoring.grok_inspection_last_finished_at')} · ${formatTime(result.finishedAt, i18n.language)}`
      : null;

  const openSettingsModal = useCallback(
    (field?: string) => {
      setSettingsDraft(toGrokSettingsDraft(inspectionSettings));
      setConfigFocusField(field ?? null);
      setIsSettingsModalOpen(true);
    },
    [inspectionSettings]
  );

  const handleSettingsDraftChange = useCallback(
    (field: GrokInspectionSettingsDraftField, value: string) => {
      setSettingsDraft((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    []
  );

  const handleAutoActionModeChange = useCallback((value: GrokInspectionAutoActionMode) => {
    setSettingsDraft((previous) => ({
      ...previous,
      autoActionMode: value,
    }));
  }, []);

  const handleAutoRecoverEnabledChange = useCallback((value: boolean) => {
    setSettingsDraft((previous) => ({
      ...previous,
      autoRecoverEnabled: value,
    }));
  }, []);

  const settingsFieldErrors = useMemo(
    () => validateGrokInspectionConfigFields(settingsDraft, t),
    [settingsDraft, t]
  );

  const hasUnsavedSettings = useMemo(() => {
    const baseline = toGrokSettingsDraft(inspectionSettings);
    return (Object.keys(baseline) as (keyof GrokInspectionSettingsDraft)[]).some(
      (key) => baseline[key] !== settingsDraft[key]
    );
  }, [inspectionSettings, settingsDraft]);

  const handleSaveSettings = useCallback(() => {
    const validation = validateGrokInspectionConfigDraft(settingsDraft, t);
    if (!validation.ok) {
      const firstError = Object.values(validation.errors).find(Boolean);
      showNotification(firstError ?? t('common.unknown_error'), 'error');
      return;
    }

    const nextSettings = saveGrokInspectionConfigurableSettings(validation.values);
    setInspectionSettings(nextSettings);
    setSettingsDraft(toGrokSettingsDraft(nextSettings));
    setIsSettingsModalOpen(false);
    showNotification(t('monitoring.grok_inspection_settings_saved'), 'success');
  }, [settingsDraft, showNotification, t]);

  const handleCloseSettingsDrawer = useCallback(() => {
    if (hasUnsavedSettings) {
      showConfirmation({
        title: t('monitoring.server_codex_inspection_close_confirm_title'),
        message: t('monitoring.server_codex_inspection_close_unsaved_hint'),
        confirmText: t('monitoring.server_codex_inspection_discard'),
        cancelText: t('common.cancel'),
        variant: 'danger',
        onConfirm: () => {
          setSettingsDraft(toGrokSettingsDraft(inspectionSettings));
          setIsSettingsModalOpen(false);
        },
      });
      return;
    }
    setIsSettingsModalOpen(false);
  }, [hasUnsavedSettings, inspectionSettings, showConfirmation, t]);

  const handleResetSettings = useCallback(() => {
    clearGrokInspectionConfigurableSettings();
    const nextSettings = saveGrokInspectionConfigurableSettings(DEFAULT_GROK_INSPECTION_SETTINGS);
    setInspectionSettings(nextSettings);
    setSettingsDraft(toGrokSettingsDraft(nextSettings));
    showNotification(t('monitoring.grok_inspection_settings_reset'), 'success');
  }, [showNotification, t]);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const handleJumpToLatest = useCallback(() => {
    if (logsCollapsed) {
      setLogsCollapsed(false);
      requestAnimationFrame(scrollLogsToBottom);
      return;
    }
    scrollLogsToBottom();
  }, [logsCollapsed, scrollLogsToBottom]);

  const filterCounts = useMemo(() => getActionFilterCounts(displayResults), [displayResults]);
  const handlingFilterCounts = useMemo(
    () => countHandlingStates(displayResults),
    [displayResults]
  );

  const filterLabel = (filter: ActionFilter) => {
    switch (filter) {
      case 'delete':
        return t('monitoring.grok_inspection_filter_delete');
      case 'disable':
        return t('monitoring.grok_inspection_filter_disable');
      case 'enable':
        return t('monitoring.grok_inspection_filter_enable');
      case 'reauth':
        return t('monitoring.grok_inspection_filter_reauth');
      case 'keep':
        return t('monitoring.grok_inspection_action_keep');
      case 'all':
      default:
        return t('monitoring.grok_inspection_filter_all');
    }
  };

  const handlingFilterLabel = (filter: HandlingFilter) => {
    switch (filter) {
      case 'pending':
        return t('monitoring.grok_inspection_handling_filter_pending');
      case 'no_action':
        return t('monitoring.grok_inspection_handling_filter_no_action');
      case 'all':
      default:
        return t('monitoring.grok_inspection_handling_filter_all');
    }
  };

  const isInspectionInFlight = runStatus === 'running' || runStatus === 'paused';
  const runButtonLabel =
    runStatus === 'paused'
      ? t('monitoring.grok_inspection_resume')
      : runStatus === 'running'
        ? t('monitoring.grok_inspection_running')
        : t('monitoring.grok_inspection_run');
  const configOverviewItems = buildGrokConfigOverviewItems(inspectionSettings, t);

  const panelResult = asCodexCompatibleRunResult(result);
  const panelFilteredResults = asCodexCompatibleResults(resultPagination.pageItems);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader ?? undefined} style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{t('monitoring.grok_inspection_title')}</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.75 }}>{t('monitoring.grok_inspection_desc')}</p>
      </header>

      <CodexInspectionStatusPanel
        statusTone={statusTone}
        statusLabel={statusLabel}
        lastFinishedLabel={lastFinishedLabel}
        pendingActionCount={pendingActionCount}
        summaryCards={summaryCards}
        progress={progress as never}
        progressLabel={progressLabel}
        showProgressBar={showProgressBar}
        runStatus={runStatus}
        runButtonLabel={runButtonLabel}
        executing={executing}
        isInspectionInFlight={isInspectionInFlight}
        runDisabled={runStatus === 'running' || executing || connectionStatus !== 'connected'}
        configOverviewItems={configOverviewItems}
        configOverviewTitle={t('monitoring.grok_inspection_config_overview_title')}
        configOverviewEditLabel={t('monitoring.grok_inspection_config_overview_edit')}
        t={t}
        onEditConfig={openSettingsModal}
        onRunInspection={handleRunInspection}
        onPauseInspection={handlePauseInspection}
        onStopInspection={handleStopInspection}
      />

      <CodexInspectionResultsPanel
        result={panelResult as never}
        filteredResults={panelFilteredResults as never}
        pendingActionCount={pendingActionCount}
        manualActionCount={filterCounts.reauth}
        reauthActionCount={reauthResults.length}
        handlingFilterCounts={handlingFilterCounts}
        filterCounts={filterCounts}
        handlingFilter={handlingFilter}
        actionFilter={actionFilter}
        pagination={{
          ...resultPagination,
          pageItems: panelFilteredResults as never,
        }}
        pageSize={resultPageSize}
        pageSizeOptions={GROK_INSPECTION_RESULT_PAGE_SIZE_OPTIONS}
        executing={executing}
        isInspectionInFlight={isInspectionInFlight}
        t={t}
        title={t('monitoring.grok_inspection_results_title')}
        onActionFilterChange={setActionFilter}
        onHandlingFilterChange={setHandlingFilter}
        onPageChange={setResultPage}
        onPageSizeChange={handleResultPageSizeChange}
        onExecutePlanned={handleExecutePlanned}
        onExecuteSingle={(item) =>
          handleExecuteSingle(item as unknown as GrokInspectionResultItem)
        }
        onReauthAccount={() => handleReauthAccount()}
        onDeleteReauthPlanned={handleDeleteReauthPlanned}
        onDeleteReauthSingle={(item) =>
          handleDeleteSingleReauth(item as unknown as GrokInspectionResultItem)
        }
        filterLabel={filterLabel}
        handlingFilterLabel={handlingFilterLabel}
      />

      <CodexInspectionLogsPanel
        logs={localLogEntries}
        logsCollapsed={logsCollapsed}
        levelFilter={logLevelFilter}
        logListRef={logListRef}
        locale={i18n.language}
        t={t}
        onLevelFilterChange={setLogLevelFilter}
        onJumpToLatest={handleJumpToLatest}
        onClearLogs={handleClearLogs}
        onToggleCollapsed={() => setLogsCollapsed((previous) => !previous)}
      />

      <InspectionConfigDrawer
        open={isSettingsModalOpen}
        title={t('monitoring.grok_inspection_settings_title')}
        description={t('monitoring.grok_inspection_settings_desc')}
        closeLabel={t('common.close')}
        focusField={configFocusField}
        onClose={handleCloseSettingsDrawer}
        footer={
          <>
            <div className={styles.configDrawerStatus}>
              {hasUnsavedSettings ? (
                <span className={styles.serverUnsavedBadge}>
                  {t('monitoring.server_codex_inspection_unsaved')}
                </span>
              ) : (
                <span>{t('monitoring.server_codex_inspection_saved_applied')}</span>
              )}
            </div>
            <div className={styles.configDrawerActions}>
              <Button
                variant="secondary"
                size="sm"
                className={styles.settingsResetButton}
                onClick={handleResetSettings}
              >
                {t('monitoring.grok_inspection_settings_reset_button')}
              </Button>
              <Button size="sm" onClick={handleSaveSettings}>
                {t('common.save')}
              </Button>
            </div>
          </>
        }
      >
        <GrokInspectionConfigFields
          draft={settingsDraft}
          errors={settingsFieldErrors}
          t={t}
          onFieldChange={handleSettingsDraftChange}
          onAutoActionModeChange={handleAutoActionModeChange}
          onAutoRecoverEnabledChange={handleAutoRecoverEnabledChange}
        />
      </InspectionConfigDrawer>
    </div>
  );
}
