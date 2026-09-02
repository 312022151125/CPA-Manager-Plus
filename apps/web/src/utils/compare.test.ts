import { describe, expect, it } from 'vitest';
import { areModelEntriesEqual } from './compare';

const baseline = [
  {
    name: 'model',
    alias: 'model',
    thinking: { levels: ['low', 'high'], future: { enabled: true } },
  },
];

describe('areModelEntriesEqual', () => {
  it('detects thinking level additions and removals', () => {
    expect(
      areModelEntriesEqual(baseline, [
        {
          ...baseline[0],
          thinking: { levels: ['low', 'high', 'max'], future: { enabled: true } },
        },
      ])
    ).toBe(false);

    expect(
      areModelEntriesEqual(baseline, [{ ...baseline[0], thinking: { future: { enabled: true } } }])
    ).toBe(false);
  });

  it('compares nested unknown thinking fields by value', () => {
    expect(
      areModelEntriesEqual(baseline, [
        {
          ...baseline[0],
          thinking: { future: { enabled: false }, levels: ['low', 'high'] },
        },
      ])
    ).toBe(false);

    expect(
      areModelEntriesEqual(baseline, [
        {
          ...baseline[0],
          thinking: { future: { enabled: true }, levels: ['low', 'high'] },
        },
      ])
    ).toBe(true);
  });

  it('detects a newly configured levels array', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'model', alias: '' }],
        [{ name: 'model', alias: '', thinking: { levels: ['medium'] } }]
      )
    ).toBe(false);
  });
});
