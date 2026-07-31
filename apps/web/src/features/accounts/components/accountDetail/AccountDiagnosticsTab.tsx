import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconRefreshCw } from '@/components/ui/icons';
import type { AccountDetailViewModel } from '@/features/accounts/model/accountDetailViewModel';
import type { AccountRecommendationPriority } from '@/features/accounts/model/quotaRecommendations';
import type { AccountRow } from '@/features/accounts/model/accountRows';
import type { MonitoringAnalyticsEventRow } from '@/services/api';
import {
  formatCompactNumber,
  formatDurationMs,
  formatPercent,
  formatTimestamp,
  getEventFailureReason,
  getEventStatusText,
  translateDetailEnum,
} from '@/features/accounts/model/accountsPagePresentation';
import { CopyableText } from '../CopyableText';
import { AccountDetailFieldList } from './AccountDetailFieldList';
import styles from '@/features/accounts/AccountsPage.module.scss';

interface AccountDiagnosticsTabProps {
  row: AccountRow;
  detailView: AccountDetailViewModel;
  inspectionLoading: boolean;
  candidatesLoading: boolean;
  candidatesError: string;
  events: MonitoringAnalyticsEventRow[];
  eventsTotalCount: number;
  eventsHasMore: boolean;
  eventsLoading: boolean;
  eventsAppending: boolean;
  eventsError: string;
  eventsUnavailable: boolean;
  nextBeforeMs: number | null;
  nextBeforeId: number | null;
  getRecommendationPriorityClass: (priority: AccountRecommendationPriority) => string;
  onRefreshEvents: () => void;
  onLoadMoreEvents: (beforeMs: number | null, beforeId: number | null) => void;
}

export function AccountDiagnosticsTab({
  row,
  detailView,
  inspectionLoading,
  candidatesLoading,
  candidatesError,
  events,
  eventsTotalCount,
  eventsHasMore,
  eventsLoading,
  eventsAppending,
  eventsError,
  eventsUnavailable,
  nextBeforeMs,
  nextBeforeId,
  getRecommendationPriorityClass,
  onRefreshEvents,
  onLoadMoreEvents,
}: AccountDiagnosticsTabProps) {
  const { t, i18n } = useTranslation();
  const conclusion = detailView.strategy.conclusion;
  const activity = detailView.strategy.activity;
  const monitoringParams = new URLSearchParams({ auth_file: row.fileName });
  if (row.authIndex) monitoringParams.set('auth_index', row.authIndex);

  const evidenceStatusClass = {
    current: styles.diagnosticEvidenceStatusCurrent,
    outdated: styles.diagnosticEvidenceStatusOutdated,
    conflict: styles.diagnosticEvidenceStatusConflict,
  }[conclusion.evidenceStatus];
  const hasInspectionEvidence =
    detailView.strategy.inspectionFields.length > 0 || inspectionLoading;
  const hasCodexEvidence = detailView.strategy.codexBadges.length > 0;
  const hasCandidateEvidence =
    detailView.strategy.actionCandidates.length > 0 ||
    candidatesLoading ||
    Boolean(candidatesError);
  const hasDiagnosticEvidence = hasInspectionEvidence || hasCodexEvidence || hasCandidateEvidence;
  const activityTotalCalls = activity.totalCalls ?? eventsTotalCount;
  const recentFailureMeta = activity.recentFailure
    ? [
        formatTimestamp(activity.recentFailure.timestampMs, i18n.language),
        activity.recentFailure.model,
        activity.recentFailure.statusCode ? `HTTP ${activity.recentFailure.statusCode}` : '',
      ].filter(Boolean)
    : [];

  return (
    <div className={styles.drawerDetailStack}>
      <section
        className={`${styles.drawerSection} ${styles.diagnosticConclusionSection}`}
        data-diagnostic-evidence-status={conclusion.evidenceStatus}
      >
        <div className={styles.diagnosticConclusionHeader}>
          <h3>{t('accounts.detail_diagnostic_conclusion')}</h3>
          <div className={styles.diagnosticConclusionState}>
            {inspectionLoading ? <LoadingSpinner size={14} /> : null}
            <span className={evidenceStatusClass}>{t(conclusion.evidenceStatusLabelKey)}</span>
          </div>
        </div>
        <div className={styles.diagnosticConclusionMain}>
          <span
            className={`${styles.badge} ${
              conclusion.priority
                ? getRecommendationPriorityClass(conclusion.priority)
                : styles.badgeNeutral
            }`}
          >
            {t(conclusion.actionLabelKey)}
          </span>
          <p>{t(conclusion.reasonKey)}</p>
        </div>
        <div className={styles.diagnosticConclusionMeta}>
          <span>
            <strong>{t('accounts.detail_diagnostic_source')}</strong>
            {t(conclusion.sourceLabelKey)}
          </span>
          {conclusion.observedAtMs !== null ? (
            <span>
              <strong>{t('accounts.detail_observed_at')}</strong>
              {formatTimestamp(conclusion.observedAtMs, i18n.language)}
            </span>
          ) : null}
          {conclusion.evidenceStatus !== 'current' && conclusion.latestActivityAtMs !== null ? (
            <span>
              <strong>{t('accounts.detail_diagnostic_latest_activity')}</strong>
              {formatTimestamp(conclusion.latestActivityAtMs, i18n.language)}
            </span>
          ) : null}
        </div>
      </section>

      <section className={styles.drawerSection}>
        <div className={styles.sectionHeaderInline}>
          <h3>{t('accounts.detail_activity_title')}</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefreshEvents}
            disabled={eventsUnavailable || eventsLoading || eventsAppending}
            loading={eventsLoading}
          >
            {!eventsLoading ? <IconRefreshCw size={14} /> : null}
            {t('common.refresh')}
          </Button>
        </div>
        {eventsUnavailable ? (
          <p>{t('accounts.detail_events_unavailable')}</p>
        ) : eventsLoading ? (
          <div className={styles.inlineLoading}>
            <LoadingSpinner size={16} />
            <span>{t('common.loading')}</span>
          </div>
        ) : eventsError ? (
          <div className={styles.errorBox}>{eventsError}</div>
        ) : (
          <div className={styles.detailEventsStack}>
            <div className={styles.detailActivitySummary}>
              <div data-diagnostic-activity-metric="requests">
                <span>{t('accounts.detail_activity_requests')}</span>
                <strong title={String(activityTotalCalls)}>
                  {formatCompactNumber(activityTotalCalls)}
                </strong>
              </div>
              <div data-diagnostic-activity-metric="failure-rate">
                <span>{t('accounts.detail_activity_failure_rate')}</span>
                <strong>{formatPercent(activity.failureRate, 1)}</strong>
              </div>
              <div data-diagnostic-activity-metric="p95-latency">
                <span>{t('accounts.detail_activity_p95_latency')}</span>
                <strong>{formatDurationMs(activity.p95LatencyMs)}</strong>
              </div>
            </div>

            {activity.recentFailure ? (
              <div className={styles.detailEventFailureSummary}>
                <span>{t('accounts.detail_activity_latest_failure')}</span>
                <strong>
                  {activity.recentFailure.reason || t('accounts.detail_event_failed_reason_empty')}
                </strong>
                {recentFailureMeta.length > 0 ? (
                  <small>{recentFailureMeta.join(' · ')}</small>
                ) : null}
              </div>
            ) : null}

            {events.length === 0 ? (
              <div className={styles.detailEventsFooter}>
                <span>{t('accounts.detail_events_empty')}</span>
                <a href={`#/monitoring?${monitoringParams.toString()}`}>
                  {t('accounts.detail_event_footer_open_monitoring')}
                </a>
              </div>
            ) : (
              <>
                <div className={styles.detailEventsList}>
                  {events.map((event) => {
                    const requestLabel = event.request_id || event.event_hash.slice(0, 10) || '-';
                    const modelLabel = event.resolved_model || event.model || '-';
                    const failureReason = getEventFailureReason(event);
                    return (
                      <article key={event.event_hash} className={styles.detailEventItem}>
                        <div className={styles.detailEventHeader}>
                          <span
                            className={`${styles.eventStatus} ${
                              event.failed ? styles.eventStatusFailed : styles.eventStatusSuccess
                            }`}
                            title={failureReason || undefined}
                          >
                            {getEventStatusText(event, t)}
                          </span>
                          <strong>{formatTimestamp(event.timestamp_ms, i18n.language)}</strong>
                        </div>
                        <div className={styles.detailEventIdentity}>
                          <CopyableText
                            value={requestLabel}
                            copyValue={event.request_id || event.event_hash}
                          />
                          <span title={modelLabel}>{modelLabel}</span>
                        </div>
                        {event.failed ? (
                          <p className={styles.detailEventFailureReason}>
                            {failureReason || t('accounts.detail_event_failed_reason_empty')}
                          </p>
                        ) : null}
                        <div className={styles.detailEventMeta}>
                          <span>
                            {t('accounts.value_input_tokens')}:{' '}
                            {formatCompactNumber(event.input_tokens)}
                          </span>
                          <span>
                            {t('accounts.value_output_tokens')}:{' '}
                            {formatCompactNumber(event.output_tokens)}
                          </span>
                          <span>
                            {t('accounts.detail_event_col_latency')}:{' '}
                            {formatDurationMs(event.latency_ms)}
                          </span>
                          <span>TTFT: {formatDurationMs(event.ttft_ms)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {eventsHasMore ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onLoadMoreEvents(nextBeforeMs, nextBeforeId)}
                    disabled={eventsAppending}
                    loading={eventsAppending}
                  >
                    {t('accounts.detail_event_load_more')}
                  </Button>
                ) : null}
                <div className={styles.detailEventsFooter}>
                  <span>
                    {t('accounts.detail_event_footer_count', {
                      shown: events.length,
                      total: eventsTotalCount || events.length,
                    })}
                  </span>
                  <a href={`#/monitoring?${monitoringParams.toString()}`}>
                    {t('accounts.detail_event_footer_open_monitoring')}
                  </a>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {hasDiagnosticEvidence ? (
        <details className={`${styles.drawerSection} ${styles.diagnosticEvidenceDisclosure}`}>
          <summary>
            <span>{t('accounts.detail_diagnostic_evidence')}</span>
            {candidatesError ? (
              <small>{t('accounts.detail_diagnostic_evidence_error')}</small>
            ) : null}
          </summary>
          <div className={styles.diagnosticEvidenceBody}>
            {hasInspectionEvidence ? (
              <section className={styles.diagnosticEvidenceGroup}>
                <h4>{t('accounts.detail_diagnostic_inspection_evidence')}</h4>
                {detailView.strategy.inspectionFields.length > 0 ? (
                  <AccountDetailFieldList fields={detailView.strategy.inspectionFields} />
                ) : (
                  <div className={styles.inlineLoading}>
                    <LoadingSpinner size={14} />
                    <span>{t('common.loading')}</span>
                  </div>
                )}
              </section>
            ) : null}

            {hasCodexEvidence ? (
              <section className={styles.diagnosticEvidenceGroup}>
                <h4>{t('accounts.detail_diagnostic_codex_evidence')}</h4>
                <div className={styles.detailBadgeList}>
                  {[...detailView.strategy.codexBadges]
                    .sort((left, right) => {
                      const order = { danger: 0, warning: 1, info: 2 } as const;
                      return order[left.tone] - order[right.tone];
                    })
                    .map((badge) => (
                      <span
                        key={badge.kind}
                        className={`${styles.badge} ${
                          badge.tone === 'danger'
                            ? styles.badgeBad
                            : badge.tone === 'warning'
                              ? styles.badgeWarn
                              : styles.badgeInfo
                        }`}
                        title={
                          badge.titleKey
                            ? t(badge.titleKey, {
                                defaultValue: badge.defaultTitle,
                                ...badge.labelParams,
                              })
                            : undefined
                        }
                      >
                        {t(badge.labelKey, {
                          defaultValue: badge.defaultLabel,
                          ...badge.labelParams,
                        })}
                      </span>
                    ))}
                </div>
              </section>
            ) : null}

            {hasCandidateEvidence ? (
              <section className={styles.diagnosticEvidenceGroup}>
                <div className={styles.diagnosticEvidenceGroupHeader}>
                  <h4>{t('accounts.detail_diagnostic_candidate_evidence')}</h4>
                  {candidatesLoading ? <LoadingSpinner size={14} /> : null}
                </div>
                {candidatesError ? (
                  <div className={styles.errorBox}>{candidatesError}</div>
                ) : detailView.strategy.actionCandidates.length > 0 ? (
                  <div className={styles.detailCandidateList}>
                    {detailView.strategy.actionCandidates.map((candidate) => {
                      const candidateReason = candidate.reasonCode
                        ? t(`account_actions.reason_${candidate.reasonCode}`, {
                            defaultValue: candidate.reason || '-',
                          })
                        : candidate.reason || '-';
                      return (
                        <div key={candidate.id} className={styles.detailCandidateItem}>
                          <div>
                            <div className={styles.detailCandidateHeader}>
                              <strong>
                                {t(`accounts.action_type_${candidate.actionType}`, {
                                  defaultValue: candidate.actionType,
                                })}
                              </strong>
                              <span className={styles.detailCandidateStatus}>
                                {translateDetailEnum(
                                  t,
                                  'accounts.action_status_',
                                  candidate.status
                                )}
                              </span>
                            </div>
                            <span>{candidateReason}</span>
                          </div>
                          <small>
                            {t('accounts.detail_action_candidate_meta', {
                              hits: candidate.hitCount,
                              seen: formatTimestamp(candidate.lastSeenAtMs, i18n.language),
                            })}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
