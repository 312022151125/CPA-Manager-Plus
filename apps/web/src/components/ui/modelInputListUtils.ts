import { MODEL_THINKING_CLEAR_MARKER, type ModelAlias } from '@/types';

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

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const getThinkingLevels = (thinking?: Record<string, unknown>): unknown[] =>
  Array.isArray(thinking?.levels) ? thinking.levels : [];

export const getUnknownThinkingLevels = (levels: readonly unknown[]) =>
  levels.filter(
    (level) => typeof level !== 'string' || !KNOWN_THINKING_LEVELS.includes(level as ThinkingLevel)
  );

export const buildThinkingWithLevels = (
  thinking: Record<string, unknown> | undefined,
  selectedLevels: readonly ThinkingLevel[],
  unknownLevels: readonly unknown[]
) => ({
  ...(isRecord(thinking) ? thinking : {}),
  levels: [
    ...KNOWN_THINKING_LEVELS.filter((level) => selectedLevels.includes(level)),
    ...unknownLevels,
  ],
});

export const removeThinkingLevels = (thinking?: Record<string, unknown>) => {
  const nextThinking = isRecord(thinking) ? { ...thinking } : {};
  delete nextThinking.levels;
  return Object.keys(nextThinking).length > 0 ? nextThinking : undefined;
};

export const hasInvalidThinkingLevels = (entries: readonly ModelEntry[]) =>
  entries.some(
    (entry) =>
      entry.name.trim() &&
      Array.isArray(entry.thinking?.levels) &&
      entry.thinking.levels.length === 0
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
  [MODEL_THINKING_CLEAR_MARKER]?: true;
}

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((model) => ({
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
    ...(model[MODEL_THINKING_CLEAR_MARKER] ? { [MODEL_THINKING_CLEAR_MARKER]: true as const } : {}),
  }));
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
      if (entry[MODEL_THINKING_CLEAR_MARKER]) {
        model[MODEL_THINKING_CLEAR_MARKER] = true;
      }
      return model;
    });
};
