import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { ModelPriceAttentionStore } from './modelPriceAttention';
import type { RuntimeModelPricingStatusResponse } from '@/services/api/usageService';

type GetRuntimeModelPricingStatusFn = (
  base: string,
  managementKey?: string,
  signal?: AbortSignal
) => Promise<RuntimeModelPricingStatusResponse>;

describe('ModelPriceAttentionStore', () => {
  class MockStorage implements Storage {
    private store = new Map<string, string>();
    get length() {
      return this.store.size;
    }
    clear() {
      this.store.clear();
    }
    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    key(index: number) {
      return Array.from(this.store.keys())[index] ?? null;
    }
    removeItem(key: string) {
      this.store.delete(key);
    }
    setItem(key: string, value: string) {
      this.store.set(key, value);
    }
  }

  let storage: MockStorage;
  let mockApi: {
    getRuntimeModelPricingStatus: Mock<GetRuntimeModelPricingStatusFn>;
  };

  const base = 'http://localhost:18317';

  beforeEach(() => {
    storage = new MockStorage();
    mockApi = {
      getRuntimeModelPricingStatus: vi.fn<GetRuntimeModelPricingStatusFn>(),
    };
  });

  it('calculates pending models as unpriced minus acknowledged', async () => {
    const store = new ModelPriceAttentionStore({
      base,
      storage,
      api: mockApi,
    });

    const response: RuntimeModelPricingStatusResponse = {
      models: ['gpt-5.6-sol', 'gpt-6-sol'],
      unpricedModels: ['gpt-6-sol'],
      count: 2,
      unpricedCount: 1,
    };
    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce(response);

    await store.check({ force: true });

    const state = store.getState();
    // gpt-5.6-sol is priced, so it was auto-acknowledged
    expect(state.acknowledgedModels).toContain('gpt-5.6-sol');
    expect(state.pendingModels).toEqual(['gpt-6-sol']);
  });

  it('auto-acknowledges runtime models that already have explicit prices', async () => {
    const store = new ModelPriceAttentionStore({
      base,
      storage,
      api: mockApi,
    });

    // All runtime models already priced
    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['model-a', 'model-b'],
      unpricedModels: [],
      count: 2,
      unpricedCount: 0,
    });

    await store.check({ force: true });

    const state = store.getState();
    expect(state.acknowledgedModels).toEqual(['model-a', 'model-b']);
    expect(state.pendingModels).toEqual([]);
  });

  it('preserves existing pending models on discovery failure', async () => {
    const store = new ModelPriceAttentionStore({
      base,
      storage,
      api: mockApi,
    });

    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['gpt-6-sol'],
      unpricedModels: ['gpt-6-sol'],
      count: 1,
      unpricedCount: 1,
    });

    await store.check({ force: true });
    expect(store.getState().pendingModels).toEqual(['gpt-6-sol']);

    // Next check fails
    mockApi.getRuntimeModelPricingStatus.mockRejectedValueOnce(new Error('Network error'));
    await store.check({ force: true });

    // Pending models are not wiped
    expect(store.getState().pendingModels).toEqual(['gpt-6-sol']);
    expect(store.getState().loading).toBe(false);
  });

  it('acknowledges snapshot after sync and clears attention', async () => {
    const store = new ModelPriceAttentionStore({
      base,
      storage,
      api: mockApi,
    });

    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['gpt-6-sol'],
      unpricedModels: ['gpt-6-sol'],
      count: 1,
      unpricedCount: 1,
    });

    await store.check({ force: true });
    expect(store.getState().pendingModels).toEqual(['gpt-6-sol']);

    // Capture snapshot at sync start
    const snapshot = store.capturePendingSnapshot();
    expect(snapshot).toEqual(['gpt-6-sol']);

    // Simulate successful sync completion: status refreshed and now gpt-6-sol may be priced or unpriced (unmatched)
    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['gpt-6-sol'],
      unpricedModels: ['gpt-6-sol'], // unmatched, still unpriced in DB
      count: 1,
      unpricedCount: 1,
    });

    await store.acknowledgeSnapshot(snapshot);

    const state = store.getState();
    expect(state.acknowledgedModels).toContain('gpt-6-sol');
    // Global attention badge cleared because it has been checked!
    expect(state.pendingModels).toEqual([]);
  });

  it('does not acknowledge models that appeared concurrently after sync started', async () => {
    const store = new ModelPriceAttentionStore({
      base,
      storage,
      api: mockApi,
    });

    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['model-A'],
      unpricedModels: ['model-A'],
      count: 1,
      unpricedCount: 1,
    });

    await store.check({ force: true });
    const snapshot = store.capturePendingSnapshot(); // ['model-A']

    // Concurrently, model-B appeared in runtime
    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['model-A', 'model-B'],
      unpricedModels: ['model-A', 'model-B'],
      count: 2,
      unpricedCount: 2,
    });

    await store.acknowledgeSnapshot(snapshot);

    const state = store.getState();
    expect(state.acknowledgedModels).toEqual(['model-A']);
    // model-B was NOT in snapshot, so it remains pending!
    expect(state.pendingModels).toEqual(['model-B']);
  });

  it('prevents concurrent duplicate checks', async () => {
    const store = new ModelPriceAttentionStore({
      base,
      storage,
      api: mockApi,
    });

    let resolveApi: (value: RuntimeModelPricingStatusResponse) => void;
    const pendingPromise = new Promise<RuntimeModelPricingStatusResponse>((resolve) => {
      resolveApi = resolve;
    });
    mockApi.getRuntimeModelPricingStatus.mockReturnValueOnce(pendingPromise);

    const check1 = store.check({ force: true });
    const check2 = store.check({ force: true });

    expect(mockApi.getRuntimeModelPricingStatus).toHaveBeenCalledTimes(1);

    resolveApi!({
      models: ['m1'],
      unpricedModels: ['m1'],
      count: 1,
      unpricedCount: 1,
    });

    await Promise.all([check1, check2]);
    expect(store.getState().pendingModels).toEqual(['m1']);
  });

  it('does not re-notify when a previously acknowledged model disappears and reappears', async () => {
    const store = new ModelPriceAttentionStore({
      base,
      storage,
      api: mockApi,
    });

    // 1. Initial check: model-x is unpriced
    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['model-x'],
      unpricedModels: ['model-x'],
      count: 1,
      unpricedCount: 1,
    });
    await store.check({ force: true });
    expect(store.getState().pendingModels).toEqual(['model-x']);

    // 2. User acknowledges model-x
    await store.acknowledgeSnapshot(['model-x']);
    expect(store.getState().pendingModels).toEqual([]);

    // 3. Model-x disappears
    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: [],
      unpricedModels: [],
      count: 0,
      unpricedCount: 0,
    });
    await store.check({ force: true });
    expect(store.getState().pendingModels).toEqual([]);

    // 4. Model-x reappears
    mockApi.getRuntimeModelPricingStatus.mockResolvedValueOnce({
      models: ['model-x'],
      unpricedModels: ['model-x'],
      count: 1,
      unpricedCount: 1,
    });
    await store.check({ force: true });
    // Still acknowledged, no pending notification!
    expect(store.getState().pendingModels).toEqual([]);
  });
});
