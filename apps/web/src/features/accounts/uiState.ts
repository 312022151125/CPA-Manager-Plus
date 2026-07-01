export type AccountsListViewMode = 'cards' | 'table';

export type AccountsPageUiState = {
  listViewMode: AccountsListViewMode;
};

export const ACCOUNTS_PAGE_UI_STATE_STORAGE_KEY = 'accountsPage.uiState';
export const DEFAULT_ACCOUNTS_LIST_VIEW_MODE: AccountsListViewMode = 'cards';

const ACCOUNTS_LIST_VIEW_MODE_SET = new Set<AccountsListViewMode>(['cards', 'table']);

export const normalizeAccountsListViewMode = (value: unknown): AccountsListViewMode =>
  typeof value === 'string' && ACCOUNTS_LIST_VIEW_MODE_SET.has(value as AccountsListViewMode)
    ? (value as AccountsListViewMode)
    : DEFAULT_ACCOUNTS_LIST_VIEW_MODE;

export const normalizeAccountsPageUiState = (value: unknown): AccountsPageUiState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { listViewMode: DEFAULT_ACCOUNTS_LIST_VIEW_MODE };
  }

  const record = value as Record<string, unknown>;
  return {
    listViewMode: normalizeAccountsListViewMode(record.listViewMode),
  };
};

export const readAccountsPageUiState = (): AccountsPageUiState => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { listViewMode: DEFAULT_ACCOUNTS_LIST_VIEW_MODE };
  }

  try {
    const raw = window.localStorage.getItem(ACCOUNTS_PAGE_UI_STATE_STORAGE_KEY);
    if (raw) return normalizeAccountsPageUiState(JSON.parse(raw));
  } catch {
    // Ignore storage failures and fall back to defaults.
  }

  return { listViewMode: DEFAULT_ACCOUNTS_LIST_VIEW_MODE };
};

export const writeAccountsPageUiState = (state: AccountsPageUiState) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;

  try {
    window.localStorage.setItem(
      ACCOUNTS_PAGE_UI_STATE_STORAGE_KEY,
      JSON.stringify(normalizeAccountsPageUiState(state))
    );
  } catch {
    // Ignore storage failures.
  }
};
