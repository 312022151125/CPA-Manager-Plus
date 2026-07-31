import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthFileItem } from '@/types';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    downloadText: vi.fn(),
  },
}));

vi.mock('@/services/api', () => ({
  authFilesApi: {
    downloadText: mocks.downloadText,
  },
}));

import { useAccountCredentialSafeSummary } from './useAccountCredentialSafeSummary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createAuthFile = (authIndex: string): AuthFileItem =>
  ({
    id: `runtime-${authIndex}`,
    name: 'shared.json',
    type: 'codex',
    provider: 'codex',
    authIndex,
    account_id: `account-${authIndex}`,
  }) as AuthFileItem;

type HookResult = ReturnType<typeof useAccountCredentialSafeSummary>;
type HarnessApi = {
  getLatest: () => HookResult;
  update: (file: AuthFileItem | null, enabled?: boolean) => void;
  unmount: () => void;
};

function Harness({
  file,
  enabled,
  onResult,
}: {
  file: AuthFileItem | null;
  enabled: boolean;
  onResult: (result: HookResult) => void;
}) {
  const result = useAccountCredentialSafeSummary(file, enabled);
  onResult(result);
  return null;
}

const mountHarness = (initialFile: AuthFileItem | null, enabled = true): HarnessApi => {
  let latest: HookResult | null = null;
  let renderer: ReactTestRenderer | null = null;
  const onResult = (result: HookResult) => {
    latest = result;
  };

  act(() => {
    renderer = create(createElement(Harness, { file: initialFile, enabled, onResult }));
  });

  return {
    getLatest: () => {
      if (!latest) throw new Error('credential summary harness did not mount');
      return latest;
    },
    update: (file, nextEnabled = true) => {
      act(() => {
        renderer?.update(
          createElement(Harness, { file, enabled: nextEnabled, onResult })
        );
      });
    },
    unmount: () => {
      act(() => renderer?.unmount());
      renderer = null;
    },
  };
};

const flushAsync = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const sharedContent = (firstPrefix = 'first-prefix', secondPrefix = 'second-prefix') =>
  JSON.stringify([
    {
      auth_index: 'auth-1',
      account_id: 'account-auth-1',
      prefix: firstPrefix,
    },
    {
      auth_index: 'auth-2',
      account_id: 'account-auth-2',
      prefix: secondPrefix,
    },
  ]);

describe('useAccountCredentialSafeSummary', () => {
  let harness: HarnessApi | null = null;

  beforeEach(() => {
    mocks.downloadText.mockReset();
  });

  afterEach(() => {
    harness?.unmount();
    harness = null;
  });

  it('caches same-name credentials independently and restores the matching cached summary', async () => {
    const first = createAuthFile('auth-1');
    const second = createAuthFile('auth-2');
    mocks.downloadText.mockResolvedValue(sharedContent());
    harness = mountHarness(first);

    await flushAsync();
    const firstKey = harness.getLatest().credentialKey;
    expect(harness.getLatest().summary?.prefix).toBe('first-prefix');

    harness.update(second);
    await flushAsync();
    const secondKey = harness.getLatest().credentialKey;
    expect(secondKey).not.toBe(firstKey);
    expect(harness.getLatest().summary?.prefix).toBe('second-prefix');
    expect(mocks.downloadText).toHaveBeenCalledTimes(2);

    harness.update(first);
    await flushAsync();
    expect(harness.getLatest().credentialKey).toBe(firstKey);
    expect(harness.getLatest().summary?.prefix).toBe('first-prefix');
    expect(mocks.downloadText).toHaveBeenCalledTimes(2);
  });

  it('does not let a late response overwrite the currently selected credential', async () => {
    const first = createAuthFile('auth-1');
    const second = createAuthFile('auth-2');
    const firstDownload = createDeferred<string>();
    const secondDownload = createDeferred<string>();
    mocks.downloadText
      .mockImplementationOnce(() => firstDownload.promise)
      .mockImplementationOnce(() => secondDownload.promise);
    harness = mountHarness(first);

    await flushAsync();
    harness.update(second);
    await flushAsync();

    secondDownload.resolve(sharedContent('stale-first', 'current-second'));
    await flushAsync();
    expect(harness.getLatest().credentialKey).toBe('shared.json::auth-2');
    expect(harness.getLatest().summary?.prefix).toBe('current-second');

    firstDownload.resolve(sharedContent('late-first', 'unused-second'));
    await flushAsync();
    expect(harness.getLatest().credentialKey).toBe('shared.json::auth-2');
    expect(harness.getLatest().summary?.prefix).toBe('current-second');
  });

  it('invalidates every credential cache entry for one physical file', async () => {
    const first = createAuthFile('auth-1');
    const second = createAuthFile('auth-2');
    mocks.downloadText.mockResolvedValue(sharedContent());
    harness = mountHarness(first);

    await flushAsync();
    harness.update(second);
    await flushAsync();
    harness.update(first);
    await flushAsync();
    expect(mocks.downloadText).toHaveBeenCalledTimes(2);

    act(() => {
      harness?.getLatest().invalidate('shared.json');
    });
    await flushAsync();
    expect(mocks.downloadText).toHaveBeenCalledTimes(3);

    harness.update(second);
    await flushAsync();
    expect(mocks.downloadText).toHaveBeenCalledTimes(4);
  });
});
