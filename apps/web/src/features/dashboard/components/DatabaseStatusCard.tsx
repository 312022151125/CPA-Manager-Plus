import { useTranslation } from 'react-i18next';
import type { UsageServiceStatus } from '@/services/api/usageService';
import { formatFileSize } from '@/utils/format';
import styles from './CollectorStatusCard.module.scss';

interface DatabaseStatusCardProps {
  status: UsageServiceStatus | null;
  loading: boolean;
  error: string;
}

const formatBytes = (value: number | undefined) =>
  Number.isFinite(value) && Number(value) >= 0 ? formatFileSize(Number(value)) : '-';

const formatCount = (value: number | undefined) =>
  Number.isFinite(value) ? Number(value).toLocaleString() : '-';

export function DatabaseStatusCard({ status, loading, error }: DatabaseStatusCardProps) {
  const { t, i18n } = useTranslation();
  const database = status?.database;
  const checkpoint = database?.checkpoint;
  const checkpointError = checkpoint?.error;
  const statusError = !database ? error : '';
  const databaseUnavailable = !loading && !database;
  const checkpointUnavailable = Boolean(database && !checkpoint);
  const checkpointBehind =
    Number.isFinite(checkpoint?.logFrames) &&
    Number.isFinite(checkpoint?.checkpointedFrames) &&
    Number(checkpoint?.checkpointedFrames) < Number(checkpoint?.logFrames);
  const checkpointPending = checkpoint?.mode?.trim().toLowerCase() === 'pending';
  const walOverLimit =
    Number.isFinite(database?.walBytes) &&
    Number.isFinite(database?.journalSizeLimitBytes) &&
    Number(database?.walBytes) > Number(database?.journalSizeLimitBytes);
  const checkpointWarning = Boolean(
    statusError ||
    databaseUnavailable ||
    checkpointUnavailable ||
    checkpointError ||
    Number(checkpoint?.busy) > 0 ||
    checkpointBehind ||
    checkpointPending ||
    walOverLimit
  );

  const checkpointMode = (() => {
    switch (checkpoint?.mode?.trim().toLowerCase()) {
      case 'passive':
        return t('dashboard.database_checkpoint_passive');
      case 'truncate':
        return t('dashboard.database_checkpoint_truncate');
      case 'pending':
        return t('dashboard.database_checkpoint_pending');
      case undefined:
      case '':
        return t('dashboard.database_checkpoint_unavailable');
      default:
        return checkpoint?.mode || t('dashboard.database_checkpoint_unavailable');
    }
  })();

  const checkpointProgress =
    Number.isFinite(checkpoint?.logFrames) && Number.isFinite(checkpoint?.checkpointedFrames)
      ? t('dashboard.database_checkpoint_frames', {
          checkpointed: formatCount(checkpoint?.checkpointedFrames),
          log: formatCount(checkpoint?.logFrames),
        })
      : '-';

  const checkpointTime = !checkpoint
    ? t('dashboard.database_checkpoint_unavailable')
    : checkpoint.executedAtMs && Number.isFinite(checkpoint.executedAtMs)
      ? t('dashboard.database_checkpoint_time', {
          time: new Date(checkpoint.executedAtMs).toLocaleString(i18n.language),
          duration: formatCount(checkpoint.durationMs),
        })
      : t('dashboard.database_checkpoint_pending');

  const rows = [
    { label: t('dashboard.database_file'), value: formatBytes(database?.databaseBytes) },
    { label: t('dashboard.database_wal_file'), value: formatBytes(database?.walBytes) },
    { label: t('dashboard.database_shm_file'), value: formatBytes(database?.shmBytes) },
    { label: t('dashboard.database_total_size'), value: formatBytes(database?.totalBytes) },
    {
      label: t('dashboard.database_journal_size_limit'),
      value: formatBytes(database?.journalSizeLimitBytes),
    },
    { label: t('dashboard.database_checkpoint_mode'), value: checkpointMode, isStatus: true },
    { label: t('dashboard.database_checkpoint_progress'), value: checkpointProgress },
    { label: t('dashboard.database_checkpoint_busy'), value: formatCount(checkpoint?.busy) },
    { label: t('dashboard.database_checkpoint_last_run'), value: checkpointTime },
  ];

  return (
    <section className={styles.dataCard}>
      <div className={styles.cardHeader}>
        <h3>{t('dashboard.database_status_title')}</h3>
      </div>
      <div className={styles.statusList}>
        {rows.map((row) => (
          <div key={row.label} className={styles.statusItem}>
            <span className={styles.label}>{row.label}</span>
            <span
              className={`${styles.value} ${
                row.isStatus
                  ? `${styles.statusText} ${checkpointWarning ? styles.statusWarn : styles.statusOk}`
                  : ''
              }`}
            >
              {loading && !database ? '...' : row.value}
              {row.isStatus && database ? <span className={styles.statusDot} /> : null}
            </span>
          </div>
        ))}
      </div>
      {checkpointError ? (
        <div className={styles.errorLine}>
          <span>{t('dashboard.database_checkpoint_error')}</span>
          <strong>{checkpointError}</strong>
        </div>
      ) : null}
      {statusError ? (
        <div className={styles.errorLine}>
          <span>{t('dashboard.database_status_error')}</span>
          <strong>{statusError}</strong>
        </div>
      ) : null}
    </section>
  );
}
