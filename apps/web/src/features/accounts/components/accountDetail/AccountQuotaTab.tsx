import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconRefreshCw } from '@/components/ui/icons';
import type { AccountDetailViewModel } from '@/features/accounts/model/accountDetailViewModel';
import type { AccountRow } from '@/features/accounts/model/accountRows';
import { AccountHealthBadge, severityFromQuotaStatus } from '../AccountHealthBadge';
import { QuotaWindowCard } from '../QuotaWindowCard';
import { RelativeTime } from '../RelativeTime';
import { AccountDetailFieldList } from './AccountDetailFieldList';
import styles from '@/features/accounts/AccountsPage.module.scss';

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
  row,
  detailView,
  windowUsageLoading,
  windowUsageError,
  refreshing,
  onRefresh,
  canReset,
  onReset,
}: AccountQuotaTabProps) {
  const { t, i18n } = useTranslation();
  const statusField = detailView.quota.fields.find((field) => field.key === 'status');
  const statusValue = statusField ? String(statusField.value) : '';
  return (
    <div className={styles.drawerDetailStack}>
      <section className={styles.drawerSection}>
        <div className={styles.quotaSectionHeader}>
          <h3>{t('accounts.detail_quota_windows')}</h3>
          <div className={styles.headerActions}>
            <AccountHealthBadge
              severity={severityFromQuotaStatus(statusValue, Boolean(row.disabled))}
              label={statusValue ? t(statusValue, { defaultValue: statusValue }) : '-'}
              hint={t('accounts.detail_quota_health_hint', {
                defaultValue: '综合账号最近请求、配额与认证状态得出',
              })}
              size="md"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={row.disabled || row.runtimeOnly}
              loading={refreshing}
            >
              {!refreshing ? <IconRefreshCw size={14} /> : null}
              {t('accounts.refresh_quota')}
            </Button>
            {canReset ? (
              <Button variant="secondary" size="sm" onClick={onReset}>
                {t('codex_quota.reset_action_button')}
              </Button>
            ) : null}
          </div>
        </div>
        <AccountDetailFieldList fields={detailView.quota.fields} />
        {detailView.quota.resetCreditsAvailableCount !== null ? (
          <div className={styles.detailInlineNote}>
            <span>{t('codex_quota.reset_credits_label')}</span>
            <strong>{detailView.quota.resetCreditsAvailableCount}</strong>
          </div>
        ) : null}
        {detailView.quota.resetCreditExpiries.length > 0 ? (
          <div className={styles.detailCandidateList}>
            {detailView.quota.resetCreditExpiries.map((item, index) => (
              <div key={`${item.id}:${item.expiresAtMs}`} className={styles.detailCandidateItem}>
                <span>{t('codex_quota.reset_credit_expiry_item', { index: index + 1 })}</span>
                <strong>
                  <RelativeTime timestamp={item.expiresAtMs} mode="both" locale={i18n.language} />
                </strong>
              </div>
            ))}
          </div>
        ) : null}
        {detailView.quota.cooldown ? (
          <div className={styles.detailInlineNote}>
            <span>{t('accounts.detail_cooldown')}</span>
            <strong>
              <RelativeTime
                timestamp={detailView.quota.cooldown.recoverAtMs}
                mode="both"
                locale={i18n.language}
              />
            </strong>
          </div>
        ) : null}
      </section>
      <section className={styles.drawerSection}>
        <div className={styles.sectionHeaderInline}>
          <div>
            <h3>{t('accounts.detail_quota_window_usage')}</h3>
            <p>{t('accounts.detail_quota_window_usage_desc')}</p>
          </div>
          {windowUsageLoading ? (
            <div className={styles.inlineLoading}>
              <LoadingSpinner size={16} />
              <span>{t('common.loading')}</span>
            </div>
          ) : null}
        </div>
        {windowUsageError ? <div className={styles.errorBox}>{windowUsageError}</div> : null}
        {detailView.quota.windows.length === 0 ? (
          <p>{t('accounts.detail_no_quota_windows')}</p>
        ) : (
          <div className={styles.detailQuotaWindowList}>
            {detailView.quota.windows.map((window) => (
              <QuotaWindowCard key={window.key} window={window} locale={i18n.language} />
            ))}
          </div>
        )}
      </section>
      {detailView.quota.diagnostics.length > 0 ? (
        <section className={styles.drawerSection}>
          <h3>{t('accounts.detail_quota_diagnostics')}</h3>
          <AccountDetailFieldList fields={detailView.quota.diagnostics} />
        </section>
      ) : null}
    </div>
  );
}
