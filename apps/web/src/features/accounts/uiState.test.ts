import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCOUNTS_PAGE_UI_STATE_STORAGE_KEY,
  DEFAULT_ACCOUNTS_LIST_VIEW_MODE,
  normalizeAccountsListViewMode,
  normalizeAccountsPageUiState,
  readAccountsPageUiState,
  writeAccountsPageUiState,
} from './uiState';

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createMemoryStorage = (): StorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

const originalWindow = (globalThis as { window?: unknown }).window;

describe('accounts uiState', () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage: storage };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it('normalizes list view mode and page state', () => {
    expect(normalizeAccountsListViewMode('table')).toBe('table');
    expect(normalizeAccountsListViewMode('unknown')).toBe(DEFAULT_ACCOUNTS_LIST_VIEW_MODE);
    expect(normalizeAccountsPageUiState(null)).toEqual({
      listViewMode: DEFAULT_ACCOUNTS_LIST_VIEW_MODE,
    });
    expect(normalizeAccountsPageUiState({ listViewMode: 'table' })).toEqual({
      listViewMode: 'table',
    });
  });

  it('persists and reads page state via localStorage', () => {
    writeAccountsPageUiState({ listViewMode: 'table' });

    expect(JSON.parse(storage.getItem(ACCOUNTS_PAGE_UI_STATE_STORAGE_KEY) ?? '{}')).toEqual({
      listViewMode: 'table',
    });
    expect(readAccountsPageUiState()).toEqual({ listViewMode: 'table' });
  });

  it('returns defaults when stored payload is invalid JSON', () => {
    storage.setItem(ACCOUNTS_PAGE_UI_STATE_STORAGE_KEY, '{not json');

    expect(readAccountsPageUiState()).toEqual({
      listViewMode: DEFAULT_ACCOUNTS_LIST_VIEW_MODE,
    });
  });
});
