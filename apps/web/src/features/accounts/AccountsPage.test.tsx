import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import type { AuthFileItem } from '@/types';
import type { UsageHeaderSnapshot } from '@/services/api/usageService';
import { AccountsPage } from './AccountsPage';

type AnalyticsRequestForTest = {
  filters?: {
    auth_files?: string[];
    auth_indices?: string[];
  };
  include?: {
    events_page?: unknown;
  };
};

type AnalyticsResponseForTest = {
  generated_at_ms: number;
  granularity: string;
  events?: {
    items: Array<Record<string, unknown>>;
    next_before_ms: number;
    has_more: boolean;
  };
  account_stats?: unknown[];
  timeline?: unknown[];
};

type HeaderSnapshotsResponseForTest = {
  generated_at_ms: number;
  from_ms: number;
  to_ms: number;
  items: UsageHeaderSnapshot[];
};

const makeCodexFile = (name: string, authIndex: string, account: string): AuthFileItem =>
  ({
    name,
    type: 'codex',
    provider: 'codex',
    authIndex,
    account,
    priority: 0,
    disabled: false,
  }) as AuthFileItem;

const makeAnalyticsEvent = (
  overrides: Partial<Record<string, unknown>>
): Record<string, unknown> => ({
  request_id: 'req-1',
  event_hash: 'event-1',
  timestamp_ms: 1,
  model: 'gpt-5',
  endpoint: '/v1/chat/completions',
  method: 'POST',
  path: '/v1/chat/completions',
  auth_index: 'auth-1',
  source: 'codex.json',
  source_hash: 'source-hash',
  api_key_hash: 'api-key-hash',
  account_snapshot: 'codex@example.com',
  auth_label_snapshot: 'codex@example.com',
  auth_file_snapshot: 'codex.json',
  auth_provider_snapshot: 'codex',
  input_tokens: 10,
  output_tokens: 5,
  cached_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: 15,
  latency_ms: 120,
  failed: false,
  ...overrides,
});

const makeEventsResponse = (event: Record<string, unknown>): AnalyticsResponseForTest => ({
  generated_at_ms: 1,
  granularity: 'day',
  events: {
    items: [event],
    next_before_ms: 0,
    has_more: false,
  },
});

const makeEmptyAnalyticsResponse = (): AnalyticsResponseForTest => ({
  generated_at_ms: 1,
  granularity: 'day',
  account_stats: [],
  timeline: [],
});

const defaultGetAnalytics = async (
  _base: string,
  _key: string | undefined,
  request: unknown
): Promise<AnalyticsResponseForTest> => {
  const include = (request as AnalyticsRequestForTest).include;
  if (include?.events_page) {
    return makeEventsResponse(makeAnalyticsEvent({}));
  }
  return makeEmptyAnalyticsResponse();
};

const { mocks } = vi.hoisted(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const codexFile = {
    name: 'codex.json',
    type: 'codex',
    provider: 'codex',
    authIndex: 'auth-1',
    account: 'codex@example.com',
    priority: 0,
    disabled: false,
  } as AuthFileItem;

  return {
    mocks: {
      files: [codexFile] as AuthFileItem[],
      selectedFiles: new Set<string>(),
      selectionCount: 0,
      batchFieldsUpdating: false,
      navigate: vi.fn(),
      showNotification: vi.fn(),
      showConfirmation: vi.fn(),
      loadFiles: vi.fn(async () => undefined),
      toggleSelect: vi.fn(),
      selectAllVisible: vi.fn(),
      invertVisibleSelection: vi.fn(),
      deselectAll: vi.fn(),
      batchPatchFields: vi.fn(async () => ({ success: 1, failed: 0, failedNames: [] })),
      batchSetStatus: vi.fn(async () => undefined),
      batchDownload: vi.fn(async () => undefined),
      batchDelete: vi.fn(),
      loadExcluded: vi.fn(async () => undefined),
      loadModelAlias: vi.fn(async () => undefined),
      listCodexInspectionRuns: vi.fn(async () => ({ items: [] })),
      getCodexInspectionRun: vi.fn(async () => ({ run: null, results: [] })),
      getActiveQuotaCooldowns: vi.fn(async () => []),
      getAnalytics: vi.fn(
        async (_base: string, _key: string | undefined, _request: unknown): Promise<unknown> => ({
          generated_at_ms: 1,
          granularity: 'day',
          account_stats: [],
          timeline: [],
        })
      ),
      getHeaderSnapshots: vi.fn(
        async (): Promise<HeaderSnapshotsResponseForTest> => ({
          generated_at_ms: 1,
          from_ms: 0,
          to_ms: 1,
          items: [],
        })
      ),
      panelFeatureAvailability: {
        checking: false,
        managerServiceBase: 'http://manager.local:18317',
        requestMonitoringAvailable: false,
        serverCodexInspectionAvailable: false,
      },
      lastExcludedEditorProps: null as null | {
        open: boolean;
        provider?: string;
        onClose: () => void;
      },
      lastAliasEditorProps: null as null | {
        open: boolean;
        provider?: string;
        onClose: () => void;
      },
      quotaState: {
        antigravityQuota: {},
        claudeQuota: {},
        codexQuota: {},
        kimiQuota: {},
        xaiQuota: {},
        setAntigravityQuota: vi.fn(),
        setClaudeQuota: vi.fn(),
        setCodexQuota: vi.fn(),
        setKimiQuota: vi.fn(),
        setXaiQuota: vi.fn(),
      },
      t: (key: string, options?: Record<string, unknown>) => {
        if (options && typeof options.name === 'string') return `${key}:${options.name}`;
        return key;
      },
    },
  };
});

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: mocks.t,
    i18n: { language: 'en' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/useHeaderRefresh', () => ({
  useHeaderRefresh: () => {},
}));

vi.mock('@/hooks/usePanelFeatureAvailability', () => ({
  usePanelFeatureAvailability: () => mocks.panelFeatureAvailability,
}));

vi.mock('@/features/authFiles/hooks/useAuthFilesData', () => ({
  useAuthFilesData: () => ({
    files: mocks.files,
    selectedFiles: mocks.selectedFiles,
    selectionCount: mocks.selectionCount,
    loading: false,
    error: '',
    uploading: false,
    authJsonPasteSaving: false,
    deleting: {},
    batchFieldsUpdating: mocks.batchFieldsUpdating,
    fileInputRef: { current: null },
    loadFiles: mocks.loadFiles,
    handleUploadClick: vi.fn(),
    handleFileChange: vi.fn(),
    savePastedAuthJson: vi.fn(async () => 'saved.json'),
    handleDelete: vi.fn(),
    handleDownload: vi.fn(async () => undefined),
    toggleSelect: mocks.toggleSelect,
    selectAllVisible: mocks.selectAllVisible,
    invertVisibleSelection: mocks.invertVisibleSelection,
    deselectAll: mocks.deselectAll,
    batchDownload: mocks.batchDownload,
    batchSetStatus: mocks.batchSetStatus,
    batchPatchFields: mocks.batchPatchFields,
    batchDelete: mocks.batchDelete,
  }),
}));

vi.mock('@/features/authFiles/hooks/useAuthFilesOauth', () => ({
  useAuthFilesOauth: () => ({
    excluded: {},
    excludedError: null,
    modelAlias: {},
    modelAliasError: null,
    allProviderModels: {},
    providerList: ['codex'],
    loadExcluded: mocks.loadExcluded,
    loadModelAlias: mocks.loadModelAlias,
    deleteExcluded: vi.fn(),
    deleteModelAlias: vi.fn(),
    handleMappingUpdate: vi.fn(async () => undefined),
    handleDeleteLink: vi.fn(),
    handleToggleFork: vi.fn(async () => undefined),
    handleRenameAlias: vi.fn(async () => undefined),
    handleDeleteAlias: vi.fn(),
  }),
}));

vi.mock('@/features/authFiles/hooks/useAuthFilesModels', () => ({
  useAuthFilesModels: () => ({
    modelsModalOpen: false,
    modelsLoading: false,
    modelsList: [],
    modelsFileName: '',
    modelsFileType: '',
    modelsError: '',
    showModels: vi.fn(),
    closeModelsModal: vi.fn(),
  }),
}));

vi.mock('@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor', () => ({
  useAuthFilesPrefixProxyEditor: () => ({
    prefixProxyEditor: null,
    prefixProxyUpdatedText: '',
    prefixProxyDirty: false,
    openPrefixProxyEditor: vi.fn(),
    closePrefixProxyEditor: vi.fn(),
    handlePrefixProxyChange: vi.fn(),
    handlePrefixProxySave: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/features/authFiles/components/AuthJsonPasteModal', () => ({
  AuthJsonPasteModal: () => null,
}));

vi.mock('@/features/authFiles/components/AuthFileModelsModal', () => ({
  AuthFileModelsModal: () => null,
}));

vi.mock('@/features/authFiles/components/AuthFilesPrefixProxyEditorModal', () => ({
  AuthFilesPrefixProxyEditorModal: () => null,
}));

vi.mock('@/features/authFiles/components/OAuthExcludedCard', () => ({
  OAuthExcludedCard: (props: { onAdd: () => void; onEdit: (provider: string) => void }) => (
    <div>
      <button type="button" onClick={props.onAdd}>
        oauth-excluded-add
      </button>
      <button type="button" onClick={() => props.onEdit('codex')}>
        oauth-excluded-edit
      </button>
    </div>
  ),
}));

vi.mock('@/features/authFiles/components/OAuthModelAliasCard', () => ({
  OAuthModelAliasCard: (props: {
    onAdd: () => void;
    onEditProvider: (provider: string) => void;
  }) => (
    <div>
      <button type="button" onClick={props.onAdd}>
        oauth-alias-add
      </button>
      <button type="button" onClick={() => props.onEditProvider('codex')}>
        oauth-alias-edit
      </button>
    </div>
  ),
}));

vi.mock('@/features/authFiles/components/OAuthEditorModals', () => ({
  OAuthExcludedEditorModal: (props: { open: boolean; provider?: string; onClose: () => void }) => {
    mocks.lastExcludedEditorProps = props;
    return props.open ? <div>oauth-excluded-editor-open</div> : null;
  },
  OAuthModelAliasEditorModal: (props: {
    open: boolean;
    provider?: string;
    onClose: () => void;
  }) => {
    mocks.lastAliasEditorProps = props;
    return props.open ? <div>oauth-alias-editor-open</div> : null;
  },
}));

vi.mock('@/features/oauth/CodexReauthDialog', () => ({
  CodexReauthDialog: () => null,
}));

vi.mock('@/services/api', () => ({
  monitoringAnalyticsApi: {
    getAnalytics: mocks.getAnalytics,
    getHeaderSnapshots: mocks.getHeaderSnapshots,
  },
  usageServiceApi: {
    listCodexInspectionRuns: mocks.listCodexInspectionRuns,
    getCodexInspectionRun: mocks.getCodexInspectionRun,
    getActiveQuotaCooldowns: mocks.getActiveQuotaCooldowns,
  },
}));

vi.mock('@/stores', () => ({
  useNotificationStore: (
    selector?: (state: {
      showNotification: typeof mocks.showNotification;
      showConfirmation: typeof mocks.showConfirmation;
    }) => unknown
  ) => {
    const state = {
      showNotification: mocks.showNotification,
      showConfirmation: mocks.showConfirmation,
    };
    return selector ? selector(state) : state;
  },
  useAuthStore: (
    selector: (state: { connectionStatus: 'connected'; managementKey: string }) => unknown
  ) => selector({ connectionStatus: 'connected', managementKey: 'manager-key' }),
  useQuotaStore: (
    selector: (state: {
      antigravityQuota: Record<string, never>;
      claudeQuota: Record<string, never>;
      codexQuota: Record<string, never>;
      kimiQuota: Record<string, never>;
      xaiQuota: Record<string, never>;
      setAntigravityQuota: () => void;
      setClaudeQuota: () => void;
      setCodexQuota: () => void;
      setKimiQuota: () => void;
      setXaiQuota: () => void;
    }) => unknown
  ) => selector(mocks.quotaState),
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn(async () => true),
}));

const readText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readText).join('');
  if (isValidElement<{ children?: unknown }>(value)) return readText(value.props.children);
  if (value && typeof value === 'object' && 'children' in value) {
    return readText((value as { children?: unknown }).children);
  }
  return '';
};

const findButtonByText = (renderer: ReactTestRenderer, text: string) => {
  const button = renderer.root
    .findAllByType(Button)
    .find((node) => readText(node.props.children).includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
};

const findHostButtonByText = (renderer: ReactTestRenderer, text: string) => {
  const button = renderer.root
    .findAll((node) => node.type === 'button')
    .find((node) => readText(node.props.children).includes(text));
  if (!button) throw new Error(`Host button not found: ${text}`);
  return button;
};

const findHostButtonByAriaLabel = (renderer: ReactTestRenderer, label: string) => {
  const button = renderer.root
    .findAll((node) => node.type === 'button')
    .find((node) => node.props['aria-label'] === label);
  if (!button) throw new Error(`Host button not found: ${label}`);
  return button;
};

const findBatchMoreItem = (renderer: ReactTestRenderer, key: string) => {
  const batchMoreMenu = renderer.root
    .findAllByType(DropdownMenu)
    .find((node) => node.props.ariaLabel === 'accounts.batch_more');
  const item = batchMoreMenu?.props.items.find((entry: { key?: string }) => entry.key === key);
  if (!item || item.type === 'divider') throw new Error(`Batch menu item not found: ${key}`);
  return item;
};

const findInputByAriaLabel = (renderer: ReactTestRenderer, label: string) => {
  const input = renderer.root
    .findAll((node) => node.type === 'input')
    .find((node) => node.props['aria-label'] === label);
  if (!input) throw new Error(`Input not found: ${label}`);
  return input;
};

const renderAccountsPage = async () => {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(<AccountsPage />);
    await Promise.resolve();
  });
  return renderer!;
};

const findDetailButtonByName = (renderer: ReactTestRenderer, fileName: string) => {
  const button = renderer.root
    .findAll((node) => node.type === 'button')
    .find((node) => node.props['aria-label'] === `accounts.open_detail:${fileName}`);
  if (!button) throw new Error(`Detail button not found: ${fileName}`);
  return button;
};

const getAccountTableRowTexts = (renderer: ReactTestRenderer) => {
  const table = renderer.root.findByType('table');
  const body = table.findByType('tbody');
  return body.findAllByType('tr').map((row) => readText(row));
};

const getAccountListItemTexts = (renderer: ReactTestRenderer) => {
  const cards = renderer.root.findAll(
    (node) => node.type === 'article' && typeof node.props['data-account-card'] === 'string'
  );
  if (cards.length > 0) return cards.map((row) => readText(row));
  return getAccountTableRowTexts(renderer);
};

const treeText = (renderer: ReactTestRenderer) => readText(renderer.toJSON());

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe('AccountsPage replacement flows', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear();
    mocks.files = [makeCodexFile('codex.json', 'auth-1', 'codex@example.com')];
    mocks.selectedFiles = new Set<string>();
    mocks.selectionCount = 0;
    mocks.batchFieldsUpdating = false;
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: false,
      serverCodexInspectionAvailable: false,
    };
    mocks.navigate.mockClear();
    mocks.showNotification.mockClear();
    mocks.toggleSelect.mockClear();
    mocks.selectAllVisible.mockClear();
    mocks.invertVisibleSelection.mockClear();
    mocks.deselectAll.mockClear();
    mocks.batchPatchFields.mockClear();
    mocks.batchDelete.mockClear();
    mocks.getAnalytics.mockReset();
    mocks.getAnalytics.mockImplementation(defaultGetAnalytics);
    mocks.getHeaderSnapshots.mockReset();
    mocks.getHeaderSnapshots.mockResolvedValue({
      generated_at_ms: 1,
      from_ms: 0,
      to_ms: 1,
      items: [],
    });
    mocks.loadFiles.mockClear();
    mocks.loadExcluded.mockClear();
    mocks.loadModelAlias.mockClear();
    mocks.lastExcludedEditorProps = null;
    mocks.lastAliasEditorProps = null;
  });

  it('opens OAuth editors inline instead of navigating to auth-files routes', async () => {
    const renderer = await renderAccountsPage();

    await act(async () => {
      findHostButtonByText(renderer, 'accounts.tab_oauth').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'oauth-excluded-add').props.onClick();
    });

    expect(mocks.navigate).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth-files/oauth-excluded'),
      expect.anything()
    );
    expect(mocks.lastExcludedEditorProps?.open).toBe(true);
    expect(mocks.lastExcludedEditorProps?.provider).toBe('');

    await act(async () => {
      findHostButtonByText(renderer, 'oauth-alias-edit').props.onClick();
    });

    expect(mocks.navigate).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth-files/oauth-model-alias'),
      expect.anything()
    );
    expect(mocks.lastAliasEditorProps?.open).toBe(true);
    expect(mocks.lastAliasEditorProps?.provider).toBe('codex');
  });

  it('patches Codex websockets through auth-index aware batch fields', async () => {
    mocks.selectedFiles = new Set(['codex.json\u0000auth-1']);
    mocks.selectionCount = 1;
    const renderer = await renderAccountsPage();

    await act(async () => {
      await findBatchMoreItem(renderer, 'websockets-enable').onClick();
    });

    expect(mocks.batchPatchFields).toHaveBeenCalledWith(
      [{ name: 'codex.json', authIndex: 'auth-1' }],
      { websockets: true }
    );
  });

  it('disables batch delete for partial shared auth-file selections', async () => {
    mocks.files = [
      makeCodexFile('shared-codex.json', 'auth-1', 'first@example.com'),
      makeCodexFile('shared-codex.json', 'auth-2', 'second@example.com'),
    ];
    mocks.selectedFiles = new Set(['shared-codex.json\u0000auth-1']);
    mocks.selectionCount = 1;

    const renderer = await renderAccountsPage();
    const batchMoreMenu = renderer.root
      .findAllByType(DropdownMenu)
      .find((node) => node.props.ariaLabel === 'accounts.batch_more');
    const deleteItem = batchMoreMenu?.props.items.find(
      (item: { key?: string }) => item.key === 'delete'
    );

    expect(deleteItem?.disabled).toBe(true);

    await act(async () => {
      deleteItem?.onClick?.();
    });

    expect(mocks.batchDelete).not.toHaveBeenCalled();
  });

  it('uses unique table row keys for shared auth accounts', async () => {
    mocks.files = [
      makeCodexFile('shared-codex.json', 'auth-1', 'first@example.com'),
      makeCodexFile('shared-codex.json', 'auth-2', 'second@example.com'),
    ];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await renderAccountsPage();
      const duplicateKeyWarning = errorSpy.mock.calls.some((call) =>
        call.some(
          (item) =>
            typeof item === 'string' && item.includes('Encountered two children with the same key')
        )
      );
      expect(duplicateKeyWarning).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('sorts account cards from the toolbar sort control', async () => {
    mocks.files = [
      {
        ...makeCodexFile('low.json', 'auth-low', 'low@example.com'),
        priority: -1,
        recent_requests: [{ success: 1, failed: 0 }],
      },
      {
        ...makeCodexFile('middle.json', 'auth-middle', 'middle@example.com'),
        priority: 2,
        recent_requests: [{ success: 3, failed: 2 }],
      },
      {
        ...makeCodexFile('high.json', 'auth-high', 'high@example.com'),
        priority: 10,
        recent_requests: [{ success: 2, failed: 1 }],
      },
    ];

    const renderer = await renderAccountsPage();

    await act(async () => {
      findHostButtonByAriaLabel(
        renderer,
        'accounts.sort_label: accounts.sort_default'
      ).props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.col_priority').props.onClick();
    });

    expect(getAccountListItemTexts(renderer)[0]).toContain('high.json');

    await act(async () => {
      findHostButtonByAriaLabel(
        renderer,
        'accounts.sort_label: accounts.col_priority'
      ).props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.col_recent').props.onClick();
    });

    expect(getAccountListItemTexts(renderer)[0]).toContain('middle.json');
  });

  it('keeps the accounts view in card mode without table controls', async () => {
    mocks.files = [
      {
        ...makeCodexFile('low.json', 'auth-low', 'low@example.com'),
        priority: -1,
        recent_requests: [{ success: 1, failed: 0 }],
      },
      {
        ...makeCodexFile('high.json', 'auth-high', 'high@example.com'),
        priority: 10,
        recent_requests: [{ success: 2, failed: 1 }],
      },
    ];

    const renderer = await renderAccountsPage();

    expect(renderer.root.findAllByType('table')).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node) => node.type === 'article' && typeof node.props['data-account-card'] === 'string'
      )
    ).toHaveLength(2);
    expect(
      renderer.root.findAll(
        (node) =>
          typeof node.props['aria-label'] === 'string' &&
          node.props['aria-label'].startsWith('accounts.select_account:')
      )
    ).toHaveLength(0);
    expect(getAccountListItemTexts(renderer).join('\n')).toContain('high.json');
    expect(() => findHostButtonByText(renderer, 'accounts.view_mode_table')).toThrow();
  });

  it('selects account cards by row click while selection mode is active', async () => {
    const renderer = await renderAccountsPage();

    await act(async () => {
      findHostButtonByText(renderer, 'accounts.selection_mode_enter').props.onClick();
    });

    const card = renderer.root.findByProps({ 'data-account-card': 'codex.json\u0000auth-1' });
    await act(async () => {
      card.props.onClick();
    });

    expect(mocks.toggleSelect).toHaveBeenCalledWith('codex.json\u0000auth-1');
  });

  it('keeps auth-file selection helpers in accounts selection mode', async () => {
    mocks.files = [
      makeCodexFile('codex-page.json', 'auth-1', 'page@example.com'),
      makeCodexFile('codex-filtered.json', 'auth-2', 'filtered@example.com'),
    ];
    const renderer = await renderAccountsPage();

    await act(async () => {
      findHostButtonByText(renderer, 'accounts.selection_mode_enter').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'auth_files.batch_select_page').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'auth_files.batch_select_filtered').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'auth_files.batch_invert_page').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'auth_files.batch_deselect').props.onClick();
    });

    expect(mocks.selectAllVisible).toHaveBeenCalledTimes(2);
    expect(
      mocks.selectAllVisible.mock.calls[0][0].map((item: AuthFileItem) => item.name).sort()
    ).toEqual(['codex-filtered.json', 'codex-page.json']);
    expect(
      mocks.selectAllVisible.mock.calls[1][0].map((item: AuthFileItem) => item.name).sort()
    ).toEqual(['codex-filtered.json', 'codex-page.json']);
    expect(mocks.invertVisibleSelection).toHaveBeenCalledTimes(1);
    expect(mocks.deselectAll).toHaveBeenCalledTimes(1);
  });

  it('renders account health from auth-file card health data instead of monitoring stats', async () => {
    mocks.files = [
      {
        ...makeCodexFile('healthy.json', 'auth-1', 'healthy@example.com'),
        success: 87,
        failed: 3,
        recent_requests: [{ success: 128, failed: 0 }],
      },
    ];
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    mocks.getAnalytics.mockResolvedValue({
      generated_at_ms: 1,
      granularity: 'day',
      account_stats: [
        {
          id: 'healthy-monitoring',
          account_snapshot: 'healthy@example.com',
          auth_label_snapshot: 'healthy@example.com',
          auth_provider_snapshot: 'codex',
          auth_indices: ['auth-1'],
          sources: ['healthy.json'],
          calls: 999,
          success_rate: 0.01,
          input_tokens: 0,
          output_tokens: 0,
          cost: 0,
          last_seen_ms: 1,
        },
      ],
      timeline: [],
    });

    const renderer = await renderAccountsPage();
    const cardText = getAccountListItemTexts(renderer).join('\n');

    expect(cardText).toContain('stats.success 87');
    expect(cardText).toContain('stats.failure 3');
    expect(cardText).toContain('auth_files.health_status_label');
    expect(cardText).toContain('100%');
    expect(cardText).not.toContain('accounts.activity_success_failure');
    expect(cardText).not.toContain('999');
  });

  it('renders the mobile filters entrypoint in the accounts toolbar', async () => {
    const renderer = await renderAccountsPage();

    expect(treeText(renderer)).toContain('accounts.mobile_filters_button');
    expect(treeText(renderer)).toContain('accounts.mobile_filters_default');

    await act(async () => {
      findButtonByText(renderer, 'accounts.mobile_filters_button').props.onClick();
    });
  });

  it('searches and renders diagnostic-only Codex usage header snapshots', async () => {
    mocks.files = [
      makeCodexFile('codex-diagnostic.json', 'auth-1', 'diagnostic@example.com'),
      makeCodexFile('codex-other.json', 'auth-2', 'other@example.com'),
    ];
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    mocks.getHeaderSnapshots.mockResolvedValue({
      generated_at_ms: 1,
      from_ms: 0,
      to_ms: 1,
      items: [
        {
          event_hash: 'diagnostic-only',
          timestamp_ms: 1700000000000,
          auth_file_snapshot: 'codex-diagnostic.json',
          auth_index: 'auth-1',
          account_snapshot: 'diagnostic@example.com',
          auth_provider_snapshot: 'codex',
          header_trace_id: 'trace-diagnostic-only',
          header_error_kind: 'rate_limit',
          header_error_code: 'usage_limit_reached',
        },
      ],
    });

    const renderer = await renderAccountsPage();

    await act(async () => {
      findInputByAriaLabel(renderer, 'accounts.search_label').props.onChange({
        target: { value: 'trace-diagnostic-only' },
      });
    });

    const rowTexts = getAccountListItemTexts(renderer);
    expect(rowTexts).toHaveLength(1);
    expect(rowTexts[0]).toContain('codex-diagnostic.json');

    await act(async () => {
      findDetailButtonByName(renderer, 'codex-diagnostic.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_quota').props.onClick();
    });

    expect(treeText(renderer)).toContain('accounts.quota_source_observed_header');
    expect(treeText(renderer)).toContain('trace-diagnostic-only');
    expect(treeText(renderer)).toContain('usage_limit_reached');
  });

  it('loads detail events filtered by auth file and auth index', async () => {
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    const renderer = await renderAccountsPage();
    mocks.getAnalytics.mockClear();

    const detailButton = renderer.root
      .findAll((node) => node.type === 'button')
      .find(
        (node) =>
          typeof node.props['aria-label'] === 'string' &&
          node.props['aria-label'].startsWith('accounts.open_detail:')
      );
    if (!detailButton) throw new Error('Detail button not found');

    await act(async () => {
      detailButton.props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_events').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    const eventRequest = mocks.getAnalytics.mock.calls
      .map((call) => call[2] as AnalyticsRequestForTest)
      .find((request) => request.include?.events_page);

    expect(eventRequest?.filters).toEqual({
      auth_files: ['codex.json'],
      auth_indices: ['auth-1'],
    });
    expect(eventRequest?.include?.events_page).toMatchObject({ limit: 20 });
  });

  it('ignores stale detail-event responses after switching rows', async () => {
    mocks.files = [
      makeCodexFile('codex-a.json', 'auth-a', 'first@example.com'),
      makeCodexFile('codex-b.json', 'auth-b', 'second@example.com'),
    ];
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };

    const firstEvents = createDeferred<AnalyticsResponseForTest>();
    const secondEvents = createDeferred<AnalyticsResponseForTest>();
    mocks.getAnalytics.mockImplementation(
      async (_base: string, _key: string | undefined, request: unknown) => {
        const analyticsRequest = request as AnalyticsRequestForTest;
        if (!analyticsRequest.include?.events_page) {
          return makeEmptyAnalyticsResponse();
        }
        const fileName = analyticsRequest.filters?.auth_files?.[0];
        if (fileName === 'codex-a.json') return firstEvents.promise;
        if (fileName === 'codex-b.json') return secondEvents.promise;
        return makeEventsResponse(makeAnalyticsEvent({}));
      }
    );

    const renderer = await renderAccountsPage();
    mocks.getAnalytics.mockClear();

    await act(async () => {
      findDetailButtonByName(renderer, 'codex-a.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_events').props.onClick();
      await Promise.resolve();
    });
    await act(async () => {
      findDetailButtonByName(renderer, 'codex-b.json').props.onClick();
      await Promise.resolve();
    });

    await act(async () => {
      secondEvents.resolve(
        makeEventsResponse(
          makeAnalyticsEvent({
            request_id: 'req-second',
            event_hash: 'event-second',
            auth_index: 'auth-b',
            source: 'codex-b.json',
          })
        )
      );
      await Promise.resolve();
    });

    expect(treeText(renderer)).toContain('req-second');

    await act(async () => {
      firstEvents.resolve(
        makeEventsResponse(
          makeAnalyticsEvent({
            request_id: 'req-first',
            event_hash: 'event-first',
            auth_index: 'auth-a',
            source: 'codex-a.json',
          })
        )
      );
      await Promise.resolve();
    });

    expect(treeText(renderer)).toContain('req-second');
    expect(treeText(renderer)).not.toContain('req-first');
  });
});
