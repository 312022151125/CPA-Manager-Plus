import { describe, expect, it } from 'vitest';
import {
  buildAntigravityQuotaMatrix,
  formatCompactNumber,
  formatHistorySuccessRate,
  parsePriorityValue,
  quotaStatusLabelKey,
} from './accountsPagePresentation';
import type { AccountRow } from './accountRows';
import type { AccountQuotaDisplayWindow } from './accountQuotaDisplayWindows';

describe('accountsPagePresentation', () => {
  it('keeps account sort and metric formatting semantics stable', () => {
    expect(parsePriorityValue(' -12 ')).toBe(-12);
    expect(parsePriorityValue('1.2')).toBeNull();
    expect(formatCompactNumber(999)).toBe('999');
    expect(formatCompactNumber(12_500)).toBe('12.5K');
    expect(formatHistorySuccessRate(0.975)).toBe('97.5%');
    expect(quotaStatusLabelKey('exhausted')).toBe('accounts.quota_status_exhausted');
  });

  it('builds the two-provider-group Antigravity quota matrix in stable order', () => {
    const row = { provider: 'antigravity' } as AccountRow;
    const windows = [
      ['weekly-gemini', 'weekly', 'Gemini models'],
      ['five-gemini', 'five_hour', 'Gemini models'],
      ['weekly-claude', 'weekly', 'Claude and GPT models'],
      ['five-claude', 'five_hour', 'Claude and GPT models'],
    ].map(
      ([key, kind, groupLabel]) =>
        ({
          key,
          kind,
          groupLabel,
          source: 'antigravity',
          label: kind,
        }) as AccountQuotaDisplayWindow
    );

    const matrix = buildAntigravityQuotaMatrix(row, windows);

    expect(matrix?.rows).toHaveLength(2);
    expect(matrix?.rows[0]?.cells.map((cell) => cell.displayLabel)).toEqual(['Claude', 'Gemini']);
    expect(matrix?.windowKeys).toEqual(
      new Set(['five-claude', 'five-gemini', 'weekly-claude', 'weekly-gemini'])
    );
  });
});
