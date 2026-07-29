import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import type { AuthFileItem } from '@/types';
import type {
  CodexInspectionResult,
  CodexInspectionRun,
  UsageHeaderSnapshot,
} from '@/services/api/usageService';
import { copyToClipboard } from '@/utils/clipboard';
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
    next_before_id?: number;
    has_more: boolean;
    total_count?: number;
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

type AccountHistoryResponseForTest = {
  generated_at_ms: number;
  checkpoint: {
    last_event_id: number;
    latest_id: number;
    pending: boolean;
    processed: number;
  };
  items: Array<{
    account_key: string;
    matched: boolean;
    total_requests: number;
    success_calls: number;
    failure_calls: number;
    total_tokens: number;
    total_cost: number;
    success_rate: number | null;
    first_seen_ms: number | null;
    last_seen_ms: number | null;
    latest_request?: {
      timestamp_ms: number;
      failed: boolean;
      fail_status_code?: number | null;
      fail_summary?: string;
      header_error_kind?: string;
      header_error_code?: string;
      header_trace_id?: string;
    } | null;
    recent_requests?: Array<{
      timestamp_ms: number;
      failed: boolean;
      fail_status_code?: number | null;
      fail_summary?: string;
      header_error_kind?: string;
      header_error_code?: string;
      header_trace_id?: string;
    }>;
    sync_status: string;
  }>;
};

type AccountHistoryRequestForTest = {
  accounts: unknown[];
  catch_up?: boolean;
};

type AccountWindowUsageResponseForTest = {
  generated_at_ms: number;
  items: Array<{
    row_key: string;
    window_key: string;
    from_ms: number;
    to_ms: number;
    matched: boolean;
    total_requests: number;
    success_calls: number;
    failure_calls: number;
    total_tokens: number;
    total_cost: number;
    success_rate: number | null;
    last_seen_ms: number | null;
    sync_status: string;
  }>;
};

type AccountWindowUsageRequestForTest = {
  windows: unknown[];
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

const makeAccountHistoryResponse = (
  items: AccountHistoryResponseForTest['items']
): AccountHistoryResponseForTest => ({
  generated_at_ms: 1,
  checkpoint: {
    last_event_id: 1,
    latest_id: 1,
    pending: false,
    processed: 0,
  },
  items,
});

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
      location: { pathname: '/accounts', search: '' },
      apiBase: 'http://cpa-a.local:8317',
      managementKey: 'manager-key',
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
      handleDelete: vi.fn(),
      handleDownload: vi.fn(async () => undefined),
      showModels: vi.fn(async () => undefined),
      loadExcluded: vi.fn(async () => undefined),
      loadModelAlias: vi.fn(async () => undefined),
      listCodexInspectionRuns: vi.fn(
        async (): Promise<{ items: CodexInspectionRun[] }> => ({ items: [] })
      ),
      getCodexInspectionRun: vi.fn(
        async (): Promise<{
          run: CodexInspectionRun | null;
          results: CodexInspectionResult[];
        }> => ({ run: null, results: [] })
      ),
      getActiveQuotaCooldowns: vi.fn(async () => []),
      listAccountActionCandidates: vi.fn(async () => ({ items: [], pendingCount: 0 })),
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
      getAccountHistory: vi.fn(
        async (
          _base: string,
          _managementKey: string | undefined,
          _request: AccountHistoryRequestForTest
        ): Promise<AccountHistoryResponseForTest> => ({
          generated_at_ms: 1,
          checkpoint: {
            last_event_id: 1,
            latest_id: 1,
            pending: false,
            processed: 0,
          },
          items: [],
        })
      ),
      getAccountWindowUsage: vi.fn(
        async (
          _base: string,
          _managementKey: string | undefined,
          _request: AccountWindowUsageRequestForTest
        ): Promise<AccountWindowUsageResponseForTest> => ({
          generated_at_ms: 1,
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
      localInspection: null as null | Record<string, unknown>,
      lastHealthWorkspaceProps: null as null | {
        mode: 'local' | 'server';
        onModeChange: (mode: 'local' | 'server') => void;
        onOpenCredential: (target: { fileName: string; authIndex: string | null }) => void;
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
  useLocation: () => mocks.location,
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
    deleting: null,
    batchFieldsUpdating: mocks.batchFieldsUpdating,
    fileInputRef: { current: null },
    loadFiles: mocks.loadFiles,
    handleUploadClick: vi.fn(),
    handleFileChange: vi.fn(),
    savePastedAuthJson: vi.fn(async () => 'saved.json'),
    handleDelete: mocks.handleDelete,
    handleDownload: mocks.handleDownload,
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
    excludedError: 'ready',
    modelAlias: {},
    modelAliasError: 'ready',
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
    modelsLoading: false,
    modelsList: [],
    modelsFileName: '',
    modelsFileType: '',
    modelsError: '',
    showModels: mocks.showModels,
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

vi.mock('@/features/accounts/hooks/useAccountCredentialSafeSummary', () => ({
  useAccountCredentialSafeSummary: () => ({
    fileName: '',
    loading: false,
    error: '',
    summary: null,
    reload: vi.fn(async () => undefined),
    invalidate: vi.fn(),
  }),
}));

vi.mock('@/features/monitoring/components/CredentialHealthInspectionWorkspace', () => ({
  CredentialHealthInspectionWorkspace: (props: {
    mode: 'local' | 'server';
    onModeChange: (mode: 'local' | 'server') => void;
    onOpenCredential: (target: { fileName: string; authIndex: string | null }) => void;
  }) => {
    mocks.lastHealthWorkspaceProps = props;
    return <div data-testid="credential-health-workspace">credential-health:{props.mode}</div>;
  },
}));

vi.mock('@/features/monitoring/codexInspection', () => ({
  createCodexInspectionConnectionFingerprint: (apiBase: string, managementKey: string) =>
    `${apiBase}:${managementKey}`,
  loadCodexInspectionLastRun: () => mocks.localInspection,
}));

vi.mock('@/features/authFiles/components/AuthJsonPasteModal', () => ({
  AuthJsonPasteModal: () => null,
}));

vi.mock('@/features/authFiles/components/AuthFileModelsModal', () => ({
  AuthFileModelsContent: () => <div>models-content</div>,
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
    getAccountHistory: mocks.getAccountHistory,
    getAccountWindowUsage: mocks.getAccountWindowUsage,
  },
  usageServiceApi: {
    listCodexInspectionRuns: mocks.listCodexInspectionRuns,
    getCodexInspectionRun: mocks.getCodexInspectionRun,
    getActiveQuotaCooldowns: mocks.getActiveQuotaCooldowns,
    listAccountActionCandidates: mocks.listAccountActionCandidates,
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
    selector: (state: {
      apiBase: string;
      connectionStatus: 'connected';
      managementKey: string;
    }) => unknown
  ) =>
    selector({
      apiBase: mocks.apiBase,
      connectionStatus: 'connected',
      managementKey: mocks.managementKey,
    }),
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
  useThemeStore: (selector: (state: { resolvedTheme: 'light' | 'dark' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
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

const findAccountCardByKey = (renderer: ReactTestRenderer, selectionKey: string) =>
  renderer.root.findByProps({ 'data-account-card': selectionKey });

const findAccountCardButtonByAriaLabel = (
  renderer: ReactTestRenderer,
  selectionKey: string,
  label: string
) => {
  const card = findAccountCardByKey(renderer, selectionKey);
  const button = card
    .findAll((node) => node.type === 'button')
    .find((node) => node.props['aria-label'] === label);
  if (!button) throw new Error(`Card button not found: ${label}`);
  return button;
};

const findAccountCardInputByAriaLabel = (
  renderer: ReactTestRenderer,
  selectionKey: string,
  label: string
) => {
  const card = findAccountCardByKey(renderer, selectionKey);
  const input = card
    .findAll((node) => node.type === 'input')
    .find((node) => node.props['aria-label'] === label);
  if (!input) throw new Error(`Card input not found: ${label}`);
  return input;
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

const findAncestorByType = (node: ReactTestInstance, type: string): ReactTestInstance => {
  let current = node.parent;
  while (current) {
    if (current.type === type) return current;
    current = current.parent;
  }
  throw new Error(`Ancestor not found: ${type}`);
};

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('AccountsPage replacement flows', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      window.location.hash = '';
    }
    mocks.files = [makeCodexFile('codex.json', 'auth-1', 'codex@example.com')];
    mocks.selectedFiles = new Set<string>();
    mocks.selectionCount = 0;
    mocks.batchFieldsUpdating = false;
    mocks.location = { pathname: '/accounts', search: '' };
    mocks.apiBase = 'http://cpa-a.local:8317';
    mocks.managementKey = 'manager-key';
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: false,
      serverCodexInspectionAvailable: false,
    };
    mocks.navigate.mockClear();
    mocks.showNotification.mockClear();
    mocks.showConfirmation.mockClear();
    mocks.toggleSelect.mockClear();
    mocks.selectAllVisible.mockClear();
    mocks.invertVisibleSelection.mockClear();
    mocks.deselectAll.mockClear();
    mocks.batchSetStatus.mockClear();
    mocks.batchPatchFields.mockClear();
    mocks.batchDelete.mockClear();
    mocks.handleDelete.mockClear();
    mocks.handleDownload.mockClear();
    mocks.showModels.mockClear();
    vi.mocked(copyToClipboard).mockClear();
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    mocks.getAnalytics.mockReset();
    mocks.getAnalytics.mockImplementation(defaultGetAnalytics);
    mocks.getHeaderSnapshots.mockReset();
    mocks.getHeaderSnapshots.mockResolvedValue({
      generated_at_ms: 1,
      from_ms: 0,
      to_ms: 1,
      items: [],
    });
    mocks.getAccountHistory.mockReset();
    mocks.getAccountHistory.mockResolvedValue(makeAccountHistoryResponse([]));
    mocks.getAccountWindowUsage.mockReset();
    mocks.getAccountWindowUsage.mockResolvedValue({ generated_at_ms: 1, items: [] });
    mocks.listCodexInspectionRuns.mockReset();
    mocks.listCodexInspectionRuns.mockResolvedValue({ items: [] });
    mocks.getCodexInspectionRun.mockReset();
    mocks.getCodexInspectionRun.mockResolvedValue({ run: null, results: [] });
    mocks.getActiveQuotaCooldowns.mockReset();
    mocks.getActiveQuotaCooldowns.mockResolvedValue([]);
    mocks.listAccountActionCandidates.mockReset();
    mocks.listAccountActionCandidates.mockResolvedValue({ items: [], pendingCount: 0 });
    mocks.quotaState.antigravityQuota = {};
    mocks.quotaState.claudeQuota = {};
    mocks.quotaState.codexQuota = {};
    mocks.quotaState.kimiQuota = {};
    mocks.quotaState.xaiQuota = {};
    mocks.quotaState.setAntigravityQuota.mockClear();
    mocks.quotaState.setClaudeQuota.mockClear();
    mocks.quotaState.setCodexQuota.mockClear();
    mocks.quotaState.setKimiQuota.mockClear();
    mocks.quotaState.setXaiQuota.mockClear();
    mocks.loadFiles.mockClear();
    mocks.loadExcluded.mockClear();
    mocks.loadModelAlias.mockClear();
    mocks.lastExcludedEditorProps = null;
    mocks.lastAliasEditorProps = null;
    mocks.lastHealthWorkspaceProps = null;
    mocks.localInspection = null;
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

  it('initializes the active view from the accounts view query', async () => {
    mocks.location = { pathname: '/accounts', search: '?view=oauth' };

    const renderer = await renderAccountsPage();

    expect(treeText(renderer)).toContain('oauth-excluded-add');
    expect(findHostButtonByText(renderer, 'accounts.tab_oauth').props['aria-selected']).toBe(true);
  });

  it('opens OAuth editors from a deep link', async () => {
    mocks.location = {
      pathname: '/accounts',
      search: '?view=oauth&editor=excluded&editorProvider=codex',
    };

    const renderer = await renderAccountsPage();

    expect(treeText(renderer)).toContain('oauth-excluded-editor-open');
    expect(mocks.lastExcludedEditorProps?.provider).toBe('codex');
  });

  it('restores filters and account detail tabs from the URL', async () => {
    mocks.files = [
      makeCodexFile('codex.json', 'auth-1', 'codex@example.com'),
      {
        name: 'xai.json',
        type: 'xai',
        provider: 'xai',
        account: 'xai@example.com',
        disabled: false,
      } as AuthFileItem,
    ];
    mocks.location = {
      pathname: '/accounts',
      search: '?provider=codex&account=codex.json%00auth-1&tab=quota',
    };

    const renderer = await renderAccountsPage();

    expect(
      renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
    ).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-account-card': 'xai.json\u0000-' })).toHaveLength(
      0
    );
    expect(findHostButtonByText(renderer, 'accounts.detail_tab_quota').props['aria-selected']).toBe(
      true
    );
    expect(
      renderer.root.findByProps({ id: 'accounts-provider-filter-codex' }).props['aria-selected']
    ).toBe(true);
  });

  it('filters credential rows through platform tabs without rendering a duplicate selector', async () => {
    mocks.files = [
      makeCodexFile('codex.json', 'auth-1', 'codex@example.com'),
      {
        name: 'xai.json',
        type: 'xai',
        provider: 'xai',
        account: 'xai@example.com',
        disabled: false,
      } as AuthFileItem,
    ];

    const renderer = await renderAccountsPage();
    const platformControls = renderer.root.findAll(
      (node) => node.props['aria-label'] === 'accounts.provider_filter'
    );

    expect(platformControls).toHaveLength(1);
    expect(platformControls[0]?.props.role).toBe('tablist');

    await act(async () => {
      renderer.root
        .findByProps({ id: 'accounts-provider-filter-xai' })
        .props.onClick({ preventDefault: () => {} });
      await Promise.resolve();
    });

    expect(
      renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
    ).toHaveLength(0);
    expect(renderer.root.findAllByProps({ 'data-account-card': 'xai.json\u0000-' })).toHaveLength(
      1
    );
    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: '/accounts', search: '?provider=xai' },
      { replace: true }
    );
  });

  it('removes an account deep link after files load without a matching account', async () => {
    mocks.location = {
      pathname: '/accounts',
      search: '?account=missing.json%00auth-9&tab=diagnostics',
    };

    await renderAccountsPage();
    await flushPromises();

    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: '/accounts', search: '' },
      { replace: true }
    );
  });

  it('resets omitted filters to defaults during later browser navigation', async () => {
    mocks.location = { pathname: '/accounts', search: '?provider=codex' };
    mocks.files = [
      makeCodexFile('codex.json', 'auth-1', 'codex@example.com'),
      {
        name: 'xai.json',
        type: 'xai',
        provider: 'xai',
        account: 'xai@example.com',
        disabled: false,
      } as AuthFileItem,
    ];
    const renderer = await renderAccountsPage();

    expect(
      renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
    ).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-account-card': 'xai.json\u0000-' })).toHaveLength(
      0
    );

    mocks.location = { pathname: '/accounts', search: '?provider=xai' };
    await act(async () => {
      renderer.update(<AccountsPage />);
      await Promise.resolve();
    });
    expect(
      renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
    ).toHaveLength(0);
    expect(renderer.root.findAllByProps({ 'data-account-card': 'xai.json\u0000-' })).toHaveLength(
      1
    );

    mocks.location = { pathname: '/accounts', search: '' };
    await act(async () => {
      renderer.update(<AccountsPage />);
      await Promise.resolve();
    });
    expect(
      renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
    ).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-account-card': 'xai.json\u0000-' })).toHaveLength(
      1
    );
  });

  it('resets omitted filters when the hash changes outside React Router navigation', async () => {
    const windowEvents = new EventTarget();
    const location = { hash: '#/accounts?provider=codex' };
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      location,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    });
    mocks.location = { pathname: '/accounts', search: '?provider=codex' };
    mocks.files = [
      makeCodexFile('codex.json', 'auth-1', 'codex@example.com'),
      {
        name: 'xai.json',
        type: 'xai',
        provider: 'xai',
        account: 'xai@example.com',
        disabled: false,
      } as AuthFileItem,
    ];
    const renderer = await renderAccountsPage();

    expect(
      renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
    ).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-account-card': 'xai.json\u0000-' })).toHaveLength(
      0
    );

    try {
      await act(async () => {
        location.hash = '#/accounts';
        windowEvents.dispatchEvent(new Event('hashchange'));
        await Promise.resolve();
      });

      expect(
        renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
      ).toHaveLength(1);
      expect(renderer.root.findAllByProps({ 'data-account-card': 'xai.json\u0000-' })).toHaveLength(
        1
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the initial credential list load free of unrelated background requests', async () => {
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: true,
    };

    await renderAccountsPage();
    await flushPromises();

    expect(mocks.loadFiles).toHaveBeenCalledTimes(1);
    expect(mocks.getAccountHistory).toHaveBeenCalledTimes(1);
    expect(mocks.getActiveQuotaCooldowns).not.toHaveBeenCalled();
    expect(mocks.getHeaderSnapshots).not.toHaveBeenCalled();
    expect(mocks.listAccountActionCandidates).not.toHaveBeenCalled();
    expect(mocks.listCodexInspectionRuns).not.toHaveBeenCalled();
    expect(mocks.getCodexInspectionRun).not.toHaveBeenCalled();
    expect(mocks.loadExcluded).not.toHaveBeenCalled();
    expect(mocks.loadModelAlias).not.toHaveBeenCalled();
    expect(mocks.getAnalytics).not.toHaveBeenCalled();
    expect(mocks.getAccountWindowUsage).not.toHaveBeenCalled();
  });

  it('updates the accounts view query when switching views', async () => {
    const renderer = await renderAccountsPage();

    await act(async () => {
      findHostButtonByText(renderer, 'accounts.tab_health').props.onClick();
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: '/accounts', search: '?view=health&healthMode=local' },
      { replace: false }
    );
  });

  it('keeps credential list filters outside the workspace navigation panel', async () => {
    const renderer = await renderAccountsPage();
    const tabs = renderer.root.find((node) => node.props['aria-label'] === 'accounts.tabs_label');
    const navigationPanel = findAncestorByType(tabs, 'section');

    expect(
      navigationPanel.findAll(
        (node) => node.type === 'input' && node.props['aria-label'] === 'accounts.search_label'
      )
    ).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node) => node.type === 'input' && node.props['aria-label'] === 'accounts.search_label'
      )
    ).toHaveLength(1);
  });

  it('keeps the credential health mode in the Accounts URL', async () => {
    mocks.location = { pathname: '/accounts', search: '?view=health&healthMode=local' };
    await renderAccountsPage();

    expect(mocks.lastHealthWorkspaceProps?.mode).toBe('local');
    mocks.navigate.mockClear();

    await act(async () => {
      mocks.lastHealthWorkspaceProps?.onModeChange('server');
      await Promise.resolve();
    });

    expect(mocks.lastHealthWorkspaceProps?.mode).toBe('server');
    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: '/accounts', search: '?view=health&healthMode=server' },
      { replace: true }
    );
  });

  it('keeps syncing health mode after React Router and hashchange apply the same URL', async () => {
    const windowEvents = new EventTarget();
    const location = { hash: '#/accounts?view=health&healthMode=local' };
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      location,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    });
    mocks.location = { pathname: '/accounts', search: '?view=health&healthMode=local' };
    const renderer = await renderAccountsPage();

    try {
      await act(async () => {
        mocks.lastHealthWorkspaceProps?.onModeChange('server');
        await Promise.resolve();
      });

      mocks.location = { pathname: '/accounts', search: '?view=health&healthMode=server' };
      location.hash = '#/accounts?view=health&healthMode=server';
      await act(async () => {
        renderer.update(<AccountsPage />);
        await Promise.resolve();
      });
      await act(async () => {
        windowEvents.dispatchEvent(new Event('hashchange'));
        await Promise.resolve();
      });
      mocks.navigate.mockClear();

      await act(async () => {
        mocks.lastHealthWorkspaceProps?.onModeChange('local');
        await Promise.resolve();
      });

      expect(mocks.navigate).toHaveBeenCalledWith(
        { pathname: '/accounts', search: '?view=health&healthMode=local' },
        { replace: true }
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens the exact shared credential from an inspection result', async () => {
    mocks.files = [
      makeCodexFile('shared-codex.json', 'auth-1', 'first@example.com'),
      makeCodexFile('shared-codex.json', 'auth-2', 'second@example.com'),
    ];
    mocks.location = { pathname: '/accounts', search: '?view=health&healthMode=local' };
    await renderAccountsPage();
    const healthWorkspace = mocks.lastHealthWorkspaceProps;
    mocks.navigate.mockClear();

    await act(async () => {
      healthWorkspace?.onOpenCredential({
        fileName: 'shared-codex.json',
        authIndex: 'auth-2',
      });
      await Promise.resolve();
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      {
        pathname: '/accounts',
        search: '?account=shared-codex.json%00auth-2&tab=diagnostics',
      },
      { replace: false }
    );
    expect(mocks.showNotification).not.toHaveBeenCalledWith(
      'accounts.inspection_credential_not_found',
      'warning'
    );
  });

  it('does not guess between shared credentials when inspection identity is incomplete', async () => {
    mocks.files = [
      makeCodexFile('shared-codex.json', 'auth-1', 'first@example.com'),
      makeCodexFile('shared-codex.json', 'auth-2', 'second@example.com'),
    ];
    mocks.location = { pathname: '/accounts', search: '?view=health&healthMode=local' };
    await renderAccountsPage();
    mocks.navigate.mockClear();

    await act(async () => {
      mocks.lastHealthWorkspaceProps?.onOpenCredential({
        fileName: 'shared-codex.json',
        authIndex: null,
      });
      await Promise.resolve();
    });

    expect(mocks.showNotification).toHaveBeenCalledWith(
      'accounts.inspection_credential_not_found',
      'warning'
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
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

  it('passes a file-scoped preview into the single batch delete confirmation', async () => {
    mocks.selectedFiles = new Set(['codex.json\u0000auth-1']);
    mocks.selectionCount = 1;

    const renderer = await renderAccountsPage();
    const deleteItem = findBatchMoreItem(renderer, 'delete');

    await act(async () => {
      deleteItem.onClick();
    });

    expect(mocks.batchDelete).toHaveBeenCalledTimes(1);
    const options = mocks.batchDelete.mock.calls[0]?.[1] as
      | { message?: unknown; confirmText?: string }
      | undefined;
    expect(options?.confirmText).toBe('common.delete');
    expect(
      isValidElement<{
        summary: string;
        warning: string;
        fileNames: string[];
      }>(options?.message)
    ).toBe(true);
    if (
      !isValidElement<{
        summary: string;
        warning: string;
        fileNames: string[];
      }>(options?.message)
    ) {
      throw new Error('Expected batch delete preview element');
    }
    expect(options.message.props.summary).toContain('accounts.batch_delete_preview_summary');
    expect(options.message.props.warning).toContain('accounts.batch_delete_preview_file_scope');
    expect(options.message.props.fileNames).toContain('codex.json');
  });

  it('keeps runtime Aistudio model discovery available', async () => {
    mocks.files = [
      {
        name: 'runtime-aistudio.json',
        type: 'aistudio',
        provider: 'aistudio',
        runtimeOnly: true,
        disabled: false,
      } as AuthFileItem,
    ];

    const renderer = await renderAccountsPage();
    const modelsButton = findAccountCardButtonByAriaLabel(
      renderer,
      'runtime-aistudio.json\u0000-',
      'auth_files.models_button'
    );

    expect(modelsButton.props.disabled).toBe(false);
    await act(async () => {
      modelsButton.props.onClick();
    });
    expect(mocks.showModels).toHaveBeenCalledWith(mocks.files[0]);
  });

  it('falls the removed quota workspace back to the credential list', async () => {
    mocks.location = { pathname: '/accounts', search: '?view=quota' };

    const renderer = await renderAccountsPage();

    expect(
      renderer.root.findAllByProps({ 'data-account-card': 'codex.json\u0000auth-1' })
    ).toHaveLength(1);
    expect(findHostButtonByText(renderer, 'accounts.tab_accounts').props['aria-selected']).toBe(
      true
    );
    expect(treeText(renderer)).not.toContain('accounts.tab_quota');
    expect(treeText(renderer)).not.toContain('accounts.tab_value');
    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: '/accounts', search: '' },
      { replace: true }
    );
  });

  it('links the last local inspection into credential diagnostics', async () => {
    mocks.location = { pathname: '/accounts', search: '' };
    mocks.localInspection = {
      savedAt: 300,
      logs: [],
      logsCollapsed: true,
      actionFilter: 'all',
      connectionFingerprint: 'http://manager.local:18317:manager-key',
      result: {
        settings: {},
        files: mocks.files,
        startedAt: 100,
        finishedAt: 200,
        summary: {
          totalFiles: 1,
          probeSetCount: 1,
          sampledCount: 1,
          disabledCount: 0,
          enabledCount: 0,
          deleteCount: 0,
          disableCount: 0,
          enableCount: 0,
          reauthCount: 1,
          keepCount: 0,
          usedPercentThreshold: 100,
          sampled: false,
          plannedActionPreview: [],
        },
        results: [
          {
            key: 'codex.json\u0000auth-1',
            fileName: 'codex.json',
            displayAccount: 'codex@example.com',
            authIndex: 'auth-1',
            accountId: null,
            provider: 'codex',
            disabled: false,
            autoRecoverOwned: false,
            status: 'error',
            state: 'error',
            raw: mocks.files[0],
            action: 'reauth',
            actionReason: 'expired token',
            statusCode: 401,
            usedPercent: null,
            isQuota: false,
            autoRecoverEligible: false,
            error: 'expired token',
            actionHandled: false,
          },
        ],
      },
    };

    const renderer = await renderAccountsPage();
    await flushPromises();

    await act(async () => {
      findDetailButtonByName(renderer, 'codex.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
    });

    expect(treeText(renderer)).toContain('expired token');
    expect(treeText(renderer)).toContain('accounts.action_reauth');
    expect(treeText(renderer)).toContain('accounts.inspection_source_local');
  });

  it('translates inspection reason keys before rendering them', async () => {
    const originalT = mocks.t;
    mocks.t = (key: string, options?: Record<string, unknown>) => {
      if (key.startsWith('monitoring.')) return `translated:${key}`;
      return originalT(key, options);
    };
    mocks.location = { pathname: '/accounts', search: '' };
    mocks.localInspection = {
      savedAt: 300,
      logs: [],
      logsCollapsed: true,
      actionFilter: 'all',
      connectionFingerprint: 'http://manager.local:18317:manager-key',
      result: {
        settings: {},
        files: mocks.files,
        startedAt: 100,
        finishedAt: 200,
        summary: {
          totalFiles: 1,
          probeSetCount: 1,
          sampledCount: 1,
          disabledCount: 0,
          enabledCount: 0,
          deleteCount: 0,
          disableCount: 0,
          enableCount: 0,
          reauthCount: 0,
          keepCount: 1,
          usedPercentThreshold: 100,
          sampled: false,
          plannedActionPreview: [],
        },
        results: [
          {
            key: 'codex.json\u0000auth-1',
            fileName: 'codex.json',
            displayAccount: 'codex@example.com',
            authIndex: 'auth-1',
            accountId: null,
            provider: 'codex',
            disabled: false,
            autoRecoverOwned: false,
            status: 'ok',
            state: 'ok',
            raw: mocks.files[0],
            action: 'keep',
            actionReason: 'monitoring.xai_inspection_reason_billing_healthy',
            statusCode: 200,
            usedPercent: null,
            isQuota: false,
            autoRecoverEligible: false,
            error: '',
            actionHandled: false,
          },
        ],
      },
    };

    try {
      const renderer = await renderAccountsPage();
      await flushPromises();

      await act(async () => {
        findDetailButtonByName(renderer, 'codex.json').props.onClick();
      });
      await act(async () => {
        findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
      });

      expect(treeText(renderer)).toContain(
        'translated:monitoring.xai_inspection_reason_billing_healthy'
      );
    } finally {
      mocks.t = originalT;
    }
  });

  it('ignores stale Manager inspection responses after the CPA connection changes', async () => {
    mocks.location = { pathname: '/accounts', search: '' };
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: false,
      serverCodexInspectionAvailable: true,
    };
    const run: CodexInspectionRun = {
      id: 7,
      triggerType: 'manual',
      status: 'completed',
      startedAtMs: 100,
      finishedAtMs: 200,
      totalFiles: 1,
      probeSetCount: 1,
      sampledCount: 1,
      disabledCount: 0,
      enabledCount: 0,
      deleteCount: 0,
      disableCount: 0,
      enableCount: 0,
      reauthCount: 1,
      keepCount: 0,
      createdAtMs: 100,
      updatedAtMs: 200,
    };
    const makeInspectionResult = (id: number, account: string): CodexInspectionResult => ({
      id,
      runId: 7,
      accountKey: account,
      fileName: 'codex.json',
      displayAccount: account,
      authIndex: 'auth-1',
      provider: 'codex',
      disabled: false,
      action: 'reauth',
      actionReason: `${account} reason`,
      statusCode: 401,
      isQuota: false,
      createdAtMs: 200,
    });
    const firstDetail = createDeferred<{
      run: typeof run;
      results: ReturnType<typeof makeInspectionResult>[];
    }>();
    mocks.listCodexInspectionRuns.mockResolvedValue({ items: [run] });
    mocks.getCodexInspectionRun
      .mockImplementationOnce(() => firstDetail.promise)
      .mockResolvedValue({ run, results: [makeInspectionResult(2, 'new-connection@example.com')] });

    const renderer = await renderAccountsPage();
    await flushPromises();
    expect(mocks.getCodexInspectionRun).not.toHaveBeenCalled();

    await act(async () => {
      findHostButtonByText(renderer, 'accounts.tab_health').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.getCodexInspectionRun).toHaveBeenCalledTimes(1);

    mocks.apiBase = 'http://cpa-b.local:8317';
    await act(async () => {
      renderer.update(<AccountsPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushPromises();

    await act(async () => {
      findHostButtonByText(renderer, 'accounts.tab_accounts').props.onClick();
      await Promise.resolve();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.tab_health').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.getCodexInspectionRun).toHaveBeenCalledTimes(2);

    firstDetail.resolve({ run, results: [makeInspectionResult(1, 'old-connection@example.com')] });
    await flushPromises();

    await act(async () => {
      findHostButtonByText(renderer, 'accounts.tab_accounts').props.onClick();
    });
    await act(async () => {
      findDetailButtonByName(renderer, 'codex.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
    });

    expect(treeText(renderer)).toContain('new-connection@example.com reason');
    expect(treeText(renderer)).not.toContain('old-connection@example.com reason');
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
        createdAtMs: 1000,
        recent_requests: [{ success: 1, failed: 0 }],
      },
      {
        ...makeCodexFile('middle.json', 'auth-middle', 'middle@example.com'),
        priority: 2,
        createdAtMs: 3000,
        recent_requests: [{ success: 3, failed: 2 }],
      },
      {
        ...makeCodexFile('high.json', 'auth-high', 'high@example.com'),
        priority: 10,
        createdAtMs: 4000,
        recent_requests: [{ success: 2, failed: 1 }],
      },
    ];
    mocks.quotaState.codexQuota = {
      'low.json': {
        status: 'success',
        windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 10, resetLabel: '2026-01-10' }],
      },
      'middle.json': {
        status: 'success',
        windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 40, resetLabel: '2026-01-02' }],
      },
      'high.json': {
        status: 'success',
        windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 70, resetLabel: '2026-01-05' }],
      },
    };

    const renderer = await renderAccountsPage();

    expect(getAccountListItemTexts(renderer)[0]).toContain('middle.json');

    await act(async () => {
      findHostButtonByAriaLabel(
        renderer,
        'accounts.sort_label: accounts.col_recent'
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

    await act(async () => {
      findHostButtonByAriaLabel(
        renderer,
        'accounts.sort_label: accounts.col_recent'
      ).props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.col_quota').props.onClick();
    });

    expect(getAccountListItemTexts(renderer)[0]).toContain('low.json');

    await act(async () => {
      findHostButtonByAriaLabel(
        renderer,
        'accounts.sort_label: accounts.col_quota'
      ).props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.col_created').props.onClick();
    });

    expect(getAccountListItemTexts(renderer)[0]).toContain('high.json');
  });

  it('renders xAI monthly and pay-as-you-go quota windows on account cards', async () => {
    mocks.files = [
      {
        name: 'xai.json',
        type: 'xai',
        provider: 'xai',
        authIndex: 'xai-1',
        account: 'xai@example.com',
        priority: 0,
        disabled: false,
      } as AuthFileItem,
    ];
    mocks.quotaState.xaiQuota = {
      'xai.json': {
        status: 'success',
        billing: {
          monthlyLimitCents: 10_000,
          usedCents: 12_500,
          includedUsedCents: 10_000,
          onDemandCapCents: 5_000,
          onDemandUsedCents: 2_500,
          onDemandUsedPercent: 50,
          billingPeriodEnd: '2026-07-31T00:00:00Z',
          usedPercent: 100,
        },
      },
    };

    const renderer = await renderAccountsPage();
    const text = treeText(renderer);

    expect(text).toContain('30D');
    expect(text).toContain('PAYG');
  });

  it('renders Antigravity Pro model groups as a two-row quota matrix', async () => {
    mocks.files = [
      {
        name: 'antigravity-pro-matrix.json',
        type: 'antigravity',
        provider: 'antigravity',
        authIndex: 'antigravity-pro-matrix-04',
        account: 'AG Pro Matrix',
        label: 'Antigravity Pro Matrix',
        priority: 0,
        disabled: false,
      } as AuthFileItem,
    ];
    mocks.quotaState.antigravityQuota = {
      'antigravity-pro-matrix.json': {
        status: 'success',
        subscription: { plan: 'pro', tierName: 'Pro', tierId: 'g1-pro' },
        groups: [
          {
            id: 'gemini-models',
            label: 'Gemini Models',
            description: 'Models within this group: Gemini Flash, Gemini Pro',
            models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
            buckets: [
              {
                id: 'gemini-5h',
                label: 'Five Hour Limit',
                window: '5h',
                remainingFraction: 0.96,
                resetTime: '2026-07-09T12:00:00Z',
              },
              {
                id: 'gemini-weekly',
                label: 'Weekly Limit',
                window: 'weekly',
                remainingFraction: 0.04,
                resetTime: '2026-07-15T12:00:00Z',
              },
            ],
          },
          {
            id: 'claude-gpt-models',
            label: 'Claude and GPT models',
            description: 'Models within this group: Claude Sonnet, GPT-OSS',
            models: ['claude-sonnet-4-5', 'gpt-oss-120b-medium'],
            buckets: [
              {
                id: '3p-5h',
                label: 'Five Hour Limit',
                window: '5h',
                remainingFraction: 0.11,
                resetTime: '2026-07-09T11:00:00Z',
              },
              {
                id: '3p-weekly',
                label: 'Weekly Limit',
                window: 'weekly',
                remainingFraction: 0.19,
                resetTime: '2026-07-13T12:00:00Z',
              },
            ],
          },
        ],
      },
    };

    const renderer = await renderAccountsPage();
    const matrices = renderer.root.findAll(
      (node) => typeof node.props['data-account-quota-matrix'] === 'string'
    );
    expect(matrices).toHaveLength(1);
    const matrix = matrices[0];
    const matrixRows = matrix.findAll(
      (node) => typeof node.props['data-account-quota-matrix-row'] === 'string'
    );
    const matrixCells = matrix.findAll(
      (node) => typeof node.props['data-account-quota-matrix-cell'] === 'string'
    );

    expect(matrixRows.map((node) => node.props['data-account-quota-matrix-row'])).toEqual([
      'five_hour',
      'weekly',
    ]);
    expect(matrixCells).toHaveLength(4);
    expect(readText(matrix)).toContain('5H');
    expect(readText(matrix)).toContain('7D');
    expect(readText(matrix)).toContain('Claude');
    expect(readText(matrix)).toContain('Gemini');
    expect(readText(matrix)).toContain('11%');
    expect(readText(matrix)).toContain('96%');
    expect(readText(matrix)).toContain('19%');
    expect(readText(matrix)).toContain('4%');
    expect(readText(matrix)).not.toContain('Claude/GPT');
    expect(readText(matrix)).not.toContain('accounts.quota_more_windows');
  });

  it('renders Antigravity Free weekly groups as a single-row quota matrix', async () => {
    mocks.files = [
      {
        name: 'antigravity-free-weekly.json',
        type: 'antigravity',
        provider: 'antigravity',
        authIndex: 'antigravity-free-weekly-05',
        account: 'AG Free Seat',
        label: 'Antigravity Free Weekly',
        priority: 0,
        disabled: false,
      } as AuthFileItem,
    ];
    mocks.quotaState.antigravityQuota = {
      'antigravity-free-weekly.json': {
        status: 'success',
        subscription: { plan: 'free', tierName: 'Free', tierId: 'g1-free' },
        groups: [
          {
            id: 'gemini-models',
            label: 'Gemini Models',
            description: 'Models within this group: Gemini Flash, Gemini Pro',
            models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
            buckets: [
              {
                id: 'gemini-weekly',
                label: 'Weekly Limit',
                window: 'weekly',
                remainingFraction: 0.76,
                resetTime: '2026-07-15T12:00:00Z',
              },
            ],
          },
          {
            id: 'claude-gpt-models',
            label: 'Claude and GPT models',
            description: 'Models within this group: Claude Sonnet, GPT-OSS',
            models: ['claude-sonnet-4-5', 'gpt-oss-120b-medium'],
            buckets: [
              {
                id: '3p-weekly',
                label: 'Weekly Limit',
                window: 'weekly',
                remainingFraction: 0.31,
                resetTime: '2026-07-13T12:00:00Z',
              },
            ],
          },
        ],
      },
    };

    const renderer = await renderAccountsPage();
    const matrices = renderer.root.findAll(
      (node) => typeof node.props['data-account-quota-matrix'] === 'string'
    );
    expect(matrices).toHaveLength(1);
    const matrix = matrices[0];
    const matrixRows = matrix.findAll(
      (node) => typeof node.props['data-account-quota-matrix-row'] === 'string'
    );
    const matrixCells = matrix.findAll(
      (node) => typeof node.props['data-account-quota-matrix-cell'] === 'string'
    );

    expect(matrixRows.map((node) => node.props['data-account-quota-matrix-row'])).toEqual([
      'weekly',
    ]);
    expect(matrixCells).toHaveLength(2);
    expect(readText(matrix)).toContain('7D');
    expect(readText(matrix)).toContain('Claude');
    expect(readText(matrix)).toContain('Gemini');
    expect(readText(matrix)).toContain('31%');
    expect(readText(matrix)).toContain('76%');
    expect(readText(matrix)).not.toContain('5H');
    expect(readText(matrix)).not.toContain('Claude/GPT');
    expect(readText(matrix)).not.toContain('accounts.quota_more_windows');
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

  it('renders the six localized credential list headers', async () => {
    const renderer = await renderAccountsPage();
    const header = renderer.root.findByProps({ 'data-account-list-header': 'true' });

    expect(header.findAllByType('span').map((node) => readText(node))).toEqual([
      'accounts.list_header_credential',
      'accounts.list_header_availability',
      'accounts.list_header_recent_requests',
      'accounts.list_header_historical_usage',
      'accounts.list_header_quota',
      'accounts.list_header_actions',
    ]);

    expect(renderer.root.findAllByProps({ 'data-account-quota-empty': 'true' })).toHaveLength(1);
    expect(treeText(renderer)).not.toContain('SUM');
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

  it('does not open account details from normal row clicks', async () => {
    const renderer = await renderAccountsPage();
    const card = findAccountCardByKey(renderer, 'codex.json\u0000auth-1');

    expect(card.props.onClick).toBeUndefined();
    expect(treeText(renderer)).not.toContain('accounts.detail_tab_overview');
  });

  it('copies account identity text from the first column with inline feedback', async () => {
    const renderer = await renderAccountsPage();
    const selectionKey = 'codex.json\u0000auth-1';

    await act(async () => {
      await findAccountCardButtonByAriaLabel(
        renderer,
        selectionKey,
        'common.copy codex@example.com'
      ).props.onClick({ stopPropagation: vi.fn() });
    });

    expect(copyToClipboard).toHaveBeenLastCalledWith('codex@example.com');
    expect(treeText(renderer)).toContain('accounts.copy_feedback_copied');

    await act(async () => {
      await findAccountCardButtonByAriaLabel(
        renderer,
        selectionKey,
        'common.copy codex.json'
      ).props.onClick({ stopPropagation: vi.fn() });
    });

    expect(copyToClipboard).toHaveBeenLastCalledWith('codex.json');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('runs account row actions from the explicit action column', async () => {
    const renderer = await renderAccountsPage();
    const selectionKey = 'codex.json\u0000auth-1';

    await act(async () => {
      findAccountCardButtonByAriaLabel(
        renderer,
        selectionKey,
        'auth_files.models_button'
      ).props.onClick();
      await Promise.resolve();
    });

    expect(mocks.showModels).toHaveBeenCalledWith(mocks.files[0]);
    expect(treeText(renderer)).toContain('models-content');

    const modelsTab = renderer.root
      .findAll((node) => node.type === 'button' && node.props.role === 'tab')
      .find((node) => readText(node.props.children) === 'auth_files.models_button');
    expect(modelsTab?.props['aria-selected']).toBe(true);

    await act(async () => {
      findAccountCardButtonByAriaLabel(
        renderer,
        selectionKey,
        'auth_files.download_button'
      ).props.onClick();
    });
    expect(mocks.handleDownload).toHaveBeenCalledWith('codex.json');

    await act(async () => {
      findAccountCardButtonByAriaLabel(
        renderer,
        selectionKey,
        'auth_files.delete_button'
      ).props.onClick();
    });
    expect(mocks.handleDelete).toHaveBeenCalledWith('codex.json');

    await act(async () => {
      const statusToggle = findAccountCardInputByAriaLabel(
        renderer,
        selectionKey,
        'auth_files.status_toggle_label'
      );
      expect(statusToggle.props.checked).toBe(true);
      statusToggle.props.onChange({ target: { checked: false } });
      await Promise.resolve();
    });
    expect(mocks.batchSetStatus).toHaveBeenCalledWith(['codex.json'], false);

    await act(async () => {
      findDetailButtonByName(renderer, 'codex.json').props.onClick();
    });
    expect(treeText(renderer)).toContain('accounts.detail_tab_overview');
  });

  it('refreshes single-account history from the row refresh action', async () => {
    mocks.files = [
      {
        ...makeCodexFile('generic.json', 'auth-generic', 'generic@example.com'),
        type: 'generic',
        provider: 'generic',
      } as AuthFileItem,
    ];
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };

    const renderer = await renderAccountsPage();
    await flushPromises();
    mocks.getAccountHistory.mockClear();

    await act(async () => {
      findAccountCardButtonByAriaLabel(
        renderer,
        'generic.json\u0000auth-generic',
        'accounts.refresh_quota'
      ).props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getAccountHistory).toHaveBeenCalledWith(
      'http://manager.local:18317',
      'manager-key',
      {
        accounts: [
          {
            account_snapshot: 'generic@example.com',
            auth_label_snapshot: undefined,
            source: 'generic.json',
            auth_index: 'auth-generic',
          },
        ],
      }
    );
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

  it('renders account history from rollup data instead of monitoring account stats or auth-file health', async () => {
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
    mocks.getAccountHistory.mockResolvedValue(
      makeAccountHistoryResponse([
        {
          account_key: 'healthy@example.com',
          matched: true,
          total_requests: 1234,
          success_calls: 1218,
          failure_calls: 16,
          total_tokens: 5678900,
          total_cost: 12.34,
          success_rate: 0.987,
          first_seen_ms: 1,
          last_seen_ms: 2,
          sync_status: 'ready',
        },
      ])
    );

    const renderer = await renderAccountsPage();
    await flushPromises();
    const cardText = getAccountListItemTexts(renderer).join('\n');

    expect(mocks.getAccountHistory).toHaveBeenCalledWith(
      'http://manager.local:18317',
      'manager-key',
      {
        accounts: [
          {
            account_snapshot: 'healthy@example.com',
            auth_label_snapshot: undefined,
            source: 'healthy.json',
            auth_index: 'auth-1',
          },
        ],
      }
    );
    const accountHistoryRequest = mocks.getAccountHistory.mock.calls[0]?.[2];
    expect(accountHistoryRequest).not.toHaveProperty('catch_up');
    expect(cardText).toContain('1.2K');
    expect(cardText).toContain('5.7M');
    expect(cardText).toContain('$12.34');
    expect(cardText).toContain('98.7%');
    expect(cardText).not.toContain('accounts.history_requests');
    expect(cardText).not.toContain('accounts.history_tokens');
    expect(cardText).not.toContain('accounts.history_cost');
    expect(cardText).not.toContain('accounts.history_success');
    expect(cardText).not.toContain('stats.success 87');
    expect(cardText).not.toContain('stats.failure 3');
    expect(cardText).not.toContain('auth_files.health_status_label');
    expect(cardText).not.toContain('accounts.activity_success_failure');
    expect(cardText).not.toContain('999');
  });

  it('renders the latest real request from the existing account-history response without polling again', async () => {
    mocks.files = [makeCodexFile('latest.json', 'auth-latest', 'latest@example.com')];
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    mocks.getAccountHistory.mockResolvedValue(
      makeAccountHistoryResponse([
        {
          account_key: 'latest@example.com',
          matched: true,
          total_requests: 1,
          success_calls: 0,
          failure_calls: 1,
          total_tokens: 0,
          total_cost: 0,
          success_rate: 0,
          first_seen_ms: 1,
          last_seen_ms: 2,
          latest_request: {
            timestamp_ms: 1_700_000_000_000,
            failed: true,
            fail_status_code: 429,
            fail_summary: 'rate limit exceeded',
            header_error_kind: 'rate_limit',
            header_error_code: 'quota_exceeded',
          },
          recent_requests: [
            {
              timestamp_ms: 1_700_000_000_000,
              failed: true,
              fail_status_code: 429,
              fail_summary: 'rate limit exceeded',
              header_error_kind: 'rate_limit',
              header_error_code: 'quota_exceeded',
            },
            { timestamp_ms: 1_699_999_999_000, failed: false },
            { timestamp_ms: 1_699_999_998_000, failed: true },
          ],
          sync_status: 'ready',
        },
      ])
    );

    const renderer = await renderAccountsPage();
    await flushPromises();

    const statusTrack = renderer.root.findByProps({
      'data-account-request-status-track': 'true',
    });
    const renderedStatuses = statusTrack
      .findAll((node) => typeof node.props['data-request-status'] === 'string')
      .map((node) => node.props['data-request-status']);
    expect(renderedStatuses.slice(-3)).toEqual(['failed', 'success', 'failed']);
    expect(renderedStatuses.slice(0, -3).every((status) => status === 'empty')).toBe(true);
    const settledHistoryCallCount = mocks.getAccountHistory.mock.calls.length;
    expect(settledHistoryCallCount).toBeGreaterThan(0);

    await flushPromises();
    expect(mocks.getAccountHistory).toHaveBeenCalledTimes(settledHistoryCallCount);
  });

  it('shows pending history without blocking account rows', async () => {
    mocks.files = [makeCodexFile('pending.json', 'auth-1', 'pending@example.com')];
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    mocks.getAccountHistory.mockResolvedValue(
      makeAccountHistoryResponse([
        {
          account_key: 'pending@example.com',
          matched: true,
          total_requests: 5,
          success_calls: 4,
          failure_calls: 1,
          total_tokens: 600,
          total_cost: 0.08,
          success_rate: 0.8,
          first_seen_ms: 1,
          last_seen_ms: 2,
          sync_status: 'pending',
        },
      ])
    );

    const renderer = await renderAccountsPage();
    await flushPromises();

    expect(getAccountListItemTexts(renderer).join('\n')).toContain('pending.json');
    expect(treeText(renderer)).toContain('accounts.history_syncing');
  });

  it('keeps the account list usable when account history is unavailable', async () => {
    mocks.files = [makeCodexFile('offline.json', 'auth-1', 'offline@example.com')];
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    mocks.getAccountHistory.mockRejectedValue(new Error('history offline'));

    const renderer = await renderAccountsPage();
    await flushPromises();

    expect(getAccountListItemTexts(renderer).join('\n')).toContain('offline.json');
    expect(treeText(renderer)).toContain('accounts.history_unavailable');
  });

  it('renders the mobile filters entrypoint in the accounts toolbar', async () => {
    const renderer = await renderAccountsPage();

    expect(treeText(renderer)).toContain('accounts.mobile_filters_button');
    expect(treeText(renderer)).toContain('accounts.col_recent');

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
    expect(mocks.getHeaderSnapshots).not.toHaveBeenCalled();

    await act(async () => {
      findDetailButtonByName(renderer, 'codex-diagnostic.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_quota').props.onClick();
    });
    await flushPromises();

    expect(mocks.getHeaderSnapshots).toHaveBeenCalledTimes(1);

    await act(async () => {
      findInputByAriaLabel(renderer, 'accounts.search_label').props.onChange({
        target: { value: 'trace-diagnostic-only' },
      });
    });

    const rowTexts = getAccountListItemTexts(renderer);
    expect(rowTexts).toHaveLength(1);
    expect(rowTexts[0]).toContain('codex-diagnostic.json');

    expect(treeText(renderer)).toContain('accounts.quota_source_observed_header');
    expect(treeText(renderer)).toContain('trace-diagnostic-only');
    expect(treeText(renderer)).toContain('usage_limit_reached');
  });

  it('loads quota diagnostics only after opening one credential quota detail', async () => {
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
    const resetLabel = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mocks.quotaState.codexQuota = {
      'codex-a.json': {
        status: 'success',
        windows: [
          {
            id: 'five-hour',
            label: 'Five hours',
            usedPercent: 20,
            resetLabel,
            limitWindowSeconds: 5 * 60 * 60,
          },
        ],
      },
      'codex-b.json': {
        status: 'success',
        windows: [
          {
            id: 'five-hour',
            label: 'Five hours',
            usedPercent: 30,
            resetLabel,
            limitWindowSeconds: 5 * 60 * 60,
          },
        ],
      },
    };

    const renderer = await renderAccountsPage();
    await flushPromises();

    expect(mocks.getActiveQuotaCooldowns).not.toHaveBeenCalled();
    expect(mocks.getHeaderSnapshots).not.toHaveBeenCalled();
    expect(mocks.getAccountWindowUsage).not.toHaveBeenCalled();

    await act(async () => {
      findDetailButtonByName(renderer, 'codex-a.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_quota').props.onClick();
    });
    await flushPromises();

    expect(mocks.getActiveQuotaCooldowns).toHaveBeenCalledTimes(1);
    expect(mocks.getHeaderSnapshots).toHaveBeenCalledTimes(1);
    expect(mocks.getAccountWindowUsage).toHaveBeenCalledTimes(1);
    const windowUsageRequest = mocks.getAccountWindowUsage.mock.calls[0]?.[2] as
      | AccountWindowUsageRequestForTest
      | undefined;
    expect(windowUsageRequest?.windows).toHaveLength(1);
    expect(windowUsageRequest?.windows[0]).toMatchObject({
      row_key: 'codex-a.json\u0000auth-a',
      source: 'codex-a.json',
      auth_index: 'auth-a',
    });
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
      findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
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

  it('keeps the scoped monitoring link visible when the event list is empty', async () => {
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    mocks.getAnalytics.mockImplementation(
      async (_base: string, _key: string | undefined, request: unknown) => {
        const analyticsRequest = request as AnalyticsRequestForTest;
        if (!analyticsRequest.include?.events_page) return makeEmptyAnalyticsResponse();
        return {
          generated_at_ms: 1,
          granularity: 'day',
          events: {
            items: [],
            next_before_ms: 0,
            has_more: false,
            total_count: 0,
          },
        };
      }
    );

    const renderer = await renderAccountsPage();
    await act(async () => {
      findDetailButtonByName(renderer, 'codex.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    const monitoringLink = renderer.root
      .findAll((node) => node.type === 'a')
      .find((node) => String(node.props.href).startsWith('#/monitoring?'));
    expect(monitoringLink?.props.href).toBe('#/monitoring?auth_file=codex.json&auth_index=auth-1');
  });

  it('loads additional detail events with the returned cursor', async () => {
    mocks.panelFeatureAvailability = {
      checking: false,
      managerServiceBase: 'http://manager.local:18317',
      requestMonitoringAvailable: true,
      serverCodexInspectionAvailable: false,
    };
    mocks.getAnalytics.mockImplementation(
      async (_base: string, _key: string | undefined, request: unknown) => {
        const analyticsRequest = request as AnalyticsRequestForTest;
        if (!analyticsRequest.include?.events_page) return makeEmptyAnalyticsResponse();
        const eventsPage = analyticsRequest.include.events_page as {
          before_ms?: number | null;
          before_id?: number | null;
        };
        if (eventsPage.before_ms === 100 && eventsPage.before_id === 7) {
          return {
            generated_at_ms: 1,
            granularity: 'day',
            events: {
              items: [makeAnalyticsEvent({ request_id: 'req-older', event_hash: 'event-older' })],
              next_before_ms: 0,
              has_more: false,
              total_count: 42,
            },
          };
        }
        return {
          generated_at_ms: 1,
          granularity: 'day',
          events: {
            items: [makeAnalyticsEvent({ request_id: 'req-latest', event_hash: 'event-latest' })],
            next_before_ms: 100,
            next_before_id: 7,
            has_more: true,
            total_count: 42,
          },
        };
      }
    );

    const renderer = await renderAccountsPage();
    mocks.getAnalytics.mockClear();

    await act(async () => {
      findDetailButtonByName(renderer, 'codex.json').props.onClick();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(treeText(renderer)).toContain('req-latest');

    await act(async () => {
      findButtonByText(renderer, 'accounts.detail_event_load_more').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    const paginatedRequest = mocks.getAnalytics.mock.calls
      .map((call) => call[2] as AnalyticsRequestForTest)
      .find((request) => {
        const page = request.include?.events_page as
          | { before_ms?: number | null; before_id?: number | null }
          | undefined;
        return page?.before_ms === 100 && page.before_id === 7;
      });
    expect(paginatedRequest).toBeDefined();
    expect(treeText(renderer)).toContain('req-latest');
    expect(treeText(renderer)).toContain('req-older');
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
      findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
      await Promise.resolve();
    });
    await act(async () => {
      findDetailButtonByName(renderer, 'codex-b.json').props.onClick();
      await Promise.resolve();
    });
    await act(async () => {
      findHostButtonByText(renderer, 'accounts.detail_tab_diagnostics').props.onClick();
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
