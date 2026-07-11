import type { TFunction } from 'i18next';
import { Input } from '@/components/ui/Input';
import type { GrokInspectionAutoActionMode } from '@/features/monitoring/grokInspection';
import { CodexInspectionAutoActionEditor } from '@/features/monitoring/components/CodexInspectionAutoActionEditor';
import type {
  GrokInspectionConfigFieldErrors,
  GrokInspectionSettingsDraft,
  GrokInspectionSettingsDraftField,
} from '@/features/monitoring/model/grokInspectionPresentation';
import styles from '../CodexInspectionPage.module.scss';

type GrokInspectionConfigFieldsProps = {
  draft: GrokInspectionSettingsDraft;
  errors: GrokInspectionConfigFieldErrors;
  t: TFunction;
  onFieldChange: (field: GrokInspectionSettingsDraftField, value: string) => void;
  onAutoActionModeChange: (mode: GrokInspectionAutoActionMode) => void;
};

export function GrokInspectionConfigFields({
  draft,
  errors,
  t,
  onFieldChange,
  onAutoActionModeChange,
}: GrokInspectionConfigFieldsProps) {
  return (
    <>
      <section className={styles.configSection}>
        <header className={styles.configSectionHeader}>
          <span>{t('monitoring.grok_inspection_settings_group_strategy')}</span>
        </header>
        <div className={styles.serverConfigGrid}>
          <div className={styles.serverField}>
            <Input
              id="usedPercentThreshold"
              label={t('monitoring.grok_inspection_settings_used_percent_threshold_label')}
              hint={t('monitoring.grok_inspection_settings_threshold_hint')}
              error={errors.usedPercentThreshold}
              type="number"
              min={0}
              max={100}
              value={draft.usedPercentThreshold}
              onChange={(event) => onFieldChange('usedPercentThreshold', event.target.value)}
            />
          </div>
          <div className={styles.serverField}>
            <Input
              id="sampleSize"
              label={t('monitoring.grok_inspection_settings_sample_size_label')}
              hint={t('monitoring.grok_inspection_settings_sample_size_hint')}
              error={errors.sampleSize}
              type="number"
              min={0}
              value={draft.sampleSize}
              onChange={(event) => onFieldChange('sampleSize', event.target.value)}
            />
          </div>
          <div className={styles.serverField}>
            <Input
              id="workers"
              label={t('monitoring.grok_inspection_settings_workers_label')}
              error={errors.workers}
              type="number"
              min={1}
              value={draft.workers}
              onChange={(event) => onFieldChange('workers', event.target.value)}
            />
          </div>
          <div className={styles.serverField}>
            <Input
              id="retries"
              label={t('monitoring.grok_inspection_settings_retries_label')}
              error={errors.retries}
              type="number"
              min={0}
              value={draft.retries}
              onChange={(event) => onFieldChange('retries', event.target.value)}
            />
          </div>
          <div className={styles.serverField}>
            <Input
              id="timeout"
              label={t('monitoring.grok_inspection_settings_timeout_label')}
              hint={t('monitoring.grok_inspection_settings_timeout_hint')}
              error={errors.timeout}
              type="number"
              min={1}
              value={draft.timeout}
              onChange={(event) => onFieldChange('timeout', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className={styles.configSection}>
        <header className={styles.configSectionHeader}>
          <span>{t('monitoring.grok_inspection_settings_group_auto')}</span>
        </header>
        <div className={styles.autoActionField} id="autoActionMode">
          <CodexInspectionAutoActionEditor
            value={draft.autoActionMode}
            t={t}
            onChange={onAutoActionModeChange}
          />
        </div>
      </section>
    </>
  );
}
