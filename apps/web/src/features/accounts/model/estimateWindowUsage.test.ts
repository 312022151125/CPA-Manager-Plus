import { describe, expect, it } from 'vitest';
import { estimateWindowUsage } from './estimateWindowUsage';

describe('estimateWindowUsage', () => {
  it('projects only request, token and cost metrics from current progress', () => {
    expect(
      estimateWindowUsage({
        nowMs: 2_800_000,
        cycleStartMs: 1_000_000,
        cycleEndMs: 4_600_000,
        current: { requests: 50, tokens: 500_000, cost: 5 },
      })
    ).toEqual({ requests: 100, tokens: 1_000_000, cost: 10, basis: 'current' });
  });

  it('uses previous actual metrics when the current sample is too small', () => {
    expect(
      estimateWindowUsage({
        nowMs: 1_010_000,
        cycleStartMs: 1_000_000,
        cycleEndMs: 4_600_000,
        current: { requests: 1, tokens: 10, cost: 0.01 },
        previous: { requests: 60, tokens: 600_000, cost: 6 },
      })
    ).toEqual({ requests: 60, tokens: 600_000, cost: 6, basis: 'previous' });
  });

  it('returns null without a usable actual basis', () => {
    expect(
      estimateWindowUsage({
        nowMs: 1_010_000,
        cycleStartMs: 1_000_000,
        cycleEndMs: 4_600_000,
        current: null,
      })
    ).toBeNull();
  });
});
