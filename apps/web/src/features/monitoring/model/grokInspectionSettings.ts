import type {
  GrokInspectionAction,
  GrokInspectionAutoActionMode,
  GrokInspectionConfigurableSettings,
  GrokInspectionLogLevel,
  GrokInspectionStoredActionFilter,
} from '@/features/monitoring/grokInspection';
import { normalizeNumberValue } from '@/utils/quota';

export const GROK_INSPECTION_SETTINGS_STORAGE_KEY = 'cli-proxy-grok-inspection-settings-v1';

export const GROK_INSPECTION_AUTO_ACTION_MODES: readonly GrokInspectionAutoActionMode[] = [
  'none',
  'enable',
  'disable',
  'delete',
];

export const DEFAULT_GROK_INSPECTION_SETTINGS: GrokInspectionConfigurableSettings = {
  workers: 2,
  retries: 1,
  timeout: 30,
  usedPercentThreshold: 100,
  sampleSize: 0,
  autoActionMode: 'none',
  autoRecoverEnabled: false,
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const clampPositiveInteger = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value) || !value || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
};

const normalizeThreshold = (value: unknown) => {
  const normalized = normalizeNumberValue(value);
  if (normalized === null || !Number.isFinite(normalized) || normalized < 0) return NaN;
  if (normalized > 0 && normalized <= 1) {
    return normalized * 100;
  }
  return normalized;
};

export const readString = (value: unknown) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export const readBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

export const readNullableString = (value: unknown) => {
  const normalized = readString(value);
  return normalized || null;
};

export const readNullableNumber = (value: unknown) => {
  const normalized = normalizeNumberValue(value);
  return normalized === null || !Number.isFinite(normalized) ? null : normalized;
};

export const readNonNegativeInteger = (value: unknown, fallback: number) => {
  const normalized = normalizeNumberValue(value);
  if (normalized === null || !Number.isFinite(normalized) || normalized < 0) return fallback;
  return Math.floor(normalized);
};

const isAutoActionMode = (value: string): value is GrokInspectionAutoActionMode =>
  GROK_INSPECTION_AUTO_ACTION_MODES.includes(value as GrokInspectionAutoActionMode);

export const normalizeAutoActionMode = (value: unknown): GrokInspectionAutoActionMode => {
  const normalized = readString(value).toLowerCase();
  if (isAutoActionMode(normalized)) return normalized;
  return DEFAULT_GROK_INSPECTION_SETTINGS.autoActionMode;
};

export const normalizeInspectionAction = (
  value: unknown,
  fallback: GrokInspectionAction = 'keep'
): GrokInspectionAction => {
  const normalized = readString(value).toLowerCase();
  if (['keep', 'delete', 'disable', 'enable', 'reauth'].includes(normalized)) {
    return normalized as GrokInspectionAction;
  }
  return fallback;
};

export const normalizeStoredActionFilter = (
  value: unknown
): GrokInspectionStoredActionFilter => {
  const normalized = readString(value).toLowerCase();
  if (['all', 'delete', 'disable', 'enable', 'reauth', 'keep'].includes(normalized)) {
    return normalized as GrokInspectionStoredActionFilter;
  }
  return 'all';
};

export const normalizeLogLevel = (value: unknown): GrokInspectionLogLevel => {
  const normalized = readString(value).toLowerCase();
  if (['info', 'success', 'warning', 'error'].includes(normalized)) {
    return normalized as GrokInspectionLogLevel;
  }
  return 'info';
};

type GrokInspectionConfigurableSettingsInput = {
  workers?: unknown;
  retries?: unknown;
  timeout?: unknown;
  usedPercentThreshold?: unknown;
  sampleSize?: unknown;
  autoActionMode?: unknown;
  autoRecoverEnabled?: unknown;
};

export const normalizeConfigurableSettings = (
  input?: GrokInspectionConfigurableSettingsInput | null
): GrokInspectionConfigurableSettings => {
  const merged = {
    ...DEFAULT_GROK_INSPECTION_SETTINGS,
    ...(input ?? {}),
  };

  const threshold = normalizeThreshold(merged.usedPercentThreshold);
  const retriesValue = normalizeNumberValue(merged.retries);
  const sampleSizeValue = normalizeNumberValue(merged.sampleSize);
  const autoActionMode = normalizeAutoActionMode(merged.autoActionMode);
  // ponytail: no ownership model for Grok; legacy mode=enable implies recover on
  const autoRecoverEnabled =
    merged.autoRecoverEnabled === undefined
      ? autoActionMode === 'enable'
      : readBoolean(merged.autoRecoverEnabled, false);

  return {
    workers: clampPositiveInteger(
      normalizeNumberValue(merged.workers) ?? undefined,
      DEFAULT_GROK_INSPECTION_SETTINGS.workers
    ),
    retries:
      retriesValue === null
        ? DEFAULT_GROK_INSPECTION_SETTINGS.retries
        : Math.max(0, Math.floor(retriesValue)),
    timeout: clampPositiveInteger(
      normalizeNumberValue(merged.timeout) ?? undefined,
      DEFAULT_GROK_INSPECTION_SETTINGS.timeout
    ),
    usedPercentThreshold: Number.isFinite(threshold)
      ? Math.max(0, Math.min(100, threshold))
      : DEFAULT_GROK_INSPECTION_SETTINGS.usedPercentThreshold,
    sampleSize:
      sampleSizeValue === null
        ? DEFAULT_GROK_INSPECTION_SETTINGS.sampleSize
        : Math.max(0, Math.floor(sampleSizeValue)),
    autoActionMode,
    autoRecoverEnabled,
  };
};

export const loadGrokInspectionConfigurableSettings = (): GrokInspectionConfigurableSettings => {
  try {
    if (typeof localStorage === 'undefined') {
      return normalizeConfigurableSettings(null);
    }
    const raw = localStorage.getItem(GROK_INSPECTION_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return normalizeConfigurableSettings(null);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return normalizeConfigurableSettings(null);
    }
    return normalizeConfigurableSettings(parsed);
  } catch {
    return normalizeConfigurableSettings(null);
  }
};

export const saveGrokInspectionConfigurableSettings = (
  settings: Partial<GrokInspectionConfigurableSettings>
): GrokInspectionConfigurableSettings => {
  const normalized = normalizeConfigurableSettings(settings);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GROK_INSPECTION_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    console.warn('Failed to save Grok inspection settings');
  }

  return normalized;
};

export const clearGrokInspectionConfigurableSettings = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(GROK_INSPECTION_SETTINGS_STORAGE_KEY);
    }
  } catch {
    console.warn('Failed to clear Grok inspection settings');
  }
};
