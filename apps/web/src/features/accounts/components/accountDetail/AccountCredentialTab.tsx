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
import { formatFileSize } from '@/utils/format';
import { AccountDetailFieldList } from './AccountDetailFieldList';
import styles from '@/features/accounts/AccountsPage.module.scss';

interface AccountCredentialTabProps
  extends Omit<AccountCredentialSafeSummaryState, 'credentialKey'> {
  row: AccountRow;
  detailView: AccountDetailViewModel;
  healthStatusClass: string;
  disableControls: boolean;
  onEdit: () => void;
  onReload: () => void;
}

export function AccountCredentialTab({
  row,
  detailView,
  healthStatusClass,
  disableControls,
  loading,
  error,
  summary,
  onEdit,
  onReload,
}: AccountCredentialTabProps) {
  const { t } = useTranslation();
  const identityFields = [...detailView.auth.fields];
  const lifecycleFields: AccountDetailField[] = [];
  const advancedFileFields: AccountDetailField[] = [];
  const routingFields: AccountDetailField[] = [];

  if (summary?.accountId) {
    const accountIdField: AccountDetailField = {
      key: 'accountId',
      labelKey: 'accounts.detail_account_id',
      value: summary.accountId,
    };
    const sourceIndex = identityFields.findIndex((field) => field.key === 'runtime');
    identityFields.splice(
      sourceIndex >= 0 ? sourceIndex : identityFields.length,
      0,
      accountIdField
    );
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
  if (summary?.modifiedAtMs) {
    lifecycleFields.push({
      key: 'modifiedAtMs',
      labelKey: 'auth_files.file_modified',
      value: summary.modifiedAtMs,
      valueKind: 'timestamp',
    });
  }

  if (summary?.createdAtMs) {
    advancedFileFields.push({
      key: 'createdAtMs',
      labelKey: 'accounts.detail_created_at',
      value: summary.createdAtMs,
      valueKind: 'timestamp',
    });
  }
  if (summary?.fileSize !== null && summary?.fileSize !== undefined) {
    advancedFileFields.push({
      key: 'fileSize',
      labelKey: 'auth_files.file_size',
      value: formatFileSize(summary.fileSize),
    });
  }
  if (summary?.statusMessage) {
    advancedFileFields.push({
      key: 'statusMessage',
      labelKey: 'accounts.detail_status_message',
      value: summary.statusMessage,
    });
  }

  const priority = summary?.priority ?? row.priority;
  if (priority !== null && priority !== undefined) {
    routingFields.push({
      key: 'priority',
      labelKey: 'accounts.col_priority',
      value: priority,
      valueKind: 'number',
    });
  }

  if (summary) {
    if (summary.prefix) {
      routingFields.push({
        key: 'prefix',
        labelKey: 'auth_files.prefix_label',
        value: summary.prefix,
      });
    }
    if (summary.proxyConfigured) {
      routingFields.push({
        key: 'proxy',
        labelKey: 'auth_files.proxy_url_label',
        value: summary.maskedProxyUrl || t('accounts.detail_configured'),
      });
    }
    if (summary.websockets !== null) {
      routingFields.push({
        key: 'websockets',
        labelKey: 'auth_files.websockets_label',
        value: summary.websockets ? 'common.yes' : 'common.no',
        valueKind: 'i18n',
      });
    }
    if (summary.usingApi !== null) {
      routingFields.push({
        key: 'usingApi',
        labelKey: 'auth_files.using_api_label',
        value: summary.usingApi ? 'common.yes' : 'common.no',
        valueKind: 'i18n',
      });
    }
    if (summary.headerNames.length > 0) {
      routingFields.push({
        key: 'headers',
        labelKey: 'auth_files.headers_label',
        value: summary.headerNames.join(', '),
      });
    }
    if (summary.note) {
      routingFields.push({
        key: 'note',
        labelKey: 'auth_files.note_label',
        value: summary.note,
      });
    }
  }

  const routingState = row.runtimeOnly
    ? 'runtime'
    : loading
      ? 'loading'
      : error
        ? 'error'
        : summary
          ? routingFields.length > 0
            ? 'configured'
            : 'default'
          : 'unavailable';

  return (
    <div className={styles.drawerDetailStack}>
      {!row.runtimeOnly ? (
        <div className={styles.detailScopeNotice} role="note">
          <strong>{t('accounts.detail_file_scope_title')}</strong>
          <span>{t('accounts.detail_file_scope_desc')}</span>
        </div>
      ) : null}

      <section
        className={`${styles.drawerSection} ${styles.credentialIdentitySection}`}
        data-credential-section="identity"
      >
        <div className={styles.sectionHeaderInline}>
          <h3>{t('accounts.detail_auth_file')}</h3>
          {!row.runtimeOnly ? (
            <Button variant="secondary" size="sm" onClick={onReload} loading={loading}>
              {!loading ? <IconRefreshCw size={14} /> : null}
              {t('accounts.detail_reload_file')}
            </Button>
          ) : null}
        </div>

        <div
          className={styles.credentialStatusSummary}
          data-credential-health={detailView.health.status}
        >
          <div className={styles.credentialStatusHeader}>
            <span className={styles.credentialStatusLabel}>
              {t('accounts.detail_current_availability')}
            </span>
            <span className={`${styles.badge} ${healthStatusClass}`}>
              {t(detailView.health.labelKey)}
            </span>
          </div>
          <p className={styles.credentialStatusReason}>
            {t(detailView.health.reasonKey, detailView.health.reasonParams)}
          </p>
          <div className={styles.credentialEnablementRow}>
            <span>{t('accounts.detail_enablement_state')}</span>
            <strong data-credential-enablement={row.disabled ? 'disabled' : 'enabled'}>
              {row.disabled
                ? t('accounts.detail_auth_status_disabled')
                : t('accounts.detail_auth_status_enabled')}
            </strong>
          </div>
        </div>

        <div className={styles.credentialIdentityFields}>
          <AccountDetailFieldList fields={identityFields} />
        </div>
      </section>

      <section className={styles.drawerSection} data-credential-section="lifecycle">
        <h3>{t('accounts.detail_credential_lifecycle')}</h3>
        {error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : loading ? (
          <div className={styles.inlineLoading}>
            <LoadingSpinner size={16} />
            <span>{t('common.loading')}</span>
          </div>
        ) : lifecycleFields.length > 0 ? (
          <AccountDetailFieldList fields={lifecycleFields} />
        ) : advancedFileFields.length === 0 ? (
          <p>{t('accounts.detail_no_safe_credential_fields')}</p>
        ) : null}

        {!error && !loading && advancedFileFields.length > 0 ? (
          <details className={styles.credentialAdvancedDetails}>
            <summary>{t('accounts.detail_more_file_info')}</summary>
            <AccountDetailFieldList fields={advancedFileFields} />
          </details>
        ) : null}
      </section>

      <section
        className={styles.drawerSection}
        data-credential-section="routing"
        data-credential-routing={routingState}
      >
        <div className={styles.sectionHeaderInline}>
          <h3>{t('accounts.detail_routing_config')}</h3>
          {!row.runtimeOnly ? (
            <Button variant="secondary" size="sm" onClick={onEdit} disabled={disableControls}>
              <IconSettings size={14} />
              {t('accounts.detail_configure_routing')}
            </Button>
          ) : null}
        </div>

        {row.runtimeOnly ? (
          <div className={styles.credentialDefaultState}>
            <strong>{t('accounts.detail_runtime_config_unavailable')}</strong>
          </div>
        ) : loading ? (
          <div className={styles.inlineLoading}>
            <LoadingSpinner size={16} />
            <span>{t('common.loading')}</span>
          </div>
        ) : error ? (
          <div className={styles.credentialDefaultState}>
            <strong>{t('accounts.detail_file_data_unavailable')}</strong>
          </div>
        ) : summary && routingFields.length > 0 ? (
          <AccountDetailFieldList fields={routingFields} />
        ) : summary ? (
          <div className={styles.credentialDefaultState}>
            <strong>{t('accounts.detail_default_routing_title')}</strong>
            <p>{t('accounts.detail_default_routing_desc')}</p>
          </div>
        ) : (
          <p>{t('accounts.detail_no_safe_credential_fields')}</p>
        )}
      </section>
    </div>
  );
}
