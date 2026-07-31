import { describe, expect, it } from 'vitest';
import type { AccountRow } from './accountRows';
import {
  accountWindowUsageRequestKey,
  buildAccountWindowUsageByKey,
  buildAccountWindowUsageTargetEntries,
} from './accountWindowUsageRows';

const makeRow = (overrides: Partial<AccountRow>): AccountRow =>
  ({
    selectionKey: 'codex.json\x00auth-1',
    fileName: 'codex.json',
    authIndex: 'auth-1',
    raw: {
      account: 'codex@example.com',
      label: 'Codex Seat',
    },
    ...overrides,
  }) as AccountRow;

describe('accountWindowUsageRows', () => {
  it('builds window-scoped targets from account rows and valid window ranges', () => {
    const row = makeRow({});
    const entries = buildAccountWindowUsageTargetEntries(
      [row],
      new Map([
        [
          row.selectionKey,
          [
            { key: '5h', fromMs: 1000, toMs: 2000 },
            { key: 'missing-range', fromMs: null, toMs: 3000 },
          ],
        ],
      ])
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      rowKey: row.selectionKey,
      windowKey: '5h',
      requestKey: accountWindowUsageRequestKey(row.selectionKey, '5h'),
      target: {
        row_key: row.selectionKey,
        window_key: '5h',
        from_ms: 1000,
        to_ms: 2000,
        account_snapshot: 'codex@example.com',
        auth_label_snapshot: 'Codex Seat',
        auth_index: 'auth-1',
        source: 'codex.json',
      },
    });
  });

  it('indexes response items by row and quota window', () => {
    const row = makeRow({});
    const entries = buildAccountWindowUsageTargetEntries(
      [row],
      new Map([[row.selectionKey, [{ key: '5h', fromMs: 1000, toMs: 2000 }]]])
    );
    const byKey = buildAccountWindowUsageByKey(entries, [
      {
        row_key: row.selectionKey,
        window_key: '5h',
        from_ms: 1000,
        to_ms: 2000,
        matched: true,
        total_requests: 32,
        success_calls: 30,
        failure_calls: 2,
        total_tokens: 240000,
        total_cost: 5.2,
        success_rate: 0.9375,
        last_seen_ms: 1900,
        sync_status: 'ready',
      },
    ]);

    expect(byKey.get(accountWindowUsageRequestKey(row.selectionKey, '5h'))).toMatchObject({
      matched: true,
      total_requests: 32,
      total_cost: 5.2,
    });
  });
});
