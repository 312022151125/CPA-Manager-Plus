import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiKeyMutation } from '@/components/config/ApiKeysCardEditor';

const mocks = vi.hoisted(() => ({
  fetchConfigYaml: vi.fn(),
  saveConfigYaml: vi.fn(),
  apiKeysList: vi.fn(),
  apiKeysReplace: vi.fn(),
  apiKeysReplaceValue: vi.fn(),
  apiKeysDeleteValue: vi.fn(),
  getInfo: vi.fn(),
  showNotification: vi.fn(),
  showConfirmation: vi.fn(),
  commitApiKeysText: vi.fn(),
  loadVisualValuesFromYaml: vi.fn(),
  applyVisualChangesToYaml: vi.fn(),
  setVisualValues: vi.fn(),
  clearCache: vi.fn(),
  fetchGlobalConfig: vi.fn(),
  setUsageServiceConfig: vi.fn(),
  visualState: {
    apiKeysText: 'sk-old',
    dirty: false,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/common/PageTransitionLayer', () => ({
  usePageTransitionLayer: () => null,
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('@/components/config/VisualConfigEditor', () => ({
  VisualConfigEditor: ({
    onPersistApiKeyMutation,
    onApiKeyOperationStart,
    onApiKeyOperationEnd,
  }: {
    onPersistApiKeyMutation: (mutation: ApiKeyMutation) => Promise<string[]>;
    onApiKeyOperationStart: () => void;
    onApiKeyOperationEnd: () => void;
  }) => {
    const runMutation = async (mutation: ApiKeyMutation) => {
      try {
        onApiKeyOperationStart();
        await onPersistApiKeyMutation(mutation);
      } catch {
        // The real editor renders mutation errors. This harness only observes the page contract.
      } finally {
        onApiKeyOperationEnd();
      }
    };

    return (
      <div data-test="visual-editor">
        <button
          type="button"
          data-test="create-key"
          onClick={() => runMutation({ type: 'create', apiKey: 'sk-new' })}
        />
        <button
          type="button"
          data-test="replace-key"
          onClick={() => runMutation({ type: 'replace', oldApiKey: 'sk-old', newApiKey: 'sk-new' })}
        />
      </div>
    );
  },
}));

vi.mock('@/components/config/ManagerConfigPanel', () => ({
  ManagerConfigPanel: () => <div data-test="manager-panel" />,
}));

vi.mock('@/components/config/DiffModal', () => ({
  DiffModal: () => null,
}));

vi.mock('@/components/config/ConfigSourceEditor', () => ({
  default: ({
    value,
    onChange,
    editable,
  }: {
    value: string;
    onChange: (value: string) => void;
    editable: boolean;
  }) => (
    <textarea
      data-test="source-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={!editable}
    />
  ),
}));

vi.mock('@/components/ui/SegmentedTabs', () => ({
  SegmentedTabs: ({
    items,
    activeTab,
    onChange,
  }: {
    items: ReadonlyArray<{ id: string; label: ReactNode; disabled?: boolean }>;
    activeTab: string;
    onChange?: (tab: string) => void;
  }) => (
    <div data-test="tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-tab={item.id}
          data-active={item.id === activeTab}
          disabled={item.disabled}
          onClick={() => onChange?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/stores', () => ({
  useAuthStore: (
    selector: (state: { connectionStatus: string; managementKey: string }) => unknown
  ) => selector({ connectionStatus: 'connected', managementKey: 'management-key' }),
  useNotificationStore: (
    selector: (state: {
      showNotification: typeof mocks.showNotification;
      showConfirmation: typeof mocks.showConfirmation;
    }) => unknown
  ) =>
    selector({
      showNotification: mocks.showNotification,
      showConfirmation: mocks.showConfirmation,
    }),
  useThemeStore: (selector: (state: { resolvedTheme: string }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
  useConfigStore: {
    getState: () => ({
      clearCache: mocks.clearCache,
      fetchConfig: mocks.fetchGlobalConfig,
    }),
  },
  useUsageServiceStore: (
    selector: (state: { setUsageServiceConfig: typeof mocks.setUsageServiceConfig }) => unknown
  ) => selector({ setUsageServiceConfig: mocks.setUsageServiceConfig }),
}));

vi.mock('@/hooks/useVisualConfig', () => ({
  useVisualConfig: () => ({
    visualValues: {
      apiKeysText: mocks.visualState.apiKeysText,
      redisUsageQueueRetentionSeconds: '60',
    },
    visualDirty: mocks.visualState.dirty,
    visualParseError: null,
    visualValidationErrors: {},
    visualHasPayloadValidationErrors: false,
    loadVisualValuesFromYaml: mocks.loadVisualValuesFromYaml,
    applyVisualChangesToYaml: mocks.applyVisualChangesToYaml,
    setVisualValues: mocks.setVisualValues,
    commitApiKeysText: mocks.commitApiKeysText,
  }),
}));

vi.mock('@/services/api/configFile', () => ({
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
    saveConfigYaml: mocks.saveConfigYaml,
  },
}));

vi.mock('@/services/api/apiKeys', () => ({
  apiKeysApi: {
    list: mocks.apiKeysList,
    replace: mocks.apiKeysReplace,
    replaceValue: mocks.apiKeysReplaceValue,
    deleteValue: mocks.apiKeysDeleteValue,
  },
}));

vi.mock('@/services/api/usageService', () => ({
  getUsageServiceErrorCode: () => '',
  isUsageServiceId: () => false,
  normalizeUsageServiceBase: (value: string) => value,
  usageServiceApi: {
    getInfo: mocks.getInfo,
  },
}));

vi.mock('@/utils/connection', () => ({
  detectApiBaseFromLocation: () => 'http://panel.local',
}));

const { ConfigPage } = await import('./ConfigPage');

const INITIAL_YAML = 'api-keys:\n  - sk-old\n';
const LATEST_WITHOUT_OLD_KEY = 'api-keys: []\n';

let renderer: ReactTestRenderer | null = null;
const originalLocalStorage = globalThis.localStorage;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mountPage = async () => {
  await act(async () => {
    renderer = create(<ConfigPage />);
  });
  await flush();
  return renderer as ReactTestRenderer;
};

const click = async (testId: string) => {
  const target = renderer?.root.findByProps({ 'data-test': testId });
  if (!target) throw new Error(`Test target not found: ${testId}`);
  await act(async () => {
    await target.props.onClick();
  });
  await flush();
};

const clickTab = async (tab: string) => {
  const target = renderer?.root.findByProps({ 'data-tab': tab });
  if (!target) throw new Error(`Tab not found: ${tab}`);
  await act(async () => {
    await target.props.onClick();
  });
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: vi.fn(),
    },
  });
  mocks.fetchConfigYaml.mockResolvedValue(INITIAL_YAML);
  mocks.saveConfigYaml.mockResolvedValue(undefined);
  mocks.apiKeysList.mockResolvedValue([]);
  mocks.apiKeysReplace.mockResolvedValue(undefined);
  mocks.apiKeysReplaceValue.mockResolvedValue(undefined);
  mocks.apiKeysDeleteValue.mockResolvedValue(undefined);
  mocks.getInfo.mockRejectedValue(new Error('not a Manager Server panel'));
  mocks.loadVisualValuesFromYaml.mockReturnValue({ ok: true });
  mocks.applyVisualChangesToYaml.mockImplementation((yaml: string) => yaml);
  mocks.commitApiKeysText.mockImplementation((apiKeysText: string) => {
    mocks.visualState.apiKeysText = apiKeysText;
    mocks.visualState.dirty = false;
  });
  mocks.visualState.apiKeysText = 'sk-old';
  mocks.visualState.dirty = false;
});

afterEach(() => {
  if (renderer) {
    act(() => renderer?.unmount());
    renderer = null;
  }
  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, 'localStorage');
  } else {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});

describe('ConfigPage API-key source snapshot safety', () => {
  it('keeps a successful API-key commit when the source snapshot refresh fails', async () => {
    mocks.fetchConfigYaml
      .mockReset()
      .mockResolvedValueOnce(INITIAL_YAML)
      .mockRejectedValueOnce(new Error('snapshot refresh failed'));
    mocks.apiKeysList.mockResolvedValueOnce([]).mockResolvedValueOnce(['sk-new']);
    mocks.visualState.dirty = true;
    await mountPage();

    await click('create-key');

    expect(mocks.apiKeysReplace).toHaveBeenCalledWith(['sk-new']);
    expect(mocks.commitApiKeysText).toHaveBeenCalledWith('sk-new');
    expect(mocks.visualState.dirty).toBe(false);
    expect(mocks.saveConfigYaml).not.toHaveBeenCalled();
  });

  it('keeps the Visual tab and does not show the stale source buffer when refresh fails', async () => {
    mocks.fetchConfigYaml
      .mockReset()
      .mockResolvedValueOnce(INITIAL_YAML)
      .mockRejectedValueOnce(new Error('snapshot refresh failed'))
      .mockRejectedValueOnce(new Error('source refresh failed'));
    mocks.apiKeysList.mockResolvedValueOnce([]).mockResolvedValueOnce(['sk-new']);
    await mountPage();

    await click('create-key');
    await clickTab('source');

    expect(renderer?.root.findByProps({ 'data-tab': 'visual' }).props['data-active']).toBe(true);
    expect(renderer?.root.findAllByProps({ 'data-test': 'source-editor' })).toHaveLength(0);
    expect(mocks.showNotification).toHaveBeenCalledWith('notification.refresh_failed', 'error');
  });

  it('reloads the latest YAML before opening Source after a stale snapshot', async () => {
    mocks.fetchConfigYaml
      .mockReset()
      .mockResolvedValueOnce(INITIAL_YAML)
      .mockRejectedValueOnce(new Error('snapshot refresh failed'))
      .mockResolvedValueOnce(LATEST_WITHOUT_OLD_KEY);
    mocks.apiKeysList.mockResolvedValueOnce([]).mockResolvedValueOnce(['sk-new']);
    await mountPage();

    await click('create-key');
    await clickTab('source');

    const sourceEditor = renderer?.root.findByProps({ 'data-test': 'source-editor' });
    expect(sourceEditor?.props.value).toBe(LATEST_WITHOUT_OLD_KEY);
    expect(renderer?.root.findByProps({ 'data-tab': 'source' }).props['data-active']).toBe(true);
  });
});

describe('ConfigPage API-key replace preflight', () => {
  it('does not PATCH a stale old key and commits the canonical list', async () => {
    mocks.apiKeysList.mockResolvedValueOnce(['sk-other']);
    await mountPage();

    await click('replace-key');

    expect(mocks.apiKeysReplaceValue).not.toHaveBeenCalled();
    expect(mocks.commitApiKeysText).toHaveBeenCalledWith('sk-other');
    expect(mocks.showNotification).not.toHaveBeenCalledWith(
      'notification.save_failed',
      expect.anything()
    );
  });

  it('does not PATCH when the replacement key already exists', async () => {
    mocks.apiKeysList.mockResolvedValueOnce(['sk-old', 'sk-new']);
    await mountPage();

    await click('replace-key');

    expect(mocks.apiKeysReplaceValue).not.toHaveBeenCalled();
    expect(mocks.commitApiKeysText).not.toHaveBeenCalled();
  });

  it('orders normal replace as preflight GET, PATCH, canonical GET', async () => {
    const events: string[] = [];
    mocks.apiKeysList.mockImplementation(async () => {
      events.push('get');
      return events.filter((event) => event === 'get').length === 1 ? ['sk-old'] : ['sk-new'];
    });
    mocks.apiKeysReplaceValue.mockImplementation(async () => {
      events.push('patch');
    });
    await mountPage();

    await click('replace-key');

    expect(events).toEqual(['get', 'patch', 'get']);
    expect(mocks.apiKeysReplaceValue).toHaveBeenCalledWith('sk-old', 'sk-new');
  });
});
