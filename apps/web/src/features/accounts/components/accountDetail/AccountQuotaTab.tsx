import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { JSX } from 'react';
import {
  IconBinary,
  IconChartLine,
  IconCheck,
  IconDollarSign,
  IconRefreshCw,
  IconScrollText,
  IconSidebarQuota,
} from '@/components/ui/icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type {
  AccountDetailQuotaWindow,
  AccountDetailViewModel,
} from '@/features/accounts/model/accountDetailViewModel';
import type { AccountRow } from '@/features/accounts/model/accountRows';
import {
  formatCompactNumber,
  formatQuotaResetTimestamp,
} from '@/features/accounts/model/accountsPagePresentation';
import { QuotaWindowCard } from '../QuotaWindowCard';
import { AccountDetailFieldList } from './AccountDetailFieldList';
import styles from '@/features/accounts/AccountsPage.module.scss';

const isIntervalQuotaWindow = (window: AccountDetailQuotaWindow): boolean =>
  window.windowMode === 'fixed' ||
  window.windowMode === 'calendar' ||
  window.windowMode === 'rolling';

const isModelScopedQuotaWindow = (window: AccountDetailQuotaWindow): boolean =>
  window.modelScope?.kind !== undefined && window.modelScope.kind !== 'all';

type MetricTone = 'blue' | 'green' | 'purple' | 'orange';

interface MetricCellProps {
  icon: JSX.Element;
  tone: MetricTone;
  label: string;
  value: string;
  valueTitle?: string;
}

const metricIconClass = (tone: MetricTone): string => {
  switch (tone) {
    case 'blue':
      return `${styles.metricIcon} ${styles.metricIconBlue}`;
    case 'green':
      return `${styles.metricIcon} ${styles.metricIconGreen}`;
    case 'purple':
      return `${styles.metricIcon} ${styles.metricIconPurple}`;
    case 'orange':
      return `${styles.metricIcon} ${styles.metricIconOrange}`;
    default:
      return styles.metricIcon;
  }
};

const metricCardClass = (tone: MetricTone): string => {
  switch (tone) {
    case 'blue':
      return styles.quotaSummaryMetricBlue;
    case 'green':
      return styles.quotaSummaryMetricGreen;
    case 'purple':
      return styles.quotaSummaryMetricPurple;
    case 'orange':
      return styles.quotaSummaryMetricOrange;
    default:
      return '';
  }
};

const MetricCell = ({ icon, tone, label, value, valueTitle }: MetricCellProps): JSX.Element => {
  const tooltipId = useId();
  const hasValueTooltip = valueTitle !== undefined && valueTitle !== value;

  return (
    <div className={`${styles.quotaSummaryMetric} ${metricCardClass(tone)}`}>
      <div className={styles.quotaSummaryMetricHeader} data-account-quota-metric-header="true">
        <span className={metricIconClass(tone)} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.quotaSummaryMetricLabel}>{label}</span>
      </div>
      <span className={styles.quotaSummaryValueWrap} data-account-quota-metric-value="true">
        <strong
          className={styles.quotaSummaryValue}
          tabIndex={hasValueTooltip ? 0 : undefined}
          aria-describedby={hasValueTooltip ? tooltipId : undefined}
        >
          {value}
        </strong>
        {hasValueTooltip ? (
          <span id={tooltipId} className={styles.quotaSummaryValueTooltip} role="tooltip">
            <span className={styles.quotaSummaryValueTooltipLabel}>{label}</span>
            <span className={styles.quotaSummaryValueTooltipValue}>{valueTitle}</span>
          </span>
        ) : null}
      </span>
    </div>
  );
};

interface AccountQuotaTabProps {
  row: AccountRow;
  detailView: AccountDetailViewModel;
  windowUsageLoading: boolean;
  windowUsageError: string;
  refreshing: boolean;
  onRefresh: () => void;
  canReset: boolean;
  onReset: () => void;
}

export function AccountQuotaTab({
  detailView,
  windowUsageLoading,
  windowUsageError,
}: AccountQuotaTabProps) {
  const { t, i18n } = useTranslation();
  const history = detailView.history;
  const allWindows = detailView.quota.windows;
  const standardWindows = allWindows.filter(
    (window) => isIntervalQuotaWindow(window) && !isModelScopedQuotaWindow(window)
  );
  const modelWindows = allWindows.filter(
    (window) => isIntervalQuotaWindow(window) && isModelScopedQuotaWindow(window)
  );
  const otherQuotaItems = allWindows.filter((window) => !isIntervalQuotaWindow(window));

  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const formatMoney = (value: number) => `$${value.toFixed(2)}`;
  const formatTime = (value: number | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(value)
      : '-';

  const hasResetEvidence =
    detailView.quota.resetCreditsAvailableCount !== null ||
    detailView.quota.resetCreditExpiries.length > 0;
  const hasCooldown = detailView.quota.cooldown !== null;
  const hasQuotaFields = detailView.quota.fields.length > 0;
  const hasQuotaDiagnostics = detailView.quota.diagnostics.length > 0;
  const hasQuotaEvidence = hasQuotaFields || hasResetEvidence || hasCooldown || hasQuotaDiagnostics;

  return (
    <div className={styles.quotaTab} data-account-quota-tab="true">
      <section className={styles.quotaSummaryPanel} data-account-quota-usage-summary="true">
        <div className={styles.quotaSummaryHeading}>
          <h3>{t('accounts.detail_total_usage', { defaultValue: '凭证总体用量' })}</h3>
          <div className={styles.quotaSummaryMeta}>
            <span>{t('accounts.detail_usage_time_range', { defaultValue: '统计时间范围' })}</span>
            <strong>
              {history
                ? `${formatTime(history.firstSeenMs)} — ${formatTime(history.lastSeenMs)}`
                : t('accounts.detail_usage_time_empty', { defaultValue: '暂无使用时间范围' })}
            </strong>
          </div>
        </div>
        <div className={styles.quotaSummaryMetrics} data-account-quota-metrics="true">
          <MetricCell
            icon={<IconChartLine size={20} />}
            tone="blue"
            label={t('accounts.detail_total_requests')}
            value={history ? formatCompactNumber(history.totalRequests) : '-'}
            valueTitle={history ? formatNumber(history.totalRequests) : undefined}
          />
          <MetricCell
            icon={<IconBinary size={20} />}
            tone="green"
            label={t('accounts.detail_total_tokens')}
            value={history ? formatCompactNumber(history.totalTokens) : '-'}
            valueTitle={history ? formatNumber(history.totalTokens) : undefined}
          />
          <MetricCell
            icon={<IconDollarSign size={20} />}
            tone="purple"
            label={t('accounts.detail_total_cost')}
            value={history ? formatMoney(history.totalCost) : '-'}
          />
          <MetricCell
            icon={<IconCheck size={20} />}
            tone="orange"
            label={t('accounts.detail_success_rate')}
            value={
              history?.successRate !== null && history?.successRate !== undefined
                ? `${history.successRate.toFixed(2)}%`
                : '-'
            }
          />
        </div>
      </section>

      {windowUsageLoading ? (
        <div className={styles.quotaTabStatus} role="status">
          <LoadingSpinner size={16} />
          <span>{t('common.loading')}</span>
        </div>
      ) : null}
      {windowUsageError ? <div className={styles.errorBox}>{windowUsageError}</div> : null}

      {standardWindows.length > 0 || allWindows.length === 0 ? (
        <section className={styles.quotaSection} data-quota-window-group="standard">
          <div className={styles.quotaSectionHeading}>
            <h3>{t('accounts.detail_quota_standard_title', { defaultValue: '标准额度' })}</h3>
            <span>
              {t('accounts.detail_quota_standard_desc', {
                defaultValue: '按时间窗口统计并滚动更新',
              })}
            </span>
          </div>
          {standardWindows.length > 0 ? (
            <div className={styles.quotaCardList}>
              {standardWindows.map((window) => (
                <QuotaWindowCard
                  key={window.key}
                  window={window}
                  mode="standard"
                  locale={i18n.language}
                />
              ))}
            </div>
          ) : (
            <p className={styles.quotaEmpty}>{t('accounts.detail_no_quota_windows')}</p>
          )}
        </section>
      ) : null}

      {modelWindows.length > 0 ? (
        <section className={styles.quotaSection} data-quota-window-group="model">
          <div className={styles.quotaSectionHeading}>
            <h3>{t('accounts.detail_quota_model_title', { defaultValue: '模型额度' })}</h3>
            <span>
              {t('accounts.detail_quota_model_desc', {
                defaultValue: '按模型及窗口统计的配额信息',
              })}
            </span>
          </div>
          <div className={styles.quotaCardList}>
            {modelWindows.map((window) => (
              <QuotaWindowCard
                key={window.key}
                window={window}
                mode="model"
                locale={i18n.language}
              />
            ))}
          </div>
        </section>
      ) : null}

      {otherQuotaItems.length > 0 ? (
        <section className={styles.quotaSection} data-quota-window-group="other">
          <div className={styles.quotaSectionHeading}>
            <h3>{t('accounts.detail_quota_other_items', { defaultValue: '其他额度项' })}</h3>
            <span>
              {t('accounts.detail_quota_other_items_desc', {
                defaultValue: '金额、产品或缺少完整窗口边界的额度不生成区间统计。',
              })}
            </span>
          </div>
          <div className={styles.quotaCardList}>
            {otherQuotaItems.map((window) => (
              <QuotaWindowCard
                key={window.key}
                window={window}
                mode="other"
                locale={i18n.language}
              />
            ))}
          </div>
        </section>
      ) : null}

      {hasQuotaEvidence ? (
        <section className={styles.quotaAdditionalSection} data-account-quota-evidence="true">
          <div className={styles.quotaSectionHeading}>
            <h3>{t('accounts.detail_quota_evidence_title', { defaultValue: '额度状态与证据' })}</h3>
          </div>
          <div
            className={`${styles.quotaEvidenceGrid} ${
              hasQuotaFields && (hasResetEvidence || hasCooldown || hasQuotaDiagnostics)
                ? ''
                : styles.quotaEvidenceGridSingle
            }`}
          >
            {hasQuotaFields ? (
              <section className={styles.quotaEvidencePanel} data-quota-evidence-panel="fields">
                <h4>
                  <span className={styles.quotaPanelIcon} aria-hidden="true">
                    <IconSidebarQuota size={14} />
                  </span>
                  {t('accounts.detail_quota_source_label', { defaultValue: '额度来源' })}
                </h4>
                <AccountDetailFieldList fields={detailView.quota.fields} />
              </section>
            ) : null}
            {hasResetEvidence || hasCooldown ? (
              <section className={styles.quotaEvidencePanel} data-quota-evidence-panel="reset">
                <h4>
                  <span className={styles.quotaPanelIcon} aria-hidden="true">
                    <IconRefreshCw size={14} />
                  </span>
                  {t('accounts.detail_quota_reset_records', { defaultValue: '重置记录' })}
                </h4>
                {detailView.quota.resetCreditsAvailableCount !== null ? (
                  <div className={styles.quotaEvidenceSummary}>
                    <span>{t('codex_quota.reset_credits_label')}</span>
                    <strong>{detailView.quota.resetCreditsAvailableCount}</strong>
                  </div>
                ) : null}
                {detailView.quota.resetCreditExpiries.length > 0 ? (
                  <div className={styles.detailCandidateList}>
                    {detailView.quota.resetCreditExpiries.map((item, index) => (
                      <div
                        key={`${item.id}:${item.expiresAtMs}`}
                        className={styles.detailCandidateItem}
                      >
                        <span>
                          {t('codex_quota.reset_credit_expiry_item', { index: index + 1 })}
                        </span>
                        <strong data-quota-reset-credit-expiry={item.id}>
                          {formatQuotaResetTimestamp(item.expiresAtMs, i18n.language)}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : null}
                {detailView.quota.cooldown ? (
                  <div className={styles.detailInlineNote}>
                    <span>{t('accounts.detail_cooldown')}</span>
                    <strong data-quota-cooldown-recover-at="true">
                      {formatQuotaResetTimestamp(
                        detailView.quota.cooldown.recoverAtMs,
                        i18n.language
                      )}
                    </strong>
                  </div>
                ) : null}
              </section>
            ) : null}
            {hasQuotaDiagnostics ? (
              <section
                className={styles.quotaEvidencePanel}
                data-quota-evidence-panel="diagnostics"
              >
                <h4>
                  <span className={styles.quotaPanelIcon} aria-hidden="true">
                    <IconScrollText size={14} />
                  </span>
                  {t('accounts.detail_quota_diagnostics')}
                </h4>
                <AccountDetailFieldList fields={detailView.quota.diagnostics} />
              </section>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
