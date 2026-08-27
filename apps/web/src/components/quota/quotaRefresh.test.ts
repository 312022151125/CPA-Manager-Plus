import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthFileItem } from '@/types';
import { fetchClaudeQuota, fetchCodexQuota } from '@/utils/quota';
import { getQuotaCredentialStoreKey } from '@/utils/quota/credentialScope';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { CLAUDE_CONFIG, CODEX_CONFIG, type QuotaConfig } from './quotaConfigs';
import { refreshQuotaWithConfig, type QuotaSetter } from './quotaRefresh';

vi.mock('@/utils/quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/quota')>();
  return {
    ...actual,
    fetchClaudeQuota: vi.fn(),
    fetchCodexQuota: vi.fn(),
  };
});

const t = ((key: string) => key) as TFunction;

const codexFile = {
  name: 'codex.json',
  type: 'codex',
  provider: 'codex',
  authIndex: '1',
} as AuthFileItem;

const claudeFile = {
  name: 'claude.json',
  type: 'claude',
  provider: 'claude',
  authIndex: '1',
} as AuthFileItem;

const codexData = (usedPercent: number) => ({
  planType: 'plus',
  windows: [
    {
      id: 'weekly',
      label: 'Weekly',
      usedPercent,
      resetLabel: 'tomorrow',
      observedAtMs: 1_000,
    },
  ],
  observedAtMs: 1_000,
  quotaInventoryObserved: true,
  subscriptionActiveUntil: null,
  rateLimitResetCreditsAvailableCount: null,
  rateLimitResetCredits: [],
  rateLimitResetCreditsError: null,
});

const claudeData = {
  quotaInventoryObserved: true,
  windows: [
    {
      id: 'five-hour',
      label: '5-hour',
      usedPercent: 25,
      resetLabel: 'tomorrow',
    },
  ],
  planType: 'plan_pro',
};

const runRefresh = <TState, TData>(
  config: QuotaConfig<TState, TData>,
  file: AuthFileItem,
  setQuota: QuotaSetter<TState>,
  currentState?: TState,
  isCurrent = () => true
) =>
  refreshQuotaWithConfig({
    config,
    file,
    setQuota,
    t,
    isCurrent,
    currentState,
  });

describe('refreshQuotaWithConfig', () => {
  beforeEach(() => {
    useQuotaStore.getState().clearQuotaCache();
    vi.mocked(fetchClaudeQuota).mockReset();
    vi.mocked(fetchCodexQuota).mockReset();
  });

  it('writes the Provider state once to the shared Codex store for all consumers', async () => {
    vi.mocked(fetchCodexQuota).mockResolvedValue(codexData(20));

    const result = await runRefresh(
      CODEX_CONFIG,
      codexFile,
      useQuotaStore.getState().setCodexQuota
    );

    expect(fetchCodexQuota).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'success', data: codexData(20) });
    const storeKey = getQuotaCredentialStoreKey(codexFile);
    expect(useQuotaStore.getState().codexQuota[storeKey]).toBe(result?.state);
    expect(useQuotaStore.getState().codexQuota[storeKey]).toMatchObject({
      status: 'success',
      authFileKey: storeKey,
      windows: [{ id: 'weekly', usedPercent: 20 }],
    });
  });

  it('preserves an existing Claude payload while recording a failed shared refresh', async () => {
    const previousState = CLAUDE_CONFIG.buildSuccessState(claudeData, claudeFile);
    const storeKey = getQuotaCredentialStoreKey(claudeFile);
    useQuotaStore.getState().setClaudeQuota({ [storeKey]: previousState });
    vi.mocked(fetchClaudeQuota).mockRejectedValue(
      Object.assign(new Error('temporary upstream failure'), { status: 503 })
    );

    const result = await runRefresh(
      CLAUDE_CONFIG,
      claudeFile,
      useQuotaStore.getState().setClaudeQuota,
      previousState
    );
    const state = useQuotaStore.getState().claudeQuota[storeKey];

    expect(fetchClaudeQuota).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'error', error: 'temporary upstream failure' });
    expect(state).toMatchObject({
      status: 'error',
      error: 'temporary upstream failure',
      errorStatus: 503,
      windows: previousState.windows,
      fetchedAtMs: previousState.fetchedAtMs,
    });
  });

  it('does not commit a response after the request becomes stale', async () => {
    let current = true;
    vi.mocked(fetchCodexQuota).mockResolvedValue(codexData(40));

    const resultPromise = runRefresh(
      CODEX_CONFIG,
      codexFile,
      useQuotaStore.getState().setCodexQuota,
      undefined,
      () => current
    );
    current = false;
    const result = await resultPromise;

    expect(result).toBeNull();
    expect(useQuotaStore.getState().codexQuota).toMatchObject({
      [getQuotaCredentialStoreKey(codexFile)]: { status: 'loading' },
    });
  });

  it('does not commit a response from an invalidated cache generation', async () => {
    vi.mocked(fetchCodexQuota).mockResolvedValue(codexData(60));

    const resultPromise = runRefresh(
      CODEX_CONFIG,
      codexFile,
      useQuotaStore.getState().setCodexQuota
    );
    useQuotaStore.getState().activateQuotaCacheScope('new-connection');
    const result = await resultPromise;

    expect(result).toBeNull();
    expect(useQuotaStore.getState().codexQuota).toEqual({});
  });
});
