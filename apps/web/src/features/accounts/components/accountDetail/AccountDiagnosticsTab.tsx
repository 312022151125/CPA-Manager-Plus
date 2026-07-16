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
  const failedEventCount = events.filter((event) => event.failed).length;
  const latestFailedEvent = events.find((event) => event.failed) ?? null;
  const slowestLatencyMs = events.reduce<number | null>((current, event) => {
    if (typeof event.latency_ms !== 'number') return current;
    return current === null ? event.latency_ms : Math.max(current, event.latency_ms);
  }, null);
  const monitoringParams = new URLSearchParams({ auth_file: row.fileName });
  if (row.authIndex) monitoringParams.set('auth_index', row.authIndex);

  return (
    <div className={styles.drawerDetailStack}>
      <section className={styles.drawerSection}>
        <h3>{t('accounts.recommend_action')}</h3>
        <div className={styles.detailStrategySummary}>
          <span
            className={`${styles.badge} ${
              detailView.strategy.recommendation
                ? getRecommendationPriorityClass(detailView.strategy.recommendation.priority)
                : styles.badgeNeutral
            }`}
          >
            {t(detailView.strategy.recommendationActionLabelKey)}
          </span>
          <p>{t(detailView.strategy.recommendationReasonKey)}</p>
        </div>
      </section>
      <section className={styles.drawerSection}>
        <h3>{t('accounts.detail_inspection')}</h3>
        {detailView.strategy.inspectionFields.length > 0 ? (
          <AccountDetailFieldList fields={detailView.strategy.inspectionFields} />
        ) : (
          <p>{inspectionLoading ? t('common.loading') : t('accounts.detail_no_inspection')}</p>
        )}
      </section>
      {detailView.strategy.codexBadges.length > 0 ? (
        <section className={styles.drawerSection}>
          <h3>{t('accounts.detail_codex_status_badges')}</h3>
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
      <section className={styles.drawerSection}>
        <div className={styles.sectionHeaderInline}>
          <div>
            <h3>{t('accounts.detail_action_candidates')}</h3>
            <p>{t('accounts.detail_action_candidates_desc')}</p>
          </div>
          {candidatesLoading ? (
            <div className={styles.inlineLoading}>
              <LoadingSpinner size={16} />
              <span>{t('common.loading')}</span>
            </div>
          ) : null}
        </div>
        {candidatesError ? (
          <div className={styles.errorBox}>{candidatesError}</div>
        ) : detailView.strategy.actionCandidates.length === 0 ? (
          <p>{t('accounts.detail_action_candidates_empty')}</p>
        ) : (
          <div className={styles.detailCandidateList}>
            {detailView.strategy.actionCandidates.map((candidate) => (
              <div key={candidate.id} className={styles.detailCandidateItem}>
                <div>
                  <div className={styles.detailCandidateHeader}>
                    <strong>
                      {t(`accounts.action_type_${candidate.actionType}`, {
                        defaultValue: candidate.actionType,
                      })}
                    </strong>
                    <span className={styles.detailCandidateStatus}>
                      {translateDetailEnum(t, 'accounts.action_status_', candidate.status)}
                    </span>
                  </div>
                  <span>{candidate.reason || '-'}</span>
                </div>
                <small>
                  {t('accounts.detail_action_candidate_meta', {
                    hits: candidate.hitCount,
                    seen: formatTimestamp(candidate.lastSeenAtMs, i18n.language),
                  })}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className={styles.drawerSection}>
        <div className={styles.sectionHeaderInline}>
          <div>
            <h3>{t('accounts.detail_event_log')}</h3>
            <p>{t('accounts.detail_event_log_desc')}</p>
          </div>
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
        ) : events.length === 0 ? (
          <div className={styles.detailEventsFooter}>
            <span>{t('accounts.detail_events_empty')}</span>
            <a href={`#/monitoring?${monitoringParams.toString()}`}>
              {t('accounts.detail_event_footer_open_monitoring', {
                defaultValue: '前往请求监控',
              })}
            </a>
          </div>
        ) : (
          <div className={styles.detailEventsStack}>
            <div className={styles.detailEventSummary}>
              <div>
                <span>{t('accounts.detail_event_summary_total')}</span>
                <strong>{formatCompactNumber(eventsTotalCount || events.length)}</strong>
              </div>
              <div>
                <span>{t('accounts.detail_event_summary_failed')}</span>
                <strong>{formatCompactNumber(failedEventCount)}</strong>
              </div>
              <div>
                <span>{t('accounts.detail_event_summary_slowest')}</span>
                <strong>{formatDurationMs(slowestLatencyMs)}</strong>
              </div>
            </div>
            {latestFailedEvent ? (
              <div className={styles.detailEventFailureSummary}>
                <span>{t('accounts.detail_event_latest_failure')}</span>
                <strong>{getEventFailureReason(latestFailedEvent) || '-'}</strong>
              </div>
            ) : null}
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
                  defaultValue: '显示 {{shown}} / 共 {{total}} 条',
                  shown: events.length,
                  total: eventsTotalCount || events.length,
                })}
              </span>
              <a href={`#/monitoring?${monitoringParams.toString()}`}>
                {t('accounts.detail_event_footer_open_monitoring', {
                  defaultValue: '前往请求监控',
                })}
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
