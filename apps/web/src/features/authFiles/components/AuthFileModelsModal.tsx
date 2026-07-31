import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { isModelExcluded } from '@/features/authFiles/constants';
import type { OAuthModelAliasEntry } from '@/types';
import styles from '@/features/authFiles/AuthFilesPage.module.scss';

export type AuthFileModelsModalProps = {
  open: boolean;
  fileName: string;
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  aliases?: Record<string, OAuthModelAliasEntry[]>;
  onClose: () => void;
  onCopyText: (text: string) => void;
};

export type AuthFileModelsContentProps = {
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  aliases?: Record<string, OAuthModelAliasEntry[]>;
  onCopyText: (text: string) => void;
};

export function AuthFileModelsContent(props: AuthFileModelsContentProps) {
  const { t } = useTranslation();
  const { fileType, loading, error, models, excluded, aliases = {}, onCopyText } = props;

  if (loading) {
    return (
      <div className={styles.hint}>
        {t('auth_files.models_loading', { defaultValue: '正在加载模型列表...' })}
      </div>
    );
  }

  if (error === 'unsupported') {
    return (
      <EmptyState
        title={t('auth_files.models_unsupported', { defaultValue: '当前版本不支持此功能' })}
        description={t('auth_files.models_unsupported_desc', {
          defaultValue: '请更新 CLI Proxy API 到最新版本后重试',
        })}
      />
    );
  }

  if (models.length === 0) {
    return (
      <EmptyState
        title={t('auth_files.models_empty', { defaultValue: '该凭证暂无可用模型' })}
        description={t('auth_files.models_empty_desc', {
          defaultValue:
            '该认证凭证可能尚未被服务器加载,或尚未在 AI 提供商里绑定任何模型。可前往 AI 提供商配置页检查绑定状态。',
        })}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              window.location.hash = '#/ai-providers';
            }}
          >
            {t('auth_files.models_empty_action', {
              defaultValue: '前往 AI 提供商配置',
            })}
          </Button>
        }
      />
    );
  }

  return (
    <div className={styles.modelsList}>
      {models.map((model) => {
        const excludedModel = isModelExcluded(model.id, fileType, excluded);
        const providerKey = fileType.trim().toLowerCase();
        const aliasEntry = (aliases[providerKey] ?? []).find(
          (entry) => entry.name.trim().toLowerCase() === model.id.trim().toLowerCase()
        );
        return (
          <div
            key={model.id}
            className={`${styles.modelItem} ${excludedModel ? styles.modelItemExcluded : ''}`}
            onClick={() => {
              onCopyText(model.id);
            }}
            title={
              excludedModel
                ? t('auth_files.models_excluded_hint', {
                    defaultValue: '此 OAuth 模型已被禁用',
                  })
                : t('common.copy', { defaultValue: '点击复制' })
            }
          >
            <span className={styles.modelId}>{model.id}</span>
            {model.display_name && model.display_name !== model.id && (
              <span className={styles.modelDisplayName}>{model.display_name}</span>
            )}
            {model.type && <span className={styles.modelType}>{model.type}</span>}
            {aliasEntry?.alias ? (
              <span className={styles.modelType}>→ {aliasEntry.alias}</span>
            ) : null}
            {excludedModel && (
              <span className={styles.modelExcludedBadge}>
                {t('auth_files.models_excluded_badge', { defaultValue: '已禁用' })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AuthFileModelsModal(props: AuthFileModelsModalProps) {
  const { t } = useTranslation();
  const {
    open,
    fileName,
    fileType,
    loading,
    error,
    models,
    excluded,
    aliases,
    onClose,
    onCopyText,
  } = props;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('auth_files.models_title', { defaultValue: '支持的模型' }) + ` - ${fileName}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <AuthFileModelsContent
        fileType={fileType}
        loading={loading}
        error={error}
        models={models}
        excluded={excluded}
        aliases={aliases}
        onCopyText={onCopyText}
      />
    </Modal>
  );
}
