import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE } from './accountsWorkspaceUiState';
import {
  readAccountsWorkspaceUrlState,
  writeAccountsWorkspaceUrlSearch,
} from './accountsWorkspaceUrlState';

describe('accountsWorkspaceUrlState', () => {
  it('reads validated workspace filters, detail deep links and OAuth editors', () => {
    const state = readAccountsWorkspaceUrlState(
      '?view=oauth&search=team%2A&provider=codex&status=problem&plan=pro&quota=lt20&operation=reauth&sort=name&direction=asc&pageSize=20&display=masked&account=file.json%00auth-1&tab=diagnostics&editor=alias&editorProvider=codex',
      DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE
    );

    expect(state).toMatchObject({
      view: 'oauth',
      search: 'team*',
      providerFilter: 'codex',
      statusFilter: 'problem',
      planFilter: 'pro',
      quotaBandFilter: 'lt20',
      operationalFilter: 'reauth',
      accountSort: { key: 'name', direction: 'asc' },
      pageSize: 20,
      accountDisplayMode: 'masked',
      account: 'file.json\u0000auth-1',
      detailTab: 'diagnostics',
      editor: 'alias',
      editorProvider: 'codex',
    });
  });

  it('writes only non-default workspace state and preserves unrelated query params', () => {
    const search = writeAccountsWorkspaceUrlSearch(
      '?keep=1&view=value',
      {
        ...DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE,
        view: 'quota',
        search: 'shared',
        quotaFocused: true,
        account: 'shared.json',
        detailTab: 'quota',
        editor: null,
        editorProvider: '',
      },
      DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE
    );

    expect(search).toBe('?keep=1&view=quota&search=shared&account=shared.json&tab=quota');
  });

  it('falls back safely for unsupported query values', () => {
    const state = readAccountsWorkspaceUrlState(
      '?view=invalid&status=nope&quota=bad&sort=unknown&pageSize=999&tab=nope&editor=bad',
      DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE
    );

    expect(state.view).toBe('accounts');
    expect(state.statusFilter).toBe('all');
    expect(state.quotaBandFilter).toBe('all');
    expect(state.accountSort).toEqual({ key: 'recent', direction: 'desc' });
    expect(state.pageSize).toBe(10);
    expect(state.detailTab).toBe('overview');
    expect(state.editor).toBeNull();
  });

  it('restores the persisted quota workspace when the URL does not choose a view', () => {
    const state = readAccountsWorkspaceUrlState('', {
      ...DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE,
      quotaFocused: true,
    });

    expect(state.view).toBe('quota');
    expect(state.quotaFocused).toBe(true);
  });

  it('round-trips the sort direction independently of local preferences', () => {
    const search = writeAccountsWorkspaceUrlSearch(
      '',
      {
        ...DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE,
        view: 'accounts',
        account: null,
        detailTab: 'overview',
        editor: null,
        editorProvider: '',
        accountSort: { key: 'name', direction: 'desc' },
      },
      DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE
    );
    const state = readAccountsWorkspaceUrlState(search, {
      ...DEFAULT_ACCOUNTS_WORKSPACE_UI_STATE,
      accountSort: { key: 'recent', direction: 'asc' },
    });

    expect(search).toBe('?sort=name&direction=desc');
    expect(state.accountSort).toEqual({ key: 'name', direction: 'desc' });
  });
});
