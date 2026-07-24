import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconSend, IconTriangleAlert } from '@/components/ui/icons';
import { FailureDetailsTooltip } from '@/features/monitoring/components/FailureDetailsTooltip';
import { buildAccountLatestRequestFailureDetails } from '@/features/accounts/model/accountLatestRequest';
import type { MonitoringAccountLatestRequest } from '@/services/api/usageService';
import { RelativeTime } from './RelativeTime';
import styles from './AccountLatestRequest.module.scss';

type AccountLatestRequestProps = {
  latestRequest?: MonitoringAccountLatestRequest | null;
  loading?: boolean;
  unavailable?: boolean;
  locale?: string;
  className?: string;
  onCopy: (text: string) => void;
};

export function AccountLatestRequest({
  latestRequest,
  loading = false,
  unavailable = false,
  locale,
  className,
  onCopy,
}: AccountLatestRequestProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const timestamp = latestRequest?.timestamp_ms;
  const failureDetails = latestRequest
    ? buildAccountLatestRequestFailureDetails(latestRequest, t)
    : null;
  const status = (() => {
    if (latestRequest?.failed) {
      const label = failureDetails?.statusText ?? t('monitoring.result_failed');
      const badge = (
        <span className={`${styles.status} ${styles.statusFailed}`}>
          <IconTriangleAlert size={13} />
          <span>{label}</span>
        </span>
      );
      if (!failureDetails) return badge;
      return (
        <FailureDetailsTooltip
          ariaLabel={failureDetails.ariaLabel}
          statusText={failureDetails.statusText}
          detailLines={failureDetails.detailLines}
          copyText={failureDetails.copyText}
          copyLabel={t('accounts.latest_request_copy_details')}
          onCopy={onCopy}
        >
          {badge}
        </FailureDetailsTooltip>
      );
    }
    if (latestRequest) {
      return (
        <span className={`${styles.status} ${styles.statusSuccess}`}>
          <IconCheck size={13} />
          <span>{t('monitoring.result_success')}</span>
        </span>
      );
    }
    if (loading)
      return (
        <span className={`${styles.status} ${styles.statusNeutral}`}>
          {t('accounts.latest_request_loading')}
        </span>
      );
    if (unavailable)
      return (
        <span className={`${styles.status} ${styles.statusNeutral}`}>
          {t('accounts.latest_request_unavailable')}
        </span>
      );
    return (
      <span className={`${styles.status} ${styles.statusNeutral}`}>
        {t('accounts.latest_request_empty')}
      </span>
    );
  })();

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <span
        className={styles.time}
        title={t('accounts.latest_request_time_title')}
        aria-label={t('accounts.latest_request_time_title')}
      >
        <span className={styles.timeIcon} aria-hidden="true">
          <IconSend size={13} />
        </span>
        <span className={styles.timeValue}>
          <RelativeTime
            timestamp={timestamp}
            mode="both"
            locale={locale ?? i18n.language}
            fallback="-"
          />
        </span>
      </span>
      {status}
    </div>
  );
}
