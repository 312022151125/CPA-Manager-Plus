import type { ReactElement } from 'react';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKeyConfig } from '@/types';

const mocks = vi.hoisted(() => ({
  config: { claudeApiKeys: [] as ProviderKeyConfig[] },
  fetchConfig: vi.fn(),
  updateConfigValue: vi.fn(),
  clearCache: vi.fn(),
  showNotification: vi.fn(),
  allowNextNavigation: vi.fn(),
  navigate: vi.fn(),
  updateClaudeConfig: vi.fn(),
  createClaudeConfig: vi.fn(),
  getClaudeConfigs: vi.fn(),
  outletContext: { current: null as Record<string, unknown> | null },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  Outlet: (props: { context?: unknown }) => {
    mocks.outletContext.current = (props.context ?? null) as Record<string, unknown> | null;
    return null;
  },
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ state: null }),
  useParams: () => ({ index: '0' }),
}));

vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation: mocks.allowNextNavigation }),
}));

vi.mock('@/stores', async () => {
  const draftStore = await import('@/stores/useClaudeEditDraftStore');
  return {
    useAuthStore: (selector: (state: { connectionStatus: string }) => unknown) =>
      selector({ connectionStatus: 'connected' }),
    useConfigStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        config: mocks.config,
        fetchConfig: mocks.fetchConfig,
        updateConfigValue: mocks.updateConfigValue,
        clearCache: mocks.clearCache,
        isCacheValid: () => true,
      }),
    useNotificationStore: () => ({ showNotification: mocks.showNotification }),
    useClaudeEditDraftStore: draftStore.useClaudeEditDraftStore,
  };
});

vi.mock('@/services/api', async () => {
  const actual = await import('@/services/api/providers');
  return {
    providersApi: {
      updateClaudeConfig: mocks.updateClaudeConfig,
      createClaudeConfig: mocks.createClaudeConfig,
      getClaudeConfigs: mocks.getClaudeConfigs,
    },
    findMatchingProviderKeyConfig: actual.findMatchingProviderKeyConfig,
    isRequestFingerprintVerified: actual.isRequestFingerprintVerified,
  };
});

import { AiProvidersClaudeEditLayout } from './AiProvidersClaudeEditLayout';
import { useClaudeEditDraftStore } from '@/stores/useClaudeEditDraftStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type EditorContext = {
  form: { fingerprintProfile?: string };
  setForm: (action: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  handleSave: () => Promise<void>;
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderEditor = async () => {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(AiProvidersClaudeEditLayout) as ReactElement);
  });
  await flush();
  return renderer!;
};

const setFingerprint = async (value: string) => {
  const context = mocks.outletContext.current as EditorContext | null;
  if (!context) throw new Error('editor context was not captured');
  await act(async () => {
    context.setForm((prev) => ({ ...prev, fingerprintProfile: value }));
  });
};

const save = async () => {
  const context = mocks.outletContext.current as EditorContext | null;
  if (!context) throw new Error('editor context was not captured');
  await act(async () => {
    await context.handleSave();
  });
};

const successNotifications = () =>
  mocks.showNotification.mock.calls.filter((call) => call[1] === 'success');
const errorNotifications = () =>
  mocks.showNotification.mock.calls.filter((call) => call[1] === 'error');

describe('AiProvidersClaudeEditLayout fingerprint save verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClaudeEditDraftStore.setState({ drafts: {}, refCounts: {} });
    mocks.config = {
      claudeApiKeys: [{ apiKey: 'key', authIndex: 'claude-auth', priority: 1 }],
    };
    mocks.fetchConfig.mockResolvedValue(mocks.config.claudeApiKeys);
    mocks.updateClaudeConfig.mockResolvedValue(undefined);
    mocks.createClaudeConfig.mockResolvedValue(undefined);
  });

  it('reports an error instead of success when the connected CPA silently drops the fingerprint', async () => {
    mocks.getClaudeConfigs.mockResolvedValue([{ apiKey: 'key', authIndex: 'claude-auth' }]);

    await renderEditor();
    await setFingerprint('claude-code-cli');
    await save();

    expect(mocks.updateClaudeConfig).toHaveBeenCalledWith(
      mocks.config.claudeApiKeys[0],
      expect.objectContaining({ fingerprintProfile: 'claude-code-cli' })
    );
    expect(errorNotifications()).toHaveLength(1);
    expect(errorNotifications()[0][0]).toBe('notification.claude_fingerprint_verify_failed');
    expect(successNotifications()).toHaveLength(0);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.updateConfigValue).toHaveBeenLastCalledWith('claude-api-key', [
      { apiKey: 'key', authIndex: 'claude-auth' },
    ]);
  });

  it('saves with a success notification when the read-back confirms the requested profile', async () => {
    mocks.getClaudeConfigs.mockResolvedValue([
      { apiKey: 'key', authIndex: 'claude-auth', fingerprintProfile: 'claude-code-cli' },
    ]);

    await renderEditor();
    await setFingerprint('claude-code-cli');
    await save();

    expect(errorNotifications()).toHaveLength(0);
    expect(successNotifications()).toHaveLength(1);
    expect(successNotifications()[0][0]).toBe('notification.claude_config_updated');
  });

  it('accepts an explicit Default once the read-back no longer exposes a profile', async () => {
    mocks.config = {
      claudeApiKeys: [
        { apiKey: 'key', authIndex: 'claude-auth', fingerprintProfile: 'claude-code-cli' },
      ],
    };
    mocks.fetchConfig.mockResolvedValue(mocks.config.claudeApiKeys);
    mocks.getClaudeConfigs.mockResolvedValue([{ apiKey: 'key', authIndex: 'claude-auth' }]);

    await renderEditor();
    await setFingerprint('');
    await save();

    expect(mocks.updateClaudeConfig).toHaveBeenCalledWith(
      mocks.config.claudeApiKeys[0],
      expect.objectContaining({ fingerprintProfile: '' })
    );
    expect(errorNotifications()).toHaveLength(0);
    expect(successNotifications()).toHaveLength(1);
  });

  it('reports an error without touching local state when verification cannot read back', async () => {
    mocks.getClaudeConfigs.mockRejectedValue(new Error('read-back failed'));

    await renderEditor();
    await setFingerprint('claude-code-cli');
    await save();

    expect(errorNotifications()).toHaveLength(1);
    expect(errorNotifications()[0][0]).toBe('notification.claude_fingerprint_verify_failed');
    expect(successNotifications()).toHaveLength(0);
    expect(mocks.updateConfigValue).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('keeps the existing fallback save flow when the fingerprint was not changed', async () => {
    mocks.getClaudeConfigs.mockRejectedValue(new Error('read-back failed'));

    await renderEditor();
    await save();

    expect(mocks.updateClaudeConfig).toHaveBeenCalledWith(
      mocks.config.claudeApiKeys[0],
      expect.objectContaining({ fingerprintProfile: undefined })
    );
    expect(errorNotifications()).toHaveLength(0);
    expect(successNotifications()).toHaveLength(1);
    expect(mocks.updateConfigValue).toHaveBeenLastCalledWith('claude-api-key', [
      expect.objectContaining({ apiKey: 'key', authIndex: 'claude-auth' }),
    ]);
  });
});
