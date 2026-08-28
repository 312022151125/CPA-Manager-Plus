import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./client', () => ({
  apiClient: {
    get: mocks.get,
    put: mocks.put,
    patch: mocks.patch,
    delete: mocks.delete,
  },
}));

import { apiKeysApi } from './apiKeys';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.patch.mockReset();
  mocks.delete.mockReset();
});

describe('apiKeysApi value-based mutations', () => {
  it('replaces an API key by value', async () => {
    mocks.patch.mockResolvedValue({});

    await apiKeysApi.replaceValue('old-key', 'new-key');

    expect(mocks.patch).toHaveBeenCalledWith('/api-keys', {
      old: 'old-key',
      new: 'new-key',
    });
  });

  it('deletes an API key by an encoded value', async () => {
    mocks.delete.mockResolvedValue({});

    await apiKeysApi.deleteValue('key/with ?&');

    expect(mocks.delete).toHaveBeenCalledWith('/api-keys?value=key%2Fwith%20%3F%26');
  });

  it('keeps list normalization for CPA and camel-case response fields', async () => {
    mocks.get.mockResolvedValueOnce({ 'api-keys': ['first', 2] });
    await expect(apiKeysApi.list()).resolves.toEqual(['first', '2']);

    mocks.get.mockResolvedValueOnce({ apiKeys: ['fallback'] });
    await expect(apiKeysApi.list()).resolves.toEqual(['fallback']);
  });
});
