import { useTranslation } from 'react-i18next';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import type { CredentialHealthInspectionMode } from '@/features/monitoring/model/credentialInspectionSnapshot';
import styles from '../CodexInspectionPage.module.scss';

interface CredentialHealthModeControlProps {
  activeMode: CredentialHealthInspectionMode;
  checking: boolean;
  serverAvailable: boolean;
  onChange: (mode: CredentialHealthInspectionMode) => void;
}

export function CredentialHealthModeControl({
  activeMode,
  checking,
  serverAvailable,
  onChange,
}: CredentialHealthModeControlProps) {
  const { t } = useTranslation();
  const items: ReadonlyArray<SegmentedTabItem<CredentialHealthInspectionMode>> = [
    {
      id: 'local',
      label: t('monitoring.codex_inspection_mode_local'),
    },
    {
      id: 'server',
      label: t('monitoring.codex_inspection_mode_server'),
      disabled: checking || !serverAvailable,
      title:
        !checking && !serverAvailable
          ? t('monitoring.codex_inspection_mode_server_unavailable')
          : undefined,
    },
  ];

  return (
    <div className={styles.credentialHealthModeControl}>
      <SegmentedTabs
        items={items}
        activeTab={activeMode}
        ariaLabel={t('monitoring.codex_inspection_mode_label')}
        onChange={onChange}
        idBase="credential-health-mode"
        className={styles.credentialHealthModeTabs}
        equalWidth
        responsiveFullWidth={false}
      />
    </div>
  );
}
