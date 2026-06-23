import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconInfo, IconX } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import {
  getTypeLabel,
  normalizeProviderKey,
  type AuthFileModelItem,
} from '@/features/authFiles/constants';
import { generateId } from '@/utils/helpers';
import styles from './OAuthEditorModals.module.scss';

type OAuthModelMappingFormEntry = OAuthModelAliasEntry & { id: string };

type OAuthEditorBaseProps = {
  open: boolean;
  provider?: string;
  files: AuthFileItem[];
  excluded: Record<string, string[]>;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  disabled?: boolean;
  unsupported?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const OAUTH_PROVIDER_PRESETS = [
  'vertex',
  'aistudio',
  'antigravity',
  'claude',
  'codex',
  'qwen',
  'kimi',
  'iflow',
];

const OAUTH_PROVIDER_EXCLUDES = new Set(['all', 'unknown', 'empty']);

const buildEmptyMappingEntry = (): OAuthModelMappingFormEntry => ({
  id: generateId(),
  name: '',
  alias: '',
  fork: true,
});

const normalizeMappingEntries = (
  entries?: OAuthModelAliasEntry[]
): OAuthModelMappingFormEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [buildEmptyMappingEntry()];
  }
  return entries.map((entry) => ({
    id: generateId(),
    name: entry.name ?? '',
    alias: entry.alias ?? '',
    fork: Boolean(entry.fork),
  }));
};

const findProviderEntries = <T,>(
  record: Record<string, T>,
  providerKey: string
): T | undefined => {
  const entry = Object.entries(record).find(
    ([provider]) => normalizeProviderKey(provider) === providerKey
  );
  return entry?.[1];
};

const readErrorStatus = (err: unknown) =>
  typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status?: unknown }).status
    : undefined;

function useProviderOptions({
  files,
  excluded,
  modelAlias,
}: {
  files: AuthFileItem[];
  excluded: Record<string, string[]>;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
}) {
  return useMemo(() => {
    const extraProviders = new Set<string>();
    Object.keys(excluded).forEach((value) => extraProviders.add(value));
    Object.keys(modelAlias).forEach((value) => extraProviders.add(value));
    files.forEach((file) => {
      if (typeof file.type === 'string') {
        extraProviders.add(file.type);
      }
      if (typeof file.provider === 'string') {
        extraProviders.add(file.provider);
      }
    });

    const normalizedExtras = Array.from(extraProviders)
      .map((value) => value.trim())
      .filter((value) => value && !OAUTH_PROVIDER_EXCLUDES.has(value.toLowerCase()));

    const baseSet = new Set(OAUTH_PROVIDER_PRESETS.map((value) => value.toLowerCase()));
    const extraList = normalizedExtras
      .filter((value) => !baseSet.has(value.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    return [...OAUTH_PROVIDER_PRESETS, ...extraList];
  }, [excluded, files, modelAlias]);
}

function useProviderModels({
  open,
  providerKey,
  disabled,
  unsupported,
}: {
  open: boolean;
  providerKey: string;
  disabled?: boolean;
  unsupported?: boolean;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [models, setModels] = useState<AuthFileModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'unsupported' | null>(null);
  const active = open && Boolean(providerKey) && !unsupported && !disabled;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const loadModels = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await authFilesApi.getModelDefinitions(providerKey);
        if (cancelled) return;
        setModels(items);
      } catch (err: unknown) {
        if (cancelled) return;
        if (readErrorStatus(err) === 404) {
          setModels([]);
          setError('unsupported');
          return;
        }
        const message = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.load_failed')}: ${message}`, 'error');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [active, providerKey, showNotification, t]);

  return {
    models: active ? models : [],
    loading: active ? loading : false,
    error: active ? error : null,
  };
}

export function OAuthExcludedEditorModal({
  open,
  provider: initialProvider = '',
  files,
  excluded,
  modelAlias,
  disabled = false,
  unsupported = false,
  onClose,
  onSaved,
}: OAuthEditorBaseProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [provider, setProvider] = useState(initialProvider);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProvider(initialProvider);
  }, [initialProvider, open]);

  const providerOptions = useProviderOptions({ files, excluded, modelAlias });
  const resolvedProviderKey = useMemo(() => normalizeProviderKey(provider), [provider]);
  const existingModels = useMemo(
    () => (resolvedProviderKey ? (findProviderEntries(excluded, resolvedProviderKey) ?? []) : []),
    [excluded, resolvedProviderKey]
  );
  const isEditing = resolvedProviderKey ? existingModels.length > 0 : false;
  const { models, loading, error } = useProviderModels({
    open,
    providerKey: resolvedProviderKey,
    disabled,
    unsupported,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedModels(new Set(existingModels));
  }, [existingModels, open]);

  const toggleModel = useCallback((modelId: string, checked: boolean) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const providerKey = normalizeProviderKey(provider);
    if (!providerKey) {
      showNotification(t('oauth_excluded.provider_required'), 'error');
      return;
    }

    setSaving(true);
    try {
      const modelIds = [...selectedModels];
      if (modelIds.length > 0) {
        await authFilesApi.saveOauthExcludedModels(providerKey, modelIds);
      } else {
        await authFilesApi.deleteOauthExcludedEntry(providerKey);
      }
      await onSaved();
      showNotification(t('oauth_excluded.save_success'), 'success');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.save_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [onClose, onSaved, provider, selectedModels, showNotification, t]);

  const canSave = !disabled && !saving && !unsupported;
  const title = isEditing
    ? t('oauth_excluded.edit_title', { provider: provider.trim() || resolvedProviderKey })
    : t('oauth_excluded.add_title');

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      title={title}
      width={820}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!canSave}>
            {t('oauth_excluded.save')}
          </Button>
        </>
      }
    >
      {unsupported ? (
        <EmptyState
          title={t('oauth_excluded.upgrade_required_title')}
          description={t('oauth_excluded.upgrade_required_desc')}
        />
      ) : (
        <div className={styles.editorBody}>
          <section className={styles.settingsBlock}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsHeaderTitle}>
                <IconInfo size={16} />
                <span>{t('oauth_excluded.title')}</span>
              </div>
              <div className={styles.settingsHeaderHint}>{t('oauth_excluded.description')}</div>
            </div>
            <div className={styles.settingsSection}>
              <div className={styles.settingsRow}>
                <div className={styles.settingsInfo}>
                  <div className={styles.settingsLabel}>{t('oauth_excluded.provider_label')}</div>
                  <div className={styles.settingsDesc}>{t('oauth_excluded.provider_hint')}</div>
                </div>
                <div className={styles.settingsControl}>
                  <AutocompleteInput
                    id="accounts-oauth-excluded-provider"
                    placeholder={t('oauth_excluded.provider_placeholder')}
                    value={provider}
                    onChange={setProvider}
                    options={providerOptions}
                    disabled={disabled || saving}
                    wrapperStyle={{ marginBottom: 0 }}
                  />
                </div>
              </div>
              <div className={styles.tagList}>
                {providerOptions.map((option) => {
                  const active = normalizeProviderKey(provider) === normalizeProviderKey(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.tag} ${active ? styles.tagActive : ''}`}
                      onClick={() => setProvider(option)}
                      disabled={disabled || saving}
                    >
                      {getTypeLabel(t, option)}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={styles.settingsBlock}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsHeaderTitle}>{t('oauth_excluded.models_label')}</div>
              {resolvedProviderKey ? (
                <div className={styles.modelsHint}>
                  {loading ? (
                    <>
                      <LoadingSpinner size={14} />
                      <span>{t('oauth_excluded.models_loading')}</span>
                    </>
                  ) : error === 'unsupported' ? (
                    <span>{t('oauth_excluded.models_unsupported')}</span>
                  ) : models.length > 0 ? (
                    <span>{t('oauth_excluded.models_loaded', { count: models.length })}</span>
                  ) : (
                    <span>{t('oauth_excluded.no_models_available')}</span>
                  )}
                </div>
              ) : null}
            </div>
            {loading ? (
              <div className={styles.loadingModels}>
                <LoadingSpinner size={16} />
                <span>{t('common.loading')}</span>
              </div>
            ) : models.length > 0 ? (
              <div className={styles.modelList}>
                {models.map((model) => (
                  <SelectionCheckbox
                    key={model.id}
                    checked={selectedModels.has(model.id)}
                    disabled={disabled || saving}
                    onChange={(value) => toggleModel(model.id, value)}
                    className={styles.modelItem}
                    labelClassName={styles.modelText}
                    label={
                      <>
                        <span className={styles.modelId}>{model.id}</span>
                        {model.display_name && model.display_name !== model.id ? (
                          <span className={styles.modelDisplayName}>{model.display_name}</span>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </div>
            ) : resolvedProviderKey ? (
              <div className={styles.emptyModels}>
                {error === 'unsupported'
                  ? t('oauth_excluded.models_unsupported')
                  : t('oauth_excluded.no_models_available')}
              </div>
            ) : (
              <div className={styles.emptyModels}>{t('oauth_excluded.provider_required')}</div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

export function OAuthModelAliasEditorModal({
  open,
  provider: initialProvider = '',
  files,
  excluded,
  modelAlias,
  disabled = false,
  unsupported = false,
  onClose,
  onSaved,
}: OAuthEditorBaseProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [provider, setProvider] = useState(initialProvider);
  const [mappings, setMappings] = useState<OAuthModelMappingFormEntry[]>([
    buildEmptyMappingEntry(),
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProvider(initialProvider);
  }, [initialProvider, open]);

  const providerOptions = useProviderOptions({ files, excluded, modelAlias });
  const resolvedProviderKey = useMemo(() => normalizeProviderKey(provider), [provider]);
  const existingMappings = useMemo(
    () =>
      resolvedProviderKey
        ? (findProviderEntries(modelAlias, resolvedProviderKey) ?? [])
        : [],
    [modelAlias, resolvedProviderKey]
  );
  const { models, loading, error } = useProviderModels({
    open,
    providerKey: resolvedProviderKey,
    disabled,
    unsupported,
  });

  useEffect(() => {
    if (!open) return;
    setMappings(normalizeMappingEntries(existingMappings));
  }, [existingMappings, open]);

  const headerHint = useMemo(() => {
    if (!provider.trim()) {
      return t('oauth_model_alias.provider_hint');
    }
    if (loading) {
      return t('oauth_model_alias.model_source_loading');
    }
    if (error === 'unsupported') {
      return t('oauth_model_alias.model_source_unsupported');
    }
    return t('oauth_model_alias.model_source_loaded', { count: models.length });
  }, [error, loading, models.length, provider, t]);

  const updateMappingEntry = useCallback(
    (index: number, field: keyof OAuthModelAliasEntry, value: string | boolean) => {
      setMappings((prev) =>
        prev.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry))
      );
    },
    []
  );

  const addMappingEntry = useCallback(() => {
    setMappings((prev) => [...prev, buildEmptyMappingEntry()]);
  }, []);

  const removeMappingEntry = useCallback((index: number) => {
    setMappings((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length ? next : [buildEmptyMappingEntry()];
    });
  }, []);

  const handleSave = useCallback(async () => {
    const providerKey = normalizeProviderKey(provider);
    if (!providerKey) {
      showNotification(t('oauth_model_alias.provider_required'), 'error');
      return;
    }

    const seen = new Set<string>();
    const normalized = mappings
      .map((entry) => {
        const name = String(entry.name ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const key = `${name.toLowerCase()}::${alias.toLowerCase()}::${entry.fork ? '1' : '0'}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return entry.fork ? { name, alias, fork: true } : { name, alias };
      })
      .filter(Boolean) as OAuthModelAliasEntry[];

    setSaving(true);
    try {
      if (normalized.length > 0) {
        await authFilesApi.saveOauthModelAlias(providerKey, normalized);
      } else {
        await authFilesApi.deleteOauthModelAlias(providerKey);
      }
      await onSaved();
      showNotification(t('oauth_model_alias.save_success'), 'success');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_model_alias.save_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [mappings, onClose, onSaved, provider, showNotification, t]);

  const canSave = !disabled && !saving && !unsupported;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      title={t('oauth_model_alias.add_title')}
      width={940}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!canSave}>
            {t('oauth_model_alias.save')}
          </Button>
        </>
      }
    >
      {unsupported ? (
        <EmptyState
          title={t('oauth_model_alias.upgrade_required_title')}
          description={t('oauth_model_alias.upgrade_required_desc')}
        />
      ) : (
        <div className={styles.editorBody}>
          <section className={styles.settingsBlock}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsHeaderTitle}>
                <IconInfo size={16} />
                <span>{t('oauth_model_alias.title')}</span>
              </div>
              <div className={styles.settingsHeaderHint}>{headerHint}</div>
            </div>
            <div className={styles.settingsSection}>
              <div className={styles.settingsRow}>
                <div className={styles.settingsInfo}>
                  <div className={styles.settingsLabel}>
                    {t('oauth_model_alias.provider_label')}
                  </div>
                  <div className={styles.settingsDesc}>{t('oauth_model_alias.provider_hint')}</div>
                </div>
                <div className={styles.settingsControl}>
                  <AutocompleteInput
                    id="accounts-oauth-model-alias-provider"
                    placeholder={t('oauth_model_alias.provider_placeholder')}
                    value={provider}
                    onChange={setProvider}
                    options={providerOptions}
                    disabled={disabled || saving}
                    wrapperStyle={{ marginBottom: 0 }}
                  />
                </div>
              </div>
              <div className={styles.tagList}>
                {providerOptions.map((option) => {
                  const active = normalizeProviderKey(provider) === normalizeProviderKey(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.tag} ${active ? styles.tagActive : ''}`}
                      onClick={() => setProvider(option)}
                      disabled={disabled || saving}
                    >
                      {getTypeLabel(t, option)}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={styles.settingsBlock}>
            <div className={styles.mappingsHeader}>
              <div className={styles.mappingsTitle}>{t('oauth_model_alias.alias_label')}</div>
              <Button
                variant="secondary"
                size="sm"
                onClick={addMappingEntry}
                disabled={disabled || saving || unsupported}
              >
                {t('oauth_model_alias.add_alias')}
              </Button>
            </div>
            <div className={styles.mappingsBody}>
              {mappings.map((entry, index) => (
                <div key={entry.id} className={styles.mappingRow}>
                  <AutocompleteInput
                    wrapperStyle={{ flex: 1, marginBottom: 0 }}
                    placeholder={t('oauth_model_alias.alias_name_placeholder')}
                    value={entry.name}
                    onChange={(value) => updateMappingEntry(index, 'name', value)}
                    disabled={disabled || saving}
                    options={models.map((model) => ({
                      value: model.id,
                      label:
                        model.display_name && model.display_name !== model.id
                          ? model.display_name
                          : undefined,
                    }))}
                  />
                  <span className={styles.mappingSeparator}>-&gt;</span>
                  <input
                    className={`input ${styles.mappingAliasInput}`}
                    placeholder={t('oauth_model_alias.alias_placeholder')}
                    value={entry.alias}
                    onChange={(event) => updateMappingEntry(index, 'alias', event.target.value)}
                    disabled={disabled || saving}
                  />
                  <div className={styles.mappingFork}>
                    <ToggleSwitch
                      label={t('oauth_model_alias.alias_fork_label')}
                      labelPosition="left"
                      checked={Boolean(entry.fork)}
                      onChange={(value) => updateMappingEntry(index, 'fork', value)}
                      disabled={disabled || saving}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMappingEntry(index)}
                    disabled={disabled || saving || mappings.length <= 1}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <IconX size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
