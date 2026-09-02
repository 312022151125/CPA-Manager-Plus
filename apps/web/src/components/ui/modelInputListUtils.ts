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

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const MODEL_THINKING_EMPTY_CONTAINER_MARKER = Symbol('model-thinking-empty-container');

type EmptyThinkingContainerCarrier = {
  [MODEL_THINKING_EMPTY_CONTAINER_MARKER]?: true;
};

export const hasExplicitEmptyThinkingContainer = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  if ((value as EmptyThinkingContainerCarrier)[MODEL_THINKING_EMPTY_CONTAINER_MARKER] === true) {
    return true;
  }
  return (
    'thinking' in value &&
    isRecord((value as { thinking?: unknown }).thinking) &&
    Object.keys((value as { thinking: Record<string, unknown> }).thinking).length === 0
  );
};

const markExplicitEmptyThinkingContainer = <T extends object>(value: T): T => {
  Object.defineProperty(value, MODEL_THINKING_EMPTY_CONTAINER_MARKER, {
    configurable: true,
    enumerable: false,
    value: true,
  });
  return value;
};

const areUnknownThinkingLevelsEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'string' && typeof right === 'string') {
    return left.trim() === right.trim();
  }
  return Object.is(left, right);
};

export const normalizeThinkingLevelsPreservingOrder = (levels: readonly unknown[]): unknown[] => {
  const normalized: unknown[] = [];
  const seenKnownLevels = new Set<ThinkingLevel>();
  const seenUnknownLevels: unknown[] = [];

  levels.forEach((level) => {
    if (typeof level === 'string') {
      if (!level.trim()) return;
      const knownLevel = normalizeKnownThinkingLevel(level);
      if (knownLevel) {
        if (seenKnownLevels.has(knownLevel)) return;
        seenKnownLevels.add(knownLevel);
        normalized.push(knownLevel);
        return;
      }
    }

    if (seenUnknownLevels.some((seenLevel) => areUnknownThinkingLevelsEqual(seenLevel, level))) {
      return;
    }
    seenUnknownLevels.push(level);
    normalized.push(level);
  });

  return normalized;
};

export const getKnownThinkingLevels = (levels: readonly unknown[]): ThinkingLevel[] => {
  return normalizeThinkingLevelsPreservingOrder(levels).filter((level): level is ThinkingLevel =>
    Boolean(normalizeKnownThinkingLevel(level))
  );
};

export const getThinkingLevels = (thinking?: Record<string, unknown>): unknown[] =>
  Array.isArray(thinking?.levels) ? thinking.levels : [];

export const getEffectiveThinkingLevels = (levels: readonly unknown[]): unknown[] =>
  normalizeThinkingLevelsPreservingOrder(levels);

export const hasEffectiveThinkingLevels = (levels: readonly unknown[]): boolean =>
  getEffectiveThinkingLevels(levels).length > 0;

export const getUnknownThinkingLevels = (levels: readonly unknown[]) =>
  normalizeThinkingLevelsPreservingOrder(levels).filter(
    (level) => !normalizeKnownThinkingLevel(level)
  );

export const buildThinkingWithLevels = (
  thinking: Record<string, unknown> | undefined,
  selectedLevels: readonly ThinkingLevel[],
  unknownLevels: readonly unknown[],
  currentLevels: readonly unknown[] = [...selectedLevels, ...unknownLevels]
) => {
  const selectedKnownLevels = getKnownThinkingLevels(selectedLevels);
  const selectedKnownSet = new Set(selectedKnownLevels);
  const normalizedCurrentLevels = normalizeThinkingLevelsPreservingOrder([
    ...currentLevels,
    ...unknownLevels,
  ]);
  const nextLevels = normalizedCurrentLevels.filter((level) => {
    const knownLevel = normalizeKnownThinkingLevel(level);
    return !knownLevel || selectedKnownSet.has(knownLevel);
  });
  const presentKnownLevels = new Set(
    nextLevels
      .map((level) => normalizeKnownThinkingLevel(level))
      .filter((level): level is ThinkingLevel => Boolean(level))
  );
  selectedKnownLevels.forEach((level) => {
    if (!presentKnownLevels.has(level)) {
      nextLevels.push(level);
    }
  });

  return {
    ...(isRecord(thinking) ? thinking : {}),
    levels: nextLevels,
  };
};

export const removeThinkingLevels = (
  thinking?: Record<string, unknown>,
  preserveEmptyContainer = false
) => {
  const nextThinking = isRecord(thinking) ? { ...thinking } : {};
  delete nextThinking.levels;
  if (Object.keys(nextThinking).length > 0) return nextThinking;
  return preserveEmptyContainer ? {} : undefined;
};

export const cloneModelEntry = (entry: ModelEntry, patch: Partial<ModelEntry> = {}): ModelEntry => {
  const nextEntry = { ...entry, ...patch };
  if (hasModelThinkingLevelsClearMarker(entry)) {
    markModelThinkingLevelsForClear(nextEntry);
  }
  if (hasExplicitEmptyThinkingContainer(entry)) {
    markExplicitEmptyThinkingContainer(nextEntry);
  }
  return nextEntry;
};

export const hasInvalidThinkingLevelEntry = (
  entry: Pick<ModelEntry, 'name' | 'thinking'>
): boolean =>
  Boolean(entry.name.trim()) &&
  Array.isArray(entry.thinking?.levels) &&
  !hasEffectiveThinkingLevels(getThinkingLevels(entry.thinking));

export const hasInvalidThinkingLevels = (entries: readonly ModelEntry[]) =>
  entries.some(hasInvalidThinkingLevelEntry);

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
    if (isRecord(model.thinking) && Object.keys(model.thinking).length === 0) {
      markExplicitEmptyThinkingContainer(entry);
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
      if (isRecord(entry.thinking)) {
        const thinking = { ...entry.thinking };
        if (Array.isArray(thinking.levels)) {
          thinking.levels = normalizeThinkingLevelsPreservingOrder(thinking.levels);
        }
        model.thinking = thinking;
      } else if (hasExplicitEmptyThinkingContainer(entry)) {
        model.thinking = {};
      }
      if (hasModelThinkingLevelsClearMarker(entry)) {
        markModelThinkingLevelsForClear(model);
      }
      return model;
    });
};
