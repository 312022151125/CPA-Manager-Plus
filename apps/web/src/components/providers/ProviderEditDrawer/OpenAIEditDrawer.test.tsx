import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

const mocks = vi.hoisted(() => ({
  getOpenAIProviders: vi.fn(),
  fetchModelsViaApiCall: vi.fn(),
  updateConfigValue: vi.fn(),
  showNotification: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useConfigStore: (selector: (state: unknown) => unknown) =>
    selector({
      config: { openaiCompatibility: [] },
      updateConfigValue: mocks.updateConfigValue,
    }),
  useNotificationStore: () => ({ showNotification: mocks.showNotification }),
}));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('div', null, children) : null,
}));

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('div', null, children) : null,
}));

vi.mock('@/services/api', () => ({
  apiCallApi: { request: vi.fn() },
  getApiCallErrorDetails: vi.fn(() => ''),
  modelsApi: { fetchModelsViaApiCall: mocks.fetchModelsViaApiCall },
  providersApi: {
    createOpenAIProvider: vi.fn(),
    getOpenAIProviders: mocks.getOpenAIProviders,
    updateOpenAIProvider: vi.fn(),
  },
}));

import { OpenAIEditDrawer } from './OpenAIEditDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const findModelsFetchButton = (root: ReactTestInstance) =>
  root
    .findAllByType('button')
    .find((button) =>
      button.findAllByType('span').some((span) => span.children.join('').includes('/models'))
    );

describe('OpenAIEditDrawer model discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchModelsViaApiCall.mockResolvedValue([]);
  });

  it('uses the proxy from the first valid credential when an earlier row is empty', async () => {
    mocks.getOpenAIProviders.mockResolvedValueOnce([
      {
        name: 'openai-example',
        baseUrl: 'https://api.example.com/v1',
        apiKeyEntries: [
          { apiKey: '' },
          {
            apiKey: 'second-key',
            authIndex: 'auth-second',
            proxyUrl: 'socks5://proxy.example:1080',
          },
        ],
        models: [],
      },
    ]);

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <OpenAIEditDrawer open editIndex={0} disabled={false} onClose={vi.fn()} onSaved={vi.fn()} />
      );
    });

    const fetchButton = findModelsFetchButton(renderer!.root);
    expect(fetchButton).toBeDefined();

    await act(async () => {
      fetchButton!.props.onClick();
    });

    expect(mocks.fetchModelsViaApiCall).toHaveBeenCalledWith(
      'https://api.example.com/v1',
      'second-key',
      {},
      'auth-second',
      'socks5://proxy.example:1080'
    );

    act(() => renderer!.unmount());
  });
});
