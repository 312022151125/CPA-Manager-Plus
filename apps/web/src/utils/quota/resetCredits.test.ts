import { describe, expect, it } from 'vitest';
import {
  normalizeCodexResetCreditsPayload,
  resolveCodexResetCreditsCountEvidenceAtMs,
  resolveCodexResetCreditsDetailEvidenceAtMs,
  mergeCodexResetCreditsEvidence,
  shouldAutoFetchCodexResetCreditDetails,
  buildCodexResetCreditAutoFetchSignature,
} from './resetCredits';

describe('normalizeCodexResetCreditsPayload', () => {
  it('normalizes available Codex rate limit reset credits', () => {
    const result = normalizeCodexResetCreditsPayload({
      available_count: '2',
      credits: [
        {
          id: 123,
          reset_type: 'codex_rate_limits',
          status: 'available',
          granted_at: '2026-06-01T00:00:00Z',
          expires_at: '2026-06-30T00:00:00Z',
        },
        {
          id: 'used-credit',
          reset_type: 'codex_rate_limits',
          status: 'used',
          expires_at: '2026-06-30T00:00:00Z',
        },
        {
          id: 'other-credit',
          reset_type: 'other',
          status: 'available',
          expires_at: '2026-06-30T00:00:00Z',
        },
      ],
    });

    expect(result).toEqual({
      availableCount: 2,
      invalidPayload: false,
      credits: [
        {
          id: '123',
          status: 'available',
          grantedAt: '2026-06-01T00:00:00Z',
          expiresAt: '2026-06-30T00:00:00Z',
        },
      ],
    });
  });

  it('parses JSON string payloads and supports camelCase fields', () => {
    const result = normalizeCodexResetCreditsPayload(
      JSON.stringify({
        availableCount: 1,
        credits: [
          {
            id: 'credit-1',
            resetType: 'codex_rate_limits',
            status: 'available',
            grantedAt: '2026-06-01T00:00:00Z',
            expiresAt: '2026-06-30T00:00:00Z',
          },
        ],
      })
    );

    expect(result.availableCount).toBe(1);
    expect(result.credits[0]?.id).toBe('credit-1');
    expect(result.invalidPayload).toBe(false);
  });

  it('marks invalid payloads', () => {
    expect(normalizeCodexResetCreditsPayload('not-json')).toEqual({
      availableCount: null,
      credits: [],
      invalidPayload: true,
    });

    expect(normalizeCodexResetCreditsPayload({ unknown: true })).toEqual({
      availableCount: null,
      credits: [],
      invalidPayload: true,
    });
  });
});

describe('resolveCodexResetCreditsCountEvidenceAtMs and resolveCodexResetCreditsDetailEvidenceAtMs', () => {
  it('prefers resetCreditsCountEvidenceAtMs and falls back to resetCreditsEvidenceAtMs or fetchedAtMs', () => {
    expect(
      resolveCodexResetCreditsCountEvidenceAtMs({
        resetCreditsCountEvidenceAtMs: 100,
        resetCreditsEvidenceAtMs: 50,
      })
    ).toBe(100);

    expect(
      resolveCodexResetCreditsCountEvidenceAtMs({
        resetCreditsEvidenceAtMs: 50,
      })
    ).toBe(50);

    expect(
      resolveCodexResetCreditsCountEvidenceAtMs({
        fetchedAtMs: 25,
      })
    ).toBe(25);
  });

  it('resolves detail evidence when resetCreditsDetailEvidenceAtMs is present', () => {
    expect(
      resolveCodexResetCreditsDetailEvidenceAtMs({
        resetCreditsDetailEvidenceAtMs: 200,
        rateLimitResetCredits: [{ id: '1', status: 'available', grantedAt: '', expiresAt: '2026-10-01' }],
      })
    ).toBe(200);
  });

  it('falls back to legacy resetCreditsEvidenceAtMs only if credits array has non-empty records (Test 10)', () => {
    // Non-empty credits: fallback allowed
    expect(
      resolveCodexResetCreditsDetailEvidenceAtMs({
        resetCreditsEvidenceAtMs: 150,
        rateLimitResetCredits: [{ id: '1', status: 'available', grantedAt: '', expiresAt: '2026-10-01' }],
      })
    ).toBe(150);

    // Empty credits with count > 0: do NOT treat as fresh detail evidence
    expect(
      resolveCodexResetCreditsDetailEvidenceAtMs({
        rateLimitResetCreditsAvailableCount: 2,
        resetCreditsEvidenceAtMs: 150,
        rateLimitResetCredits: [],
      })
    ).toBeNull();
  });
});

describe('mergeCodexResetCreditsEvidence', () => {
  const creditA = { id: 'A', status: 'available', grantedAt: '', expiresAt: '2026-10-04' };
  const creditB = { id: 'B', status: 'available', grantedAt: '', expiresAt: '2026-10-05' };

  it('Test 2: preserves previous detail when summary count is unchanged', () => {
    const previous = {
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [creditA, creditB],
      resetCreditsDetailEvidenceAtMs: 1000,
      resetCreditsCountEvidenceAtMs: 1000,
      resetCreditsDetailStale: false,
    };

    const summaryIncoming = {
      rateLimitResetCreditsAvailableCount: 2,
      resetCreditsCountEvidenceAtMs: 2000,
      observedAtMs: 2000,
    };

    const merged = mergeCodexResetCreditsEvidence(previous, summaryIncoming, {
      isFullDetailObservation: false,
    });

    expect(merged.rateLimitResetCreditsAvailableCount).toBe(2);
    expect(merged.resetCreditsCountEvidenceAtMs).toBe(2000);
    expect(merged.rateLimitResetCredits).toEqual([creditA, creditB]);
    expect(merged.resetCreditsDetailEvidenceAtMs).toBe(1000);
    expect(merged.resetCreditsDetailStale).toBe(false);
  });

  it('Test 3: marks detail stale and clears display credits when summary count changes', () => {
    const previous = {
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [creditA, creditB],
      resetCreditsDetailEvidenceAtMs: 1000,
      resetCreditsCountEvidenceAtMs: 1000,
    };

    const summaryIncoming = {
      rateLimitResetCreditsAvailableCount: 1,
      resetCreditsCountEvidenceAtMs: 2000,
      observedAtMs: 2000,
    };

    const merged = mergeCodexResetCreditsEvidence(previous, summaryIncoming, {
      isFullDetailObservation: false,
    });

    expect(merged.rateLimitResetCreditsAvailableCount).toBe(1);
    expect(merged.resetCreditsCountEvidenceAtMs).toBe(2000);
    expect(merged.rateLimitResetCredits).toEqual([]);
    expect(merged.resetCreditsDetailStale).toBe(true);
    // Detail evidence timestamp is retained as historical metadata without being advanced
    expect(merged.resetCreditsDetailEvidenceAtMs).toBe(1000);
  });

  it('Test 4: sets count=0, clears credits, marks detailStale=false on summary count -> 0', () => {
    const previous = {
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [creditA, creditB],
      resetCreditsDetailEvidenceAtMs: 1000,
    };

    const summaryIncoming = {
      rateLimitResetCreditsAvailableCount: 0,
      resetCreditsCountEvidenceAtMs: 2000,
      observedAtMs: 2000,
    };

    const merged = mergeCodexResetCreditsEvidence(previous, summaryIncoming, {
      isFullDetailObservation: false,
    });

    expect(merged.rateLimitResetCreditsAvailableCount).toBe(0);
    expect(merged.resetCreditsCountEvidenceAtMs).toBe(2000);
    expect(merged.rateLimitResetCredits).toEqual([]);
    expect(merged.resetCreditsDetailEvidenceAtMs).toBeNull();
    expect(merged.resetCreditsDetailStale).toBe(false);
  });

  it('Test 5: updates both count and detail timestamps on successful full detail observation', () => {
    const incoming = {
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [creditA, creditB],
      resetCreditsCountEvidenceAtMs: 3000,
      resetCreditsDetailEvidenceAtMs: 3000,
      observedAtMs: 3000,
    };

    const merged = mergeCodexResetCreditsEvidence(undefined, incoming, {
      isFullDetailObservation: true,
    });

    expect(merged.rateLimitResetCreditsAvailableCount).toBe(2);
    expect(merged.rateLimitResetCredits).toEqual([creditA, creditB]);
    expect(merged.resetCreditsCountEvidenceAtMs).toBe(3000);
    expect(merged.resetCreditsDetailEvidenceAtMs).toBe(3000);
    expect(merged.resetCreditsDetailStale).toBe(false);
  });

  it('Test 6: preserves trusted detail and records error when detail fetch fails and count is unchanged', () => {
    const previous = {
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [creditA, creditB],
      resetCreditsDetailEvidenceAtMs: 1000,
      resetCreditsCountEvidenceAtMs: 1000,
      resetCreditsDetailStale: false,
    };

    const incoming = {
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [],
      rateLimitResetCreditsError: 'Rate limit endpoint timeout',
      resetCreditsCountEvidenceAtMs: 2000,
      observedAtMs: 2000,
    };

    const merged = mergeCodexResetCreditsEvidence(previous, incoming, {
      isFullDetailObservation: false,
    });

    expect(merged.rateLimitResetCreditsAvailableCount).toBe(2);
    expect(merged.rateLimitResetCredits).toEqual([creditA, creditB]);
    expect(merged.resetCreditsDetailEvidenceAtMs).toBe(1000);
    expect(merged.rateLimitResetCreditsError).toBe('Rate limit endpoint timeout');
    expect(merged.resetCreditsDetailStale).toBe(false);
  });
});

describe('shouldAutoFetchCodexResetCreditDetails (Test 12)', () => {
  const now = 10_000_000;
  const fourMinutesAgo = now - 4 * 60 * 1000;
  const sixMinutesAgo = now - 6 * 60 * 1000;

  it('returns false when count is unknown or null', () => {
    expect(shouldAutoFetchCodexResetCreditDetails(undefined, now)).toBe(false);
    expect(shouldAutoFetchCodexResetCreditDetails({ rateLimitResetCreditsAvailableCount: null }, now)).toBe(false);
  });

  it('returns false when count is 0', () => {
    expect(shouldAutoFetchCodexResetCreditDetails({ rateLimitResetCreditsAvailableCount: 0 }, now)).toBe(false);
  });

  it('returns true when count > 0 and no detail evidence exists', () => {
    expect(
      shouldAutoFetchCodexResetCreditDetails(
        {
          rateLimitResetCreditsAvailableCount: 2,
          rateLimitResetCredits: [],
          resetCreditsDetailEvidenceAtMs: null,
        },
        now
      )
    ).toBe(true);
  });

  it('returns true when count > 0 and detail is marked stale', () => {
    expect(
      shouldAutoFetchCodexResetCreditDetails(
        {
          rateLimitResetCreditsAvailableCount: 2,
          resetCreditsDetailStale: true,
          resetCreditsDetailEvidenceAtMs: fourMinutesAgo,
        },
        now
      )
    ).toBe(true);
  });

  it('returns false when count > 0 and detail evidence is within 5 minutes TTL', () => {
    expect(
      shouldAutoFetchCodexResetCreditDetails(
        {
          rateLimitResetCreditsAvailableCount: 2,
          resetCreditsDetailStale: false,
          resetCreditsDetailEvidenceAtMs: fourMinutesAgo,
        },
        now
      )
    ).toBe(false);
  });

  it('returns true when count > 0 and detail evidence exceeds 5 minutes TTL', () => {
    expect(
      shouldAutoFetchCodexResetCreditDetails(
        {
          rateLimitResetCreditsAvailableCount: 2,
          resetCreditsDetailStale: false,
          resetCreditsDetailEvidenceAtMs: sixMinutesAgo,
        },
        now
      )
    ).toBe(true);
  });
});

describe('buildCodexResetCreditAutoFetchSignature', () => {
  it('generates consistent signature based on selectionKey, count, timestamps, and stale flag', () => {
    const sig1 = buildCodexResetCreditAutoFetchSignature('key-1', {
      rateLimitResetCreditsAvailableCount: 2,
      resetCreditsCountEvidenceAtMs: 1000,
      resetCreditsDetailEvidenceAtMs: 1000,
      resetCreditsDetailStale: false,
    });
    const sig2 = buildCodexResetCreditAutoFetchSignature('key-1', {
      rateLimitResetCreditsAvailableCount: 2,
      resetCreditsCountEvidenceAtMs: 1000,
      resetCreditsDetailEvidenceAtMs: 1000,
      resetCreditsDetailStale: false,
    });
    const sig3 = buildCodexResetCreditAutoFetchSignature('key-1', {
      rateLimitResetCreditsAvailableCount: 1,
      resetCreditsCountEvidenceAtMs: 2000,
      resetCreditsDetailEvidenceAtMs: 1000,
      resetCreditsDetailStale: true,
    });

    expect(sig1).toBe(sig2);
    expect(sig1).not.toBe(sig3);
  });
});
