import { describe, expect, it } from 'vitest';
import type { AccountQuotaSnapshotWindow } from '@/services/api/usageService';
import type { AccountQuotaWindowDefinition } from './accountQuotaWindowDefinitions';
import {
  buildAccountQuotaSnapshotWriteEntries,
  mergeCodexResetCreditsFromQuotaSnapshots,
  mergeAccountQuotaSnapshotWindows,
} from './accountQuotaSnapshots';
import type { AccountRow } from './accountRows';

const makeDefinition = (
  overrides: Partial<AccountQuotaWindowDefinition> = {}
): AccountQuotaWindowDefinition => ({
  key: 'five-hour',
  providerWindowId: 'five-hour',
  provider: 'codex',
  label: '5H',
  kind: 'five_hour',
  windowMode: 'fixed',
  modelScope: { kind: 'all', complete: true },
  observationSource: 'api_query',
  observedAtMs: 10_000,
  boundaryAccuracy: 'exact',
  cycleStartMs: 1_000,
  cycleEndMs: 19_001_000,
  durationSeconds: 19_000,
  remainingPercent: 80,
  usedPercent: 20,
  stale: false,
  display: {
    key: 'five-hour',
    label: '5H',
    kind: 'five_hour',
    remainingPercent: 80,
    usedPercent: 20,
    resetLabel: '-',
    resetAccuracy: 'exact',
    limitWindowSeconds: 19_000,
    resetAtMs: 19_001_000,
    fromMs: 1_000,
    toMs: 10_000,
    source: 'codex',
  },
  ...overrides,
});

const makeSnapshot = (
  overrides: Partial<AccountQuotaSnapshotWindow> = {}
): AccountQuotaSnapshotWindow => ({
  provider_window_id: 'five-hour',
  window_kind: 'five_hour',
  window_mode: 'fixed',
  model_scope_kind: 'all',
  source: 'response_header',
  observed_at_ms: 20_000,
  boundary_accuracy: 'derived',
  cycle_start_ms: 2_000,
  cycle_end_ms: 20_002_000,
  duration_seconds: 20_000,
  used_percent: 35,
  remaining_percent: 65,
  stale: false,
  ...overrides,
});

describe('account quota snapshots', () => {
  it('overlays server provenance, boundaries, scope, and stale state', () => {
    const merged = mergeAccountQuotaSnapshotWindows(
      [makeDefinition()],
      [
        makeSnapshot({
          stale: true,
        }),
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      observationSource: 'response_header',
      boundaryAccuracy: 'derived',
      stale: true,
      modelScope: { kind: 'all', complete: true },
    });
  });

  it('adds snapshot-only rolling windows and keeps them ahead of non-window quotas', () => {
    const merged = mergeAccountQuotaSnapshotWindows(
      [
        makeDefinition({
          key: 'billing',
          providerWindowId: 'billing',
          provider: 'xai',
          kind: 'billing',
          windowMode: 'non_window',
          durationSeconds: null,
        }),
      ],
      [
        makeSnapshot({
          provider_window_id: 'included-free-rolling-24h',
          window_kind: 'rolling_24h',
          window_mode: 'rolling',
          model_scope_kind: 'models',
          model_scope_key: 'grok-4.5-build-free',
          model_ids: ['grok-4.5-build-free'],
          source: 'response_body',
          boundary_accuracy: 'estimated',
          cycle_start_ms: undefined,
          cycle_end_ms: 86_410_000,
          duration_seconds: 86_400,
          used_value: 1_000_000,
          limit_value: 1_000_000,
          quota_unit: 'tokens',
        }),
      ],
      { provider: 'xai', getLabel: () => 'Last 24 hours' }
    );

    expect(merged.map((item) => item.providerWindowId)).toEqual([
      'included-free-rolling-24h',
      'billing',
    ]);
    expect(merged[0]).toMatchObject({
      provider: 'xai',
      label: 'Last 24 hours',
      windowMode: 'rolling',
      observationSource: 'response_body',
      boundaryAccuracy: 'estimated',
      durationSeconds: 86_400,
    });
    expect(merged[0].display.amountLabel).toBe('1000000 / 1000000 tokens');
  });

  it('writes only standardized allowlisted fields', () => {
    const row = {
      selectionKey: 'codex.json\u0000auth-1',
      fileName: 'codex.json',
      provider: 'codex',
      authIndex: 'auth-1',
      accountLabel: 'user@example.com',
      raw: {
        name: 'codex.json',
        provider: 'codex',
        type: 'codex',
        auth_index: 'auth-1',
        account: 'user@example.com',
        access_token: 'must-not-leak',
      },
    } as unknown as AccountRow;
    const entries = buildAccountQuotaSnapshotWriteEntries(
      [row],
      new Map([[row.selectionKey, [makeDefinition()]]]),
      { nowMs: 20_000 }
    );

    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('must-not-leak');
    expect(entries[0].windows[0]).toMatchObject({
      provider_window_id: 'five-hour',
      source: 'api_query',
      boundary_accuracy: 'exact',
    });
  });

  it('uses field-level snapshot provenance for Codex reset-credit display fallback', () => {
    const merged = mergeCodexResetCreditsFromQuotaSnapshots(
      {
        status: 'error',
        windows: [],
        fetchedAtMs: 10_000,
        rateLimitResetCreditsAvailableCount: null,
      },
      [
        makeSnapshot({
          observed_at_ms: 20_000,
          reset_credits_available: 2,
          reset_credits: [{ id: 'credit-1', expires_at_ms: 100_000 }],
          field_sources: {
            reset_credits_available: { source: 'api_query', observed_at_ms: 15_000 },
            reset_credits: { source: 'api_query', observed_at_ms: 15_000 },
          },
        }),
      ]
    );

    expect(merged).toMatchObject({
      status: 'error',
      rateLimitResetCreditsAvailableCount: 2,
      rateLimitResetCredits: [
        {
          id: 'credit-1',
          status: 'available',
          expiresAt: new Date(100_000).toISOString(),
        },
      ],
    });
  });
});
