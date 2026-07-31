import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import { AuthFileModelsContent } from '@/features/authFiles/components/AuthFileModelsModal';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import type { OAuthModelAliasEntry } from '@/types';
import styles from '@/features/accounts/AccountsPage.module.scss';

interface AccountModelsTabProps {
  fileName: string;
  fileType: string;
  runtimeOnly: boolean;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  aliases: Record<string, OAuthModelAliasEntry[]>;
  onRefresh: () => void;
  onManageRules: () => void;
  onCopyText: (value: string) => void;
}

export function AccountModelsTab({
  fileName,
  fileType,
  runtimeOnly,
  loading,
  error,
  models,
  excluded,
  aliases,
  onRefresh,
  onManageRules,
  onCopyText,
}: AccountModelsTabProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.drawerSection}>
      <div className={styles.sectionHeaderInline}>
        <div>
          <h3>{t('auth_files.models_button')}</h3>
          <p>{t('accounts.detail_models_summary', { count: models.length, file: fileName })}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={onManageRules}>
            {t('accounts.detail_manage_model_rules')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={runtimeOnly || loading}
            loading={loading}
          >
            {!loading ? <IconRefreshCw size={14} /> : null}
            {t('common.refresh')}
          </Button>
        </div>
      </div>
      <AuthFileModelsContent
        fileType={fileType}
        loading={loading}
        error={error}
        models={models}
        excluded={excluded}
        aliases={aliases}
        onCopyText={onCopyText}
      />
    </section>
  );
}
