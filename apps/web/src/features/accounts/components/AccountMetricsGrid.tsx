import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconBan,
  IconCircleHelp,
  IconKey,
  IconPercentCircle,
  IconShieldCheck,
  IconTriangleAlert,
} from '@/components/ui/icons';
import type { AccountMetrics } from '@/features/accounts/model/accountRows';
import styles from '../AccountsPage.module.scss';

type AccountMetricTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'neutral';

interface AccountMetricsGridProps {
  metrics: AccountMetrics;
}

export function AccountMetricsGrid({ metrics }: AccountMetricsGridProps) {
  const { t } = useTranslation();
  const cards = [
    {
      key: 'total',
      label: t('accounts.metric_total'),
      value: metrics.total,
      meta: t('accounts.metric_total_meta'),
      icon: <IconKey size={24} />,
      tone: 'blue' as const,
    },
    {
      key: 'available',
      label: t('accounts.metric_available'),
      value: metrics.available,
      meta: t('accounts.metric_available_meta'),
      icon: <IconShieldCheck size={24} />,
      tone: 'green' as const,
    },
    {
      key: 'attention',
      label: t('accounts.metric_attention'),
      value: metrics.needsAttention,
      meta: t('accounts.metric_attention_meta'),
      icon: <IconTriangleAlert size={24} />,
      tone: 'red' as const,
    },
    {
      key: 'quota-risk',
      label: t('accounts.metric_quota_risk'),
      value: metrics.quotaRisk,
      meta: t('accounts.metric_quota_risk_meta'),
      icon: <IconPercentCircle size={24} />,
      tone: 'amber' as const,
    },
    {
      key: 'disabled',
      label: t('accounts.metric_disabled'),
      value: metrics.disabled,
      meta: t('accounts.metric_disabled_meta'),
      icon: <IconBan size={24} />,
      tone: 'neutral' as const,
    },
    {
      key: 'unconfirmed',
      label: t('accounts.metric_unconfirmed'),
      value: metrics.unconfirmed,
      meta: t('accounts.metric_unconfirmed_meta'),
      icon: <IconCircleHelp size={24} />,
      tone: 'violet' as const,
    },
  ] satisfies Array<{
    key: string;
    label: string;
    value: number;
    meta: string;
    icon: ReactNode;
    tone: AccountMetricTone;
  }>;

  return (
    <section className={styles.metricsGrid} aria-label={t('accounts.metrics_label')}>
      {cards.map((card) => (
        <section
          key={card.key}
          className={`${styles.metricCard} ${styles[`metricCard${card.tone}`]}`}
          data-metric-key={card.key}
        >
          <div className={`${styles.metricIcon} ${styles[`metricIcon${card.tone}`]}`}>
            {card.icon}
          </div>
          <div className={styles.metricBody}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.meta}</small>
          </div>
        </section>
      ))}
    </section>
  );
}
