import { describe, expect, it } from 'vitest';
import { entriesToModels, getUnknownThinkingLevels, modelsToEntries } from './modelInputListUtils';

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
});
