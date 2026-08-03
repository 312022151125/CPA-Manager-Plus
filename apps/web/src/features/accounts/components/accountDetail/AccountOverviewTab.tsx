import { useTranslation } from 'react-i18next';
import {
  IconChartLine,
  IconDatabaseZap,
  IconKey,
  IconShield,
  IconTriangleAlert,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type {
  AccountDetailField,
  AccountDetailOverviewTargetTab,
  AccountDetailViewModel,
} from '@/features/accounts/model/accountDetailViewModel';
import authFileStyles from '@/features/authFiles/AuthFilesPage.module.scss';
import { isHealthyAuthFileStatusMessage } from '@/features/authFiles/constants';
import type { AccountListHealthStatusKey } from '@/features/accounts/model/accountListPresentation';
import {
  formatPercent,
  formatQuotaResetTooltipParams,
  formatTimestampTitle,
} from '@/features/accounts/model/accountsPagePresentation';
import { statusBarDataFromRecentRequests } from '@/utils/recentRequests';
import { AccountDetailFieldValue } from './AccountDetailFieldList';
import styles from '@/features/accounts/AccountsPage.module.scss';

interface AccountOverviewTabProps {
  detailView: AccountDetailViewModel;
  getHealthStatusClass: (status: AccountListHealthStatusKey) => string;
  onSelectTab: (tab: AccountDetailOverviewTargetTab) => void;
}

function OverviewFieldGrid({ fields }: { fields: AccountDetailField[] }) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;
  return (
    <dl className={styles.overviewFieldGrid}>
      {fields.map((field) => (
        <div key={field.key}>
          <dt>{t(field.labelKey, { defaultValue: field.labelKey })}</dt>
          <dd>
            <AccountDetailFieldValue field={field} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AccountOverviewTab({ detailView, getHealthStatusClass }: AccountOverviewTabProps) {
  const { t, i18n } = useTranslation();
  const { decision, capacity, credential, recentStatus, activity, attention } = detailView.overview;
  const recentStatusData = statusBarDataFromRecentRequests(recentStatus.recentRequests);
  const hasRecentRequests = recentStatusData.totalSuccess + recentStatusData.totalFailure > 0;
  const hasStatusMessage =
    Boolean(recentStatus.statusMessage) &&
    !isHealthyAuthFileStatusMessage(recentStatus.statusMessage);
  const activityScopeLabel =
    activity.scope === 'monitoring_7d'
      ? t('accounts.detail_overview_activity_scope_7d', { days: activity.scopeDays ?? 7 })
      : t('accounts.detail_overview_activity_scope_recent');
  const healthTooltipParams = formatQuotaResetTooltipParams(
    detailView.health.tooltipParams,
    detailView.health.resetAtMs,
    i18n.language,
    detailView.quota.cooldown?.recoverAtMs
  );

  return (
    <div className={styles.overviewStack}>
      <section
        className={styles.overviewDecisionCard}
        data-overview-section="decision"
        data-overview-health={decision.status}
      >
        <div className={styles.overviewCardHeader}>
          <div className={styles.overviewSectionHeading}>
            <span className={styles.overviewSectionIcon} aria-hidden="true">
              <IconShield size={19} />
            </span>
            <h3>{t('accounts.detail_overview_decision_title')}</h3>
          </div>
          <span
            className={`${styles.badge} ${getHealthStatusClass(decision.status)}`}
            title={t(detailView.health.tooltipKey, healthTooltipParams)}
          >
            {t(decision.labelKey)}
          </span>
        </div>
        <p className={styles.overviewDecisionReason}>
          {t(decision.reasonKey, decision.reasonParams)}
        </p>
        <div className={styles.overviewEvidenceRow}>
          <div>
            <span>{t('accounts.detail_overview_decision_basis')}</span>
            <strong>{t(decision.basisLabelKey)}</strong>
          </div>
          <div>
            <span>{t('accounts.detail_overview_recent_observation')}</span>
            <strong>
              {decision.observedAtMs ? (
                <AccountDetailFieldValue
                  field={{
                    key: 'overviewObservedAt',
                    labelKey: 'accounts.detail_overview_recent_observation',
                    value: decision.observedAtMs,
                    valueKind: 'timestamp',
                  }}
                />
              ) : (
                t('accounts.detail_overview_observation_missing')
              )}
            </strong>
          </div>
        </div>
      </section>

      <section
        className={styles.overviewRecentStatusCard}
        data-overview-section="recent-status"
        data-overview-recent-status-empty={!hasRecentRequests}
      >
        <div className={styles.overviewCardHeader}>
          <div className={styles.overviewSectionHeading}>
            <span className={styles.overviewSectionIcon} aria-hidden="true">
              <IconChartLine size={18} />
            </span>
            <h3>{t('accounts.detail_overview_recent_status_title')}</h3>
          </div>
          <span className={styles.overviewScopePill}>
            {t('accounts.detail_overview_recent_status_scope')}
          </span>
        </div>

        <div className={styles.overviewRecentStatusLayout}>
          <div className={styles.overviewRecentStatusStats}>
            <div
              className={`${styles.overviewRecentStatusMetric} ${styles.overviewRecentStatusMetricSuccess}`}
            >
              <span>{t('accounts.detail_overview_recent_status_success')}</span>
              <strong>{recentStatusData.totalSuccess}</strong>
            </div>
            <div
              className={`${styles.overviewRecentStatusMetric} ${styles.overviewRecentStatusMetricFailure}`}
            >
              <span>{t('accounts.detail_overview_recent_status_failure')}</span>
              <strong>{recentStatusData.totalFailure}</strong>
            </div>
          </div>

          <div
            className={styles.overviewRecentStatusTimeline}
            data-overview-recent-status-bar="true"
          >
            <div className={styles.overviewRecentStatusTimelineHeader}>
              <span>{t('accounts.detail_overview_recent_status_timeline')}</span>
              <span>{t('accounts.detail_overview_recent_status_timeline_hint')}</span>
            </div>
            <ProviderStatusBar statusData={recentStatusData} styles={authFileStyles} />
          </div>
        </div>

        {!hasRecentRequests ? (
          <div
            className={styles.overviewEmptyState}
            data-overview-recent-status-empty-message="true"
          >
            {t('accounts.detail_overview_recent_status_empty')}
          </div>
        ) : null}

        {hasStatusMessage ? (
          <div
            className={styles.overviewRecentStatusMessage}
            data-overview-recent-status-message="true"
          >
            <span>{t('accounts.detail_overview_recent_status_message')}</span>
            <p>{recentStatus.statusMessage}</p>
          </div>
        ) : null}
      </section>

      <div className={styles.overviewCardGrid}>
        <section className={styles.overviewCard} data-overview-section="capacity">
          <div className={styles.overviewCardHeader}>
            <div className={styles.overviewSectionHeading}>
              <span className={styles.overviewSectionIcon} aria-hidden="true">
                <IconDatabaseZap size={18} />
              </span>
              <h3>{t('accounts.detail_overview_capacity_title')}</h3>
            </div>
          </div>
          <div className={styles.overviewPrimaryRow}>
            <strong className={styles.overviewPrimaryValue}>
              {capacity.kind === 'group_availability'
                ? t('accounts.detail_overview_capacity_group_count', {
                    available: capacity.availableGroupCount ?? 0,
                    total: capacity.totalGroupCount ?? 0,
                  })
                : capacity.remainingPercent === null
                  ? t('accounts.detail_overview_capacity_missing')
                  : formatPercent(capacity.remainingPercent)}
            </strong>
            <span className={styles.overviewStatusPill}>{t(capacity.statusLabelKey)}</span>
          </div>
          <p className={styles.overviewCardDescription}>{t(capacity.descriptionKey)}</p>
          <OverviewFieldGrid fields={capacity.fields} />
        </section>

        <section className={styles.overviewCard} data-overview-section="credential">
          <div className={styles.overviewCardHeader}>
            <div className={styles.overviewSectionHeading}>
              <span className={styles.overviewSectionIcon} aria-hidden="true">
                <IconKey size={18} />
              </span>
              <h3>{t('accounts.detail_overview_credential_title')}</h3>
            </div>
          </div>
          <div className={styles.overviewCredentialState}>
            <strong>{t(credential.statusLabelKey)}</strong>
            <span>{t(credential.sourceLabelKey)}</span>
          </div>
          <OverviewFieldGrid fields={credential.fields} />
        </section>
      </div>

      <section
        className={styles.overviewActivityCard}
        data-overview-section="activity"
        data-overview-activity-scope={activity.scope}
      >
        <div className={styles.overviewCardHeader}>
          <div className={styles.overviewSectionHeading}>
            <span className={styles.overviewSectionIcon} aria-hidden="true">
              <IconChartLine size={18} />
            </span>
            <h3>{t('accounts.detail_overview_activity_title')}</h3>
          </div>
          <span
            className={`${styles.overviewScopePill} ${
              activity.scope === 'recent_snapshot' ? styles.overviewScopePillFallback : ''
            }`}
          >
            {activityScopeLabel}
          </span>
        </div>
        {activity.hasActivity ? (
          <div className={styles.overviewMetricGrid}>
            {activity.metrics.map((metric) => {
              const valueTitle =
                metric.valueKind === 'timestamp' && typeof metric.value === 'number'
                  ? formatTimestampTitle(metric.value, i18n.language)
                  : undefined;
              return (
                <div
                  key={metric.key}
                  className={styles.overviewMetricCard}
                  data-overview-metric-key={metric.key}
                  data-overview-metric-kind={metric.valueKind ?? 'text'}
                >
                  <div className={styles.overviewMetricCardHeader}>
                    <span
                      className={styles.overviewMetricLabel}
                      title={t(metric.labelKey, { defaultValue: metric.labelKey })}
                    >
                      {t(metric.labelKey, { defaultValue: metric.labelKey })}
                    </span>
                  </div>
                  <div className={styles.overviewMetricCardBody}>
                    <strong className={styles.overviewMetricValue} title={valueTitle}>
                      <AccountDetailFieldValue field={metric} />
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.overviewEmptyState}>{t(activity.emptyStateKey)}</div>
        )}
      </section>

      {attention ? (
        <section
          className={styles.overviewAttentionCard}
          data-overview-section="attention"
          data-overview-attention-priority={attention.priority}
        >
          <span className={styles.overviewAttentionIcon} aria-hidden="true">
            <IconTriangleAlert size={19} />
          </span>
          <div className={styles.overviewAttentionBody}>
            <h3 className={styles.overviewAttentionHeading}>
              {t('accounts.detail_overview_attention_heading', {
                action: t(attention.actionLabelKey),
              })}
            </h3>
            <p>{t(attention.reasonKey, attention.reasonParams)}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
