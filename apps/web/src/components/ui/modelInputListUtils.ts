import {
  MODEL_THINKING_LEVELS_CLEAR_MARKER,
  hasModelThinkingLevelsClearMarker,
  markModelThinkingLevelsForClear,
  type ModelAlias,
} from '@/types';

export const KNOWN_THINKING_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'auto',
] as const;

export type ThinkingLevel = (typeof KNOWN_THINKING_LEVELS)[number];

export const normalizeKnownThinkingLevel = (value: unknown): ThinkingLevel | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return KNOWN_THINKING_LEVELS.includes(normalized as ThinkingLevel)
    ? (normalized as ThinkingLevel)
    : undefined;
};

export const getKnownThinkingLevels = (levels: readonly unknown[]): ThinkingLevel[] => {
  const knownLevels = new Set<ThinkingLevel>();
  levels.forEach((level) => {
    const normalized = normalizeKnownThinkingLevel(level);
    if (normalized) knownLevels.add(normalized);
  });
  return KNOWN_THINKING_LEVELS.filter((level) => knownLevels.has(level));
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const getThinkingLevels = (thinking?: Record<string, unknown>): unknown[] =>
  Array.isArray(thinking?.levels) ? thinking.levels : [];

export const getUnknownThinkingLevels = (levels: readonly unknown[]) =>
  levels.filter((level) => !normalizeKnownThinkingLevel(level));

export const buildThinkingWithLevels = (
  thinking: Record<string, unknown> | undefined,
  selectedLevels: readonly ThinkingLevel[],
  unknownLevels: readonly unknown[]
) => {
  const normalizedSelectedLevels = getKnownThinkingLevels(selectedLevels);
  return {
    ...(isRecord(thinking) ? thinking : {}),
    levels: [...normalizedSelectedLevels, ...unknownLevels],
  };
};

export const removeThinkingLevels = (thinking?: Record<string, unknown>) => {
  const nextThinking = isRecord(thinking) ? { ...thinking } : {};
  delete nextThinking.levels;
  return Object.keys(nextThinking).length > 0 ? nextThinking : undefined;
};

export const cloneModelEntry = (entry: ModelEntry, patch: Partial<ModelEntry> = {}): ModelEntry => {
  const nextEntry = { ...entry, ...patch };
  if (hasModelThinkingLevelsClearMarker(entry)) {
    markModelThinkingLevelsForClear(nextEntry);
  }
  return nextEntry;
};

export const hasInvalidThinkingLevels = (entries: readonly ModelEntry[]) =>
  entries.some(
    (entry) =>
      Boolean(entry.name.trim()) &&
      Array.isArray(entry.thinking?.levels) &&
      getThinkingLevels(entry.thinking).length === 0
  );

export interface ModelEntry {
  name: string;
  alias: string;
  priority?: number;
  testModel?: string;
  image?: boolean;
  forceMapping?: boolean;
  inputModalities?: string[];
  outputModalities?: string[];
  inputModalitiesDraft?: string;
  outputModalitiesDraft?: string;
  thinking?: Record<string, unknown>;
  [MODEL_THINKING_LEVELS_CLEAR_MARKER]?: true;
}

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((model) => {
    const entry: ModelEntry = {
      name: model.name || '',
      alias: model.alias || '',
      priority: model.priority,
      testModel: model.testModel,
      image: model.image,
      forceMapping: model.forceMapping,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      inputModalitiesDraft: model.inputModalities?.join(', '),
      outputModalitiesDraft: model.outputModalities?.join(', '),
      thinking: model.thinking,
    };
    if (hasModelThinkingLevelsClearMarker(model)) {
      markModelThinkingLevelsForClear(entry);
    }
    return entry;
  });
};

export const entriesToModels = (entries: ModelEntry[]): ModelAlias[] => {
  return entries
    .filter((entry) => entry.name.trim())
    .map((entry) => {
      const model: ModelAlias = { name: entry.name.trim() };
      const alias = entry.alias.trim();
      if (alias && alias !== model.name) {
        model.alias = alias;
      }
      if (entry.priority !== undefined) {
        model.priority = entry.priority;
      }
      if (entry.testModel) {
        model.testModel = entry.testModel;
      }
      if (entry.image !== undefined) {
        model.image = entry.image;
      }
      if (entry.forceMapping !== undefined) {
        model.forceMapping = entry.forceMapping;
      }
      if (entry.inputModalities !== undefined) {
        model.inputModalities = [...entry.inputModalities];
      }
      if (entry.outputModalities !== undefined) {
        model.outputModalities = [...entry.outputModalities];
      }
      if (entry.thinking && typeof entry.thinking === 'object') {
        model.thinking = entry.thinking;
      }
      if (hasModelThinkingLevelsClearMarker(entry)) {
        markModelThinkingLevelsForClear(model);
      }
      return model;
    });
};
