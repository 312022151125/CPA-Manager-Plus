import { describe, expect, it } from 'vitest';
import type { AuthFileItem, CodexQuotaState } from '@/types';
import type {
  AccountActionCandidate,
  MonitoringAccountHistoryItem,
  MonitoringAccountWindowUsageItem,
} from '@/services/api';
import type { AccountRow } from './accountRows';
import { buildAccountDetailViewModel } from './accountDetailViewModel';
import { accountWindowUsageRequestKey } from './accountWindowUsageRows';

const makeRow = (overrides: Partial<AccountRow> = {}): AccountRow => {
  const raw: AuthFileItem = {
    name: overrides.fileName ?? 'shared.codex.json',
    type: overrides.provider ?? 'codex',
    provider: overrides.provider ?? 'codex',
    authIndex: overrides.authIndex ?? '0',
    account: overrides.accountLabel ?? 'codex@example.com',
  };

  return {
    key: raw.name,
    selectionKey: `${raw.name}\u0000${overrides.authIndex ?? '0'}`,
    fileName: raw.name,
    accountLabel: String(raw.account),
    provider: 'codex',
    planType: 'plus',
    disabled: false,
    runtimeOnly: false,
    statusMessage: '',
    authIndex: '0',
    projectId: '',
    priority: 0,
    quota: {
      status: 'ok',
      remainingPercent: 80,
      usedPercent: 20,
      resetLabel: 'later',
      planType: 'plus',
      source: 'cache',
    },
    usage: {
      success: 9,
      failure: 1,
      successRate: 90,
      recentRequests: [],
    },
    inspection: null,
    raw,
    ...overrides,
  };
};

const makeCandidate = (
  overrides: Partial<AccountActionCandidate> = {}
): AccountActionCandidate => ({
  id: 1,
  actionType: 'reauth',
  status: 'pending',
  provider: 'codex',
  authFileName: 'shared.codex.json',
  authIndex: '0',
  accountSnapshot: 'codex@example.com',
  authLabel: 'codex@example.com',
  reason: 'expired',
  firstSeenAtMs: 100,
  lastSeenAtMs: 200,
  hitCount: 1,
  createdAtMs: 100,
  updatedAtMs: 200,
  ...overrides,
});

const makeWindowUsage = (
  overrides: Partial<MonitoringAccountWindowUsageItem> = {}
): MonitoringAccountWindowUsageItem => ({
  row_key: 'shared.codex.json\u00000',
  window_key: 'weekly',
  from_ms: 1000,
  to_ms: 2000,
  matched: true,
  total_requests: 10,
  success_calls: 9,
  failure_calls: 1,
  total_tokens: 1200,
  total_cost: 0.42,
  success_rate: 0.9,
  last_seen_ms: 1900,
  sync_status: 'ready',
  ...overrides,
});

const makeHistory = (
  overrides: Partial<MonitoringAccountHistoryItem> = {}
): MonitoringAccountHistoryItem => ({
  account_key: 'codex@example.com',
  matched: true,
  total_requests: 12,
  success_calls: 10,
  failure_calls: 2,
  total_tokens: 2400,
  total_cost: 0.84,
  success_rate: 10 / 12,
  first_seen_ms: 100,
  last_seen_ms: 200,
  sync_status: 'ready',
  ...overrides,
});

describe('accountDetailViewModel', () => {
  it('matches window usage and action candidates by file name plus auth index', () => {
    const row = makeRow({
      selectionKey: 'shared.codex.json\u00001',
      authIndex: '1',
      accountLabel: 'second@example.com',
      raw: {
        name: 'shared.codex.json',
        type: 'codex',
        provider: 'codex',
        authIndex: '1',
        account: 'second@example.com',
      } as AuthFileItem,
    });
    const windowUsageByKey = new Map<string, MonitoringAccountWindowUsageItem>([
      [
        accountWindowUsageRequestKey('shared.codex.json\u00000', 'weekly'),
        makeWindowUsage({
          row_key: 'shared.codex.json\u00000',
          total_requests: 11,
          total_cost: 0.11,
        }),
      ],
      [
        accountWindowUsageRequestKey('shared.codex.json\u00001', 'weekly'),
        makeWindowUsage({
          row_key: 'shared.codex.json\u00001',
          total_requests: 22,
          total_cost: 0.22,
        }),
      ],
    ]);

    const viewModel = buildAccountDetailViewModel(row, {
      quotaWindows: [
        {
          key: 'weekly',
          label: 'Weekly',
          remainingPercent: 40,
          usedPercent: 60,
          resetLabel: 'later',
          fromMs: 1000,
          toMs: 2000,
        },
      ],
      windowUsageByKey,
      actionCandidates: [
        makeCandidate({ id: 1, authIndex: '0', reason: 'first account' }),
        makeCandidate({ id: 2, authIndex: '1', reason: 'second account', lastSeenAtMs: 300 }),
        makeCandidate({ id: 3, authIndex: undefined, reason: 'file-level fallback' }),
      ],
    });

    expect(viewModel.quota.windows[0].usage?.totalRequests).toBe(22);
    expect(viewModel.quota.windows[0].usage?.totalCost).toBe(0.22);
    expect(viewModel.strategy.actionCandidates).toHaveLength(1);
    expect(viewModel.strategy.actionCandidates[0]).toMatchObject({
      id: 2,
      reason: 'second account',
    });
  });

  it('keeps raw secrets and candidate evidence out of the drawer contract', () => {
    const row = makeRow({
      key: 'secret.codex.json',
      selectionKey: 'secret.codex.json\u00000',
      fileName: 'secret.codex.json',
      raw: {
        name: 'secret.codex.json',
        type: 'codex',
        provider: 'codex',
        authIndex: '0',
        account: 'secret@example.com',
        access_token: 'sk-raw-access-secret',
        refresh_token: 'sk-raw-refresh-secret',
        cookie: 'raw-cookie-secret',
        id_token: {
          email: 'secret@example.com',
          token: 'id-token-secret',
        },
      } as AuthFileItem,
    });
    const codexQuota: CodexQuotaState = {
      status: 'success',
      windows: [],
      rateLimitResetCreditsAvailableCount: 2,
      authFileKey: 'secret.codex.json::0',
    };

    const viewModel = buildAccountDetailViewModel(row, {
      codexQuota,
      history: makeHistory(),
      actionCandidates: [
        makeCandidate({
          authFileName: 'secret.codex.json',
          evidence: {
            raw_json: 'evidence-secret',
            fail_body: 'failure-body-secret',
          },
        }),
      ],
    });
    const serialized = JSON.stringify(viewModel);

    expect(viewModel.quota.resetCreditsAvailableCount).toBe(2);
    expect(viewModel.strategy.actionCandidates[0].hasEvidence).toBe(true);
    expect(serialized).not.toContain('sk-raw-access-secret');
    expect(serialized).not.toContain('sk-raw-refresh-secret');
    expect(serialized).not.toContain('raw-cookie-secret');
    expect(serialized).not.toContain('id-token-secret');
    expect(serialized).not.toContain('evidence-secret');
    expect(serialized).not.toContain('failure-body-secret');
  });

  it('uses account history as overview evidence when available', () => {
    const viewModel = buildAccountDetailViewModel(makeRow(), {
      history: makeHistory({
        total_requests: 99,
        total_tokens: 12345,
        total_cost: 6.78,
      }),
    });

    expect(viewModel.history?.successRate).toBeCloseTo(83.333, 2);
    expect(viewModel.overview.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'requests', value: 99 }),
        expect.objectContaining({ key: 'tokens', value: 12345 }),
        expect.objectContaining({ key: 'cost', value: 6.78 }),
      ])
    );
  });
});
