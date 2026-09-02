import { describe, expect, it } from 'vitest';
import {
  buildThinkingWithLevels,
  entriesToModels,
  getKnownThinkingLevels,
  getUnknownThinkingLevels,
  modelsToEntries,
  normalizeKnownThinkingLevel,
} from './modelInputListUtils';
import {
  MODEL_THINKING_LEVELS_CLEAR_MARKER,
  hasModelThinkingLevelsClearMarker,
  markModelThinkingLevelsForClear,
  stripModelThinkingLevelsClearMarker,
} from '@/types';

describe('modelInputListUtils', () => {
  it('preserves explicit empty modality arrays', () => {
    expect(
      entriesToModels([
        {
          name: 'image-model',
          alias: '',
          inputModalities: [],
          outputModalities: [],
        },
      ])
    ).toEqual([
      {
        name: 'image-model',
        inputModalities: [],
        outputModalities: [],
      },
    ]);
  });

  it('keeps untouched modality fields undefined', () => {
    expect(entriesToModels([{ name: 'text-model', alias: '' }])).toEqual([{ name: 'text-model' }]);
  });

  it('round-trips configured thinking levels through model entries', () => {
    const entries = modelsToEntries([
      { name: 'thinking-model', thinking: { levels: ['low', 'high'] } },
    ]);

    expect(entries[0]?.thinking).toEqual({ levels: ['low', 'high'] });
    expect(entriesToModels(entries)).toEqual([
      { name: 'thinking-model', thinking: { levels: ['low', 'high'] } },
    ]);
  });

  it('preserves unknown thinking fields during round-trip', () => {
    const thinking = {
      levels: ['high'],
      'future-option': { enabled: true },
    };
    const entries = modelsToEntries([{ name: 'future-model', thinking }]);

    expect(entriesToModels(entries)).toEqual([{ name: 'future-model', thinking }]);
  });

  it('keeps unknown thinking levels in their original order', () => {
    expect(getUnknownThinkingLevels(['high', 'ultra', 'experimental'])).toEqual([
      'ultra',
      'experimental',
    ]);
  });

  it('normalizes known thinking levels while preserving unknown values', () => {
    const levels = ['HIGH', ' medium ', 'Low', 'ultra'];

    expect(getKnownThinkingLevels(levels)).toEqual(['low', 'medium', 'high']);
    expect(getUnknownThinkingLevels(levels)).toEqual(['ultra']);
    expect(normalizeKnownThinkingLevel(' High ')).toBe('high');
    expect(normalizeKnownThinkingLevel('experimental')).toBeUndefined();
  });

  it('deduplicates equivalent known levels when rebuilding thinking levels', () => {
    const levels = ['high', 'HIGH', ' high ', 'ultra'];

    expect(
      buildThinkingWithLevels(
        undefined,
        getKnownThinkingLevels(levels),
        getUnknownThinkingLevels(levels)
      )
    ).toEqual({ levels: ['high', 'ultra'] });
  });

  it('clears known variants while retaining unknown levels', () => {
    const levels = ['HIGH', 'ultra'];

    expect(
      buildThinkingWithLevels({ futureOption: true }, [], getUnknownThinkingLevels(levels))
    ).toEqual({ futureOption: true, levels: ['ultra'] });
  });

  it('preserves the thinking-level clear marker through entry conversion', () => {
    const model = markModelThinkingLevelsForClear({
      name: 'default-model',
      thinking: { futureOption: true },
    });

    const entries = modelsToEntries([model]);
    const roundTripped = entriesToModels(entries)[0];

    expect(hasModelThinkingLevelsClearMarker(entries[0])).toBe(true);
    expect(hasModelThinkingLevelsClearMarker(roundTripped)).toBe(true);
    expect(Reflect.ownKeys(roundTripped ?? {})).toContain(MODEL_THINKING_LEVELS_CLEAR_MARKER);
    expect(
      Object.getOwnPropertyDescriptor(roundTripped ?? {}, MODEL_THINKING_LEVELS_CLEAR_MARKER)
        ?.enumerable
    ).toBe(false);
    expect(JSON.stringify(roundTripped)).not.toContain('model-thinking-levels-clear');
  });

  it('strips the clear marker into a committed model without mutating the source', () => {
    const model = markModelThinkingLevelsForClear({
      name: 'default-model',
      alias: 'default',
      thinking: { futureOption: { enabled: true } },
      futureModelOption: 123,
    });
    const committed = stripModelThinkingLevelsClearMarker(model);

    expect(hasModelThinkingLevelsClearMarker(model)).toBe(true);
    expect(hasModelThinkingLevelsClearMarker(committed)).toBe(false);
    expect(committed).toEqual({
      name: 'default-model',
      alias: 'default',
      thinking: model.thinking,
      futureModelOption: 123,
    });
    expect(committed.thinking).toBe(model.thinking);
  });
});
