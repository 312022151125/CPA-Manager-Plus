import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconRefreshCw, IconSettings } from '@/components/ui/icons';
import type {
  AccountDetailField,
  AccountDetailViewModel,
} from '@/features/accounts/model/accountDetailViewModel';
import type { AccountRow } from '@/features/accounts/model/accountRows';
import type { AccountCredentialSafeSummaryState } from '@/features/accounts/hooks/useAccountCredentialSafeSummary';
import { getProviderLabel } from '@/features/accounts/model/accountsPagePresentation';
import { formatFileSize } from '@/utils/format';
import { AccountHealthBadge } from '../AccountHealthBadge';
import { AccountDetailFieldList } from './AccountDetailFieldList';
import styles from '@/features/accounts/AccountsPage.module.scss';

interface AccountCredentialTabProps extends AccountCredentialSafeSummaryState {
  row: AccountRow;
  detailView: AccountDetailViewModel;
  disableControls: boolean;
  onEdit: () => void;
  onReload: () => void;
}

export function AccountCredentialTab({
  row,
  detailView,
  disableControls,
  loading,
  error,
  summary,
  onEdit,
  onReload,
}: AccountCredentialTabProps) {
  const { t } = useTranslation();
  const lifecycleFields: AccountDetailField[] = [];
  const routingFields: AccountDetailField[] = [];

  if (summary?.accountId) {
    lifecycleFields.push({
      key: 'accountId',
      labelKey: 'accounts.detail_account_id',
      value: summary.accountId,
    });
  }
  if (summary?.fileSize !== null && summary?.fileSize !== undefined) {
    lifecycleFields.push({
      key: 'fileSize',
      labelKey: 'auth_files.file_size',
      value: formatFileSize(summary.fileSize),
    });
  }
  if (summary?.createdAtMs) {
    lifecycleFields.push({
      key: 'createdAtMs',
      labelKey: 'accounts.detail_created_at',
      value: summary.createdAtMs,
      valueKind: 'timestamp',
    });
  }
  if (summary?.modifiedAtMs) {
    lifecycleFields.push({
      key: 'modifiedAtMs',
      labelKey: 'auth_files.file_modified',
      value: summary.modifiedAtMs,
      valueKind: 'timestamp',
    });
  }
  if (summary?.expiresAtMs) {
    lifecycleFields.push({
      key: 'expiresAtMs',
      labelKey: 'accounts.detail_expires_at',
      value: summary.expiresAtMs,
      valueKind: 'timestamp',
    });
  }
  if (summary?.lastRefreshAtMs) {
    lifecycleFields.push({
      key: 'lastRefreshAtMs',
      labelKey: 'accounts.detail_last_refresh_at',
      value: summary.lastRefreshAtMs,
      valueKind: 'timestamp',
    });
  }
  if (summary?.statusMessage) {
    lifecycleFields.push({
      key: 'statusMessage',
      labelKey: 'accounts.detail_status_message',
      value: summary.statusMessage,
    });
  }
  if (summary) {
    routingFields.push(
      {
        key: 'prefix',
        labelKey: 'auth_files.prefix_label',
        value: summary.prefix || '-',
      },
      {
        key: 'proxy',
        labelKey: 'auth_files.proxy_url_label',
        value: summary.proxyConfigured
          ? summary.maskedProxyUrl || t('accounts.detail_configured')
          : t('common.not_set'),
      },
      {
        key: 'websockets',
        labelKey: 'auth_files.websockets_label',
        value: summary.websockets === null ? '-' : summary.websockets ? 'common.yes' : 'common.no',
        valueKind: summary.websockets === null ? 'text' : 'i18n',
      },
      {
        key: 'usingApi',
        labelKey: 'auth_files.using_api_label',
        value: summary.usingApi === null ? '-' : summary.usingApi ? 'common.yes' : 'common.no',
        valueKind: summary.usingApi === null ? 'text' : 'i18n',
      },
      {
        key: 'headers',
        labelKey: 'auth_files.headers_label',
        value:
          summary.headerNames.length > 0 ? summary.headerNames.join(', ') : t('common.not_set'),
      },
      {
        key: 'note',
        labelKey: 'auth_files.note_label',
        value: summary.note || t('common.not_set'),
      }
    );
  }

  return (
    <div className={styles.drawerDetailStack}>
      <div className={styles.detailScopeNotice} role="note">
        <strong>{t('accounts.detail_file_scope_title')}</strong>
        <span>{t('accounts.detail_file_scope_desc')}</span>
      </div>
      <section className={styles.drawerSection}>
        <div className={styles.sectionHeaderInline}>
          <div>
            <h3>{t('accounts.detail_auth_file')}</h3>
            <p>{t('accounts.detail_auth_safe_hint')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onEdit}
            disabled={disableControls || row.runtimeOnly}
          >
            <IconSettings size={14} />
            {t('common.edit')}
          </Button>
        </div>
        <div className={styles.authChips}>
          <AccountHealthBadge
            severity={row.disabled ? 'disabled' : 'ok'}
            label={
              row.disabled
                ? t('accounts.detail_auth_status_disabled')
                : t('accounts.detail_auth_status_enabled')
            }
            size="sm"
          />
          <span className={styles.authChip}>{getProviderLabel(row.provider, t)}</span>
          <span className={styles.authChip}>{row.planType || '-'}</span>
        </div>
        <AccountDetailFieldList fields={detailView.auth.fields} />
      </section>
      <section className={styles.drawerSection}>
        <div className={styles.sectionHeaderInline}>
          <div>
            <h3>{t('accounts.detail_credential_lifecycle')}</h3>
            <p>{t('accounts.detail_account_scope_desc')}</p>
          </div>
          {!row.runtimeOnly ? (
            <Button variant="secondary" size="sm" onClick={onReload} loading={loading}>
              {!loading ? <IconRefreshCw size={14} /> : null}
              {t('common.refresh')}
            </Button>
          ) : null}
        </div>
        {error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : loading ? (
          <div className={styles.inlineLoading}>
            <LoadingSpinner size={16} />
            <span>{t('common.loading')}</span>
          </div>
        ) : lifecycleFields.length > 0 ? (
          <AccountDetailFieldList fields={lifecycleFields} />
        ) : (
          <p>{t('accounts.detail_no_safe_credential_fields')}</p>
        )}
      </section>
      <section className={styles.drawerSection}>
        <h3>{t('accounts.detail_routing_config')}</h3>
        {routingFields.length > 0 ? (
          <AccountDetailFieldList fields={routingFields} />
        ) : (
          <p>{t('accounts.detail_no_safe_credential_fields')}</p>
        )}
      </section>
    </div>
  );
}
