import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { CoolingPolicySelect } from '@/components/providers/CoolingPolicySelect';

const authState = vi.hoisted(() => ({
  serverVersion: 'v7.2.93' as string | null,
  serverCommit: null as string | null,
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

const mocks = vi.hoisted(() => ({
  fetchConfig: vi.fn(),
  updateConfigValue: vi.fn(),
  clearCache: vi.fn(),
  showNotification: vi.fn(),
  updateCodexConfig: vi.fn(),
  getCodexConfigs: vi.fn(),
  createMetaConfig: vi.fn(),
  updateMetaConfig: vi.fn(),
  getMetaConfigs: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useConfigStore: (selector: (state: unknown) => unknown) =>
    selector({
      fetchConfig: mocks.fetchConfig,
      updateConfigValue: mocks.updateConfigValue,
      clearCache: mocks.clearCache,
    }),
  useNotificationStore: () => ({ showNotification: mocks.showNotification }),
}));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({
    open,
    children,
    footer,
    onClose,
  }: {
    open: boolean;
    children: ReactNode;
    footer: ReactNode;
    onClose: () => void;
  }) =>
    open
      ? createElement(
          'div',
          null,
          children,
          footer,
          createElement('button', { type: 'button', 'data-drawer-close': true, onClick: onClose })
        )
      : null,
}));

vi.mock('@/services/api', () => ({
  apiCallApi: { request: vi.fn() },
  getApiCallErrorMessage: vi.fn(() => ''),
  modelsApi: { fetchV1ModelsViaApiCall: vi.fn() },
  providersApi: {
    updateCodexConfig: mocks.updateCodexConfig,
    getCodexConfigs: mocks.getCodexConfigs,
    createMetaConfig: mocks.createMetaConfig,
    updateMetaConfig: mocks.updateMetaConfig,
    getMetaConfigs: mocks.getMetaConfigs,
  },
}));

import { CodexEditDrawer } from './CodexEditDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const findSaveButton = (root: ReactTestInstance) =>
  root
    .findAllByType('button')
    .find((button) => String(button.props.className ?? '').includes('btn-primary'));

const findDrawerCloseButton = (root: ReactTestInstance) =>
  root.findAllByType('button').find((button) => button.props['data-drawer-close'] === true);

describe('CodexEditDrawer load baseline guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.serverVersion = 'v7.2.93';
    mocks.fetchConfig.mockResolvedValue([]);
    mocks.updateCodexConfig.mockResolvedValue(undefined);
    mocks.getCodexConfigs.mockResolvedValue([]);
  });

  it('does not reuse a stale xAI edit baseline after a later load failure', async () => {
    mocks.fetchConfig
      .mockResolvedValueOnce([
        { apiKey: 'xai-old', baseUrl: 'https://api.x.ai/v1', websockets: true },
      ])
      .mockRejectedValueOnce(new Error('load failed'));

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <CodexEditDrawer
          open
          editIndex={0}
          disabled={false}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          providerKind="xai"
        />
      );
    });

    expect(
      renderer!.root.findAllByType('input').some((input) => input.props.value === 'xai-old')
    ).toBe(true);

    await act(async () => {
      renderer!.update(
        <CodexEditDrawer
          open={false}
          editIndex={0}
          disabled={false}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          providerKind="xai"
        />
      );
    });
    await act(async () => {
      renderer!.update(
        <CodexEditDrawer
          open
          editIndex={0}
          disabled={false}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          providerKind="xai"
        />
      );
    });

    expect(renderer!.root.findAllByType('input')).toHaveLength(0);
    expect(findSaveButton(renderer!.root)?.props.disabled).toBe(true);

    act(() => renderer!.unmount());
  });

  it('treats an invalid weight as an unsaved edit while disabling save', async () => {
    mocks.fetchConfig.mockResolvedValueOnce([
      { apiKey: 'codex-key', baseUrl: 'https://api.openai.com/v1' },
    ]);
    const onClose = vi.fn();
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('window', { confirm: confirmMock });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <CodexEditDrawer open editIndex={0} disabled={false} onClose={onClose} onSaved={vi.fn()} />
      );
    });

    const weightInput = renderer!.root
      .findAllByType('input')
      .find((input) => input.props.inputMode === 'text');
    expect(weightInput).toBeDefined();

    act(() => weightInput?.props.onChange({ target: { value: '1.5' } }));
    expect(findSaveButton(renderer!.root)?.props.disabled).toBe(true);

    act(() => findDrawerCloseButton(renderer!.root)?.props.onClick());
    expect(confirmMock).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    act(() => renderer!.unmount());
  });

  it.each([
    [undefined, 'enabled', false],
    [true, 'inherit', null],
  ] as const)(
    'saves cooling %j -> %s as disable-cooling %j',
    async (initialOverride, nextPolicy, expectedOverride) => {
      mocks.fetchConfig.mockResolvedValueOnce([
        {
          apiKey: 'codex-key',
          baseUrl: 'https://api.openai.com/v1',
          ...(initialOverride === undefined ? {} : { disableCooling: initialOverride }),
        },
      ]);
      const onSaved = vi.fn();
      let renderer: ReactTestRenderer;
      await act(async () => {
        renderer = create(
          <CodexEditDrawer
            open
            editIndex={0}
            disabled={false}
            onClose={vi.fn()}
            onSaved={onSaved}
          />
        );
      });

      act(() => renderer!.root.findByType(CoolingPolicySelect).props.onChange(nextPolicy));
      const saveButton = findSaveButton(renderer!.root);
      expect(saveButton?.props.disabled).toBe(false);

      await act(async () => {
        await saveButton?.props.onClick();
      });

      expect(mocks.updateCodexConfig).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'codex-key' }),
        expect.objectContaining({
          apiKey: 'codex-key',
          disableCooling: expectedOverride,
        })
      );
      expect(onSaved).toHaveBeenCalledTimes(1);

      act(() => renderer!.unmount());
    }
  );

  it('rejects DCA tokens when editing or creating a Meta provider', async () => {
    mocks.createMetaConfig.mockResolvedValue(undefined);
    mocks.getMetaConfigs.mockResolvedValue([]);
    const onSaved = vi.fn();

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <CodexEditDrawer
          open
          editIndex={null}
          disabled={false}
          onClose={vi.fn()}
          onSaved={onSaved}
          providerKind="meta"
        />
      );
    });

    const inputs = renderer!.root.findAllByType('input');
    expect(inputs.length).toBeGreaterThan(0);
    const apiKeyInput = inputs[0];

    act(() => apiKeyInput?.props.onChange({ target: { value: 'dca:test-token' } }));

    const saveButton = findSaveButton(renderer!.root);
    await act(async () => {
      await saveButton?.props.onClick();
    });

    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Meta API Key'),
      'error'
    );
    expect(mocks.createMetaConfig).not.toHaveBeenCalled();

    act(() => renderer!.unmount());
  });

  it('creates a Meta provider with valid key and omits websockets toggle', async () => {
    mocks.createMetaConfig.mockResolvedValue(undefined);
    mocks.getMetaConfigs.mockResolvedValue([]);
    const onSaved = vi.fn();

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <CodexEditDrawer
          open
          editIndex={null}
          disabled={false}
          onClose={vi.fn()}
          onSaved={onSaved}
          providerKind="meta"
        />
      );
    });

    // Verify websockets toggle is not present
    const labels = renderer!.root.findAllByType('label');
    expect(labels.some((l) => l.props.children?.toString().includes('Websockets'))).toBe(false);

    const inputs = renderer!.root.findAllByType('input');
    expect(inputs.length).toBeGreaterThan(0);
    const apiKeyInput = inputs[0];

    act(() => apiKeyInput?.props.onChange({ target: { value: 'meta-valid-key' } }));

    const saveButton = findSaveButton(renderer!.root);
    await act(async () => {
      await saveButton?.props.onClick();
    });

    expect(mocks.createMetaConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'meta-valid-key',
        baseUrl: 'https://api.meta.ai/v1',
      })
    );
    expect(onSaved).toHaveBeenCalledTimes(1);

    act(() => renderer!.unmount());
  });
});
