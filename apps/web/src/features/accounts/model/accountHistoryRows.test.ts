import { describe, expect, it } from 'vitest';
import type { AccountRow } from './accountRows';
import {
  buildAccountHistoryByRowKey,
  buildAccountHistoryTargetEntries,
} from './accountHistoryRows';

const makeRow = (overrides: Partial<AccountRow>): AccountRow =>
  ({
    key: 'codex.json',
    selectionKey: 'codex.json\u0000auth-1',
    fileName: 'codex.json',
    accountLabel: 'codex@example.com',
    provider: 'codex',
    planType: null,
    disabled: false,
    runtimeOnly: false,
    statusMessage: '',
    authIndex: 'auth-1',
    projectId: '',
    priority: 0,
    quota: {
      status: 'unknown',
      remainingPercent: null,
      usedPercent: null,
      resetLabel: '-',
      planType: null,
      source: 'none',
    },
    usage: {
      success: 0,
      failure: 0,
      successRate: null,
      recentRequests: [],
    },
    inspection: null,
    raw: {
      name: 'codex.json',
      account: 'codex@example.com',
      authIndex: 'auth-1',
    },
    ...overrides,
  }) as AccountRow;

describe('accountHistoryRows', () => {
  it('builds strict account-history targets from current account rows', () => {
    const entries = buildAccountHistoryTargetEntries([
      makeRow({}),
      makeRow({
        selectionKey: 'label.json\u0000auth-2',
        fileName: 'label.json',
        accountLabel: 'Team login',
        authIndex: 'auth-2',
        raw: {
          name: 'label.json',
          label: 'Team login',
          authIndex: 'auth-2',
        },
      }),
    ]);

    expect(entries).toEqual([
      {
        rowKey: 'codex.json\u0000auth-1',
        accountKey: 'codex@example.com',
        target: {
          account_snapshot: 'codex@example.com',
          auth_label_snapshot: undefined,
          source: 'codex.json',
          auth_index: 'auth-1',
        },
      },
      {
        rowKey: 'label.json\u0000auth-2',
        accountKey: 'Team login',
        target: {
          account_snapshot: undefined,
          auth_label_snapshot: 'Team login',
          source: 'label.json',
          auth_index: 'auth-2',
        },
      },
    ]);
  });

  it('maps ordered account-history responses back to row keys', () => {
    const entries = buildAccountHistoryTargetEntries([makeRow({})]);
    const byRowKey = buildAccountHistoryByRowKey(entries, [
      {
        account_key: 'codex@example.com',
        matched: true,
        total_requests: 10,
        success_calls: 9,
        failure_calls: 1,
        total_tokens: 1200,
        total_cost: 0.42,
        success_rate: 0.9,
        first_seen_ms: 1,
        last_seen_ms: 2,
        sync_status: 'ready',
      },
    ]);

    expect(byRowKey.get('codex.json\u0000auth-1')?.total_requests).toBe(10);
  });
});
