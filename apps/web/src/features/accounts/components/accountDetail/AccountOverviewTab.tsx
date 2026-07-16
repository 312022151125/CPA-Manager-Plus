import { useTranslation } from 'react-i18next';
import type { AccountDetailViewModel } from '@/features/accounts/model/accountDetailViewModel';
import type { AccountListHealthStatusKey } from '@/features/accounts/model/accountListPresentation';
import { formatPercent } from '@/features/accounts/model/accountsPagePresentation';
import { AccountDetailFieldValue } from './AccountDetailFieldList';
import styles from '@/features/accounts/AccountsPage.module.scss';

interface AccountOverviewTabProps {
  detailView: AccountDetailViewModel;
  quotaRemainingPercent: number | null;
  getHealthStatusClass: (status: AccountListHealthStatusKey) => string;
}

export function AccountOverviewTab({
  detailView,
  quotaRemainingPercent,
  getHealthStatusClass,
}: AccountOverviewTabProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.drawerDetailStack}>
      <section className={styles.drawerHero}>
        <div>
          <span
            className={`${styles.badge} ${getHealthStatusClass(detailView.health.status)}`}
            title={t(detailView.health.tooltipKey, detailView.health.tooltipParams)}
          >
            {t(detailView.health.labelKey)}
          </span>
          <h3>{t('accounts.detail_overview_title')}</h3>
          <p>{t(detailView.health.reasonKey, detailView.health.reasonParams)}</p>
        </div>
        <strong>{formatPercent(quotaRemainingPercent)}</strong>
      </section>
      <section className={styles.drawerSummary}>
        {detailView.overview.metrics.map((metric) => (
          <div key={metric.key}>
            <span>{t(metric.labelKey, { defaultValue: metric.labelKey })}</span>
            <strong>
              <AccountDetailFieldValue field={metric} />
            </strong>
          </div>
        ))}
      </section>
      <section className={styles.drawerSection}>
        <h3>{t('accounts.detail_status')}</h3>
        <p>{t(detailView.overview.statusDescriptionKey)}</p>
        <p className={styles.detailInlineMeta}>
          {t(`accounts.value_source_${detailView.value.source}`)}
        </p>
      </section>
    </div>
  );
}
