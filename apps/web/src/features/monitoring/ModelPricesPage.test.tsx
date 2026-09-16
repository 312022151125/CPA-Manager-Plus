import { MemoryRouter } from 'react-router-dom';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelPricesPage } from './ModelPricesPage';
import * as attentionHook from '@/features/model-price-attention/useModelPriceAttention';
import * as usageDataHook from './hooks/useUsageData';
import { usageServiceApi } from '@/services/api/usageService';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { count?: number; defaultValue?: string }) => {
        if (key === 'usage_stats.model_price_sync') return '同步价格';
        if (key === 'model_prices.pending_sync_badge') return '待同步';
        if (key === 'model_prices.filter_missing') return '缺价格';
        if (key === 'model_prices.filter_all') return '全部';
        return options?.defaultValue || key;
      },
    }),
  };
});

vi.mock('@/hooks/usePanelFeatureAvailability', () => ({
  usePanelFeatureAvailability: () => ({
    modelPricesAvailable: true,
    requestMonitoringAvailable: true,
    managerServiceBase: 'http://localhost:18317',
  }),
}));

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: { managementKey: string }) => unknown) =>
    selector({ managementKey: 'test-key' }),
  useNotificationStore: () => ({
    showNotification: vi.fn(),
  }),
}));

describe('ModelPricesPage Attention UI', () => {
  let mockAttentionState: ReturnType<typeof attentionHook.useModelPriceAttention>;
  let mockSyncModelPrices: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(usageServiceApi, 'getModelPriceUsageSummary').mockResolvedValue({
      sampled_events: 0,
      total_events: 0,
      truncated: false,
      models: [],
    });

    mockSyncModelPrices = vi.fn().mockResolvedValue({
      imported: 1,
      skipped: 0,
      prices: {},
    });

    vi.spyOn(usageDataHook, 'useUsageData').mockReturnValue({
      loading: false,
      modelPrices: {},
      setModelPrices: vi.fn(),
      syncModelPrices: mockSyncModelPrices,
      usageServiceAvailable: true,
    } as unknown as ReturnType<typeof usageDataHook.useUsageData>);

    mockAttentionState = {
      runtimeModels: ['runtime-new-model'],
      unpricedModels: ['runtime-new-model'],
      acknowledgedModels: [],
      pendingModels: ['runtime-new-model'],
      pendingCount: 1,
      hasAttention: true,
      modelPricesAvailable: true,
      loading: false,
      lastCheckedAtMs: null,
      check: vi.fn(),
      capturePendingSnapshot: vi.fn().mockReturnValue(['runtime-new-model']),
      acknowledgeSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(attentionHook, 'useModelPriceAttention').mockImplementation(
      () => mockAttentionState
    );
  });

  it('renders pending count badge on Sync Prices button when pendingCount > 0', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/model-prices']}>
          <ModelPricesPage />
        </MemoryRouter>
      );
    });

    const root = renderer!.root;
    const badge = root.findByProps({ 'data-testid': 'sync-pending-badge' });
    expect(badge).toBeDefined();
    expect(badge.props.children).toBe(1);
  });

  it('does not render pending count badge on Sync Prices button when pendingCount = 0', async () => {
    mockAttentionState.pendingCount = 0;
    mockAttentionState.pendingModels = [];
    mockAttentionState.hasAttention = false;

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/model-prices']}>
          <ModelPricesPage />
        </MemoryRouter>
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ 'data-testid': 'sync-pending-badge' })).toHaveLength(0);
  });

  it('renders pending badge next to pending runtime model in the table', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/model-prices']}>
          <ModelPricesPage />
        </MemoryRouter>
      );
    });

    const root = renderer!.root;
    const modelBadge = root.findByProps({
      'data-testid': 'pending-badge-runtime-new-model',
    });
    expect(modelBadge).toBeDefined();
    expect(modelBadge.props.children).toBe('待同步');
  });

  it('activates filter=missing when provided in URL query parameters', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/model-prices?filter=missing']}>
          <ModelPricesPage />
        </MemoryRouter>
      );
    });

    const root = renderer!.root;
    const missingBtn = root.findByProps({ 'data-filter': 'missing' });
    expect(missingBtn.props['data-active']).toBe(true);
  });

  it('acknowledges pending snapshot upon clicking Sync Prices', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/model-prices']}>
          <ModelPricesPage />
        </MemoryRouter>
      );
    });

    const root = renderer!.root;
    const syncButton = root.findByProps({ 'data-testid': 'sync-prices-button' });
    expect(syncButton).toBeDefined();

    await act(async () => {
      syncButton.props.onClick();
    });

    expect(mockAttentionState.capturePendingSnapshot).toHaveBeenCalled();
    expect(mockSyncModelPrices).toHaveBeenCalled();
    expect(mockAttentionState.acknowledgeSnapshot).toHaveBeenCalledWith(['runtime-new-model']);
  });
});
