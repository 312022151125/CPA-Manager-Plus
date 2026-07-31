import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { AuthFileSafeSummary } from '@/features/authFiles/model/authFileSafeSummary';
import type { AccountDetailViewModel } from '@/features/accounts/model/accountDetailViewModel';
import type { AccountRow } from '@/features/accounts/model/accountRows';
import { AccountCredentialTab } from './AccountCredentialTab';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en' },
    }),
  };
});

const readText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readText).join('');
  if (value && typeof value === 'object' && 'children' in value) {
    return readText((value as { children?: unknown }).children);
  }
  return '';
};

const makeRow = (overrides: Partial<AccountRow> = {}): AccountRow =>
  ({
    selectionKey: 'xai-expired.json\u0000xai-expired-01',
    fileName: 'xai-expired.json',
    accountLabel: 'expired@example.com',
    provider: 'xai',
    planType: 'plus',
    disabled: false,
    runtimeOnly: false,
    statusMessage: 'Authentication expired',
    authIndex: 'xai-expired-01',
    projectId: '',
    priority: null,
    createdAtMs: null,
    updatedAtMs: null,
    raw: { name: 'xai-expired.json' },
    ...overrides,
  }) as AccountRow;

const makeDetailView = (overrides: Partial<AccountDetailViewModel> = {}): AccountDetailViewModel =>
  ({
    health: {
      status: 'reauth',
      labelKey: 'accounts.health_reauth',
      tooltipKey: 'accounts.health_tip_reauth',
      tooltipParams: {},
      reasonKey: 'accounts.health_reason_reauth_auth',
      reasonParams: { detail: 'Authentication expired' },
      resetAtMs: null,
    },
    auth: {
      fields: [
        {
          key: 'authIndex',
          labelKey: 'accounts.detail_auth_index',
          value: 'xai-expired-01',
        },
        {
          key: 'runtime',
          labelKey: 'accounts.detail_runtime_source',
          value: 'accounts.detail_local_auth_file',
          valueKind: 'i18n',
        },
      ],
    },
    ...overrides,
  }) as AccountDetailViewModel;

const makeSummary = (overrides: Partial<AuthFileSafeSummary> = {}): AuthFileSafeSummary => ({
  accountId: 'acct_xai_expired',
  createdAtMs: 1_700_000_000_000,
  modifiedAtMs: 1_700_000_100_000,
  expiresAtMs: 1_700_000_200_000,
  lastRefreshAtMs: 1_700_000_050_000,
  fileSize: 2980,
  prefix: '',
  proxyConfigured: false,
  maskedProxyUrl: '',
  priority: null,
  websockets: null,
  usingApi: null,
  headerNames: [],
  note: '',
  statusMessage: 'Authentication expired',
  ...overrides,
});

const renderCredentialTab = ({
  row = makeRow(),
  detailView = makeDetailView(),
  summary = makeSummary(),
  onEdit = vi.fn(),
  onReload = vi.fn(),
}: {
  row?: AccountRow;
  detailView?: AccountDetailViewModel;
  summary?: AuthFileSafeSummary | null;
  onEdit?: () => void;
  onReload?: () => void;
} = {}) => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <AccountCredentialTab
        row={row}
        detailView={detailView}
        healthStatusClass="health-bad"
        disableControls={false}
        fileName={row.fileName}
        loading={false}
        error=""
        summary={summary}
        onEdit={onEdit}
        onReload={onReload}
      />
    );
  });
  return renderer;
};

describe('AccountCredentialTab', () => {
  it('separates current availability from administrative enablement', () => {
    const renderer = renderCredentialTab();
    const text = readText(renderer.toJSON());
    const identity = renderer.root.findByProps({ 'data-credential-section': 'identity' });
    const lifecycle = renderer.root.findByProps({ 'data-credential-section': 'lifecycle' });
    const routing = renderer.root.findByProps({ 'data-credential-section': 'routing' });

    expect(identity.findByProps({ 'data-credential-health': 'reauth' })).toBeTruthy();
    expect(identity.findByProps({ 'data-credential-enablement': 'enabled' })).toBeTruthy();
    expect(text).toContain('accounts.detail_current_availability');
    expect(text).toContain('accounts.health_reauth');
    expect(text).toContain('accounts.detail_enablement_state');
    expect(text.match(/accounts\.detail_auth_status_enabled/g)).toHaveLength(1);
    expect(text).not.toContain('plus');
    expect(text).not.toContain('accounts.col_provider');
    expect(readText(identity)).toContain('acct_xai_expired');
    expect(readText(lifecycle.findByType('details'))).toContain('Authentication expired');
    expect(routing.props['data-credential-routing']).toBe('default');
    expect(readText(routing)).toContain('accounts.detail_default_routing_title');
    expect(readText(routing)).not.toContain('auth_files.prefix_label');
  });

  it('shows only configured routing values and preserves explicit false and zero', () => {
    const onEdit = vi.fn();
    const onReload = vi.fn();
    const renderer = renderCredentialTab({
      onEdit,
      onReload,
      summary: makeSummary({
        priority: 0,
        prefix: 'team',
        proxyConfigured: true,
        maskedProxyUrl: 'socks5://proxy.local:1080',
        websockets: false,
        usingApi: false,
        headerNames: ['X-Demo'],
        note: 'Primary route',
      }),
    });
    const routing = renderer.root.findByProps({ 'data-credential-section': 'routing' });
    const routingText = readText(routing);

    expect(routing.props['data-credential-routing']).toBe('configured');
    expect(routingText).toContain('accounts.col_priority0');
    expect(routingText).toContain('auth_files.prefix_labelteam');
    expect(routingText.match(/common\.no/g)).toHaveLength(2);
    expect(routingText).toContain('auth_files.headers_labelX-Demo');
    expect(routingText).not.toContain('accounts.detail_default_routing_title');

    const buttons = renderer.root.findAllByType('button');
    const configureButton = buttons.find((button) =>
      readText(button).includes('accounts.detail_configure_routing')
    );
    const reloadButton = buttons.find((button) =>
      readText(button).includes('accounts.detail_reload_file')
    );
    if (!configureButton || !reloadButton) throw new Error('credential action button missing');

    act(() => configureButton.props.onClick());
    act(() => reloadButton.props.onClick());
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('uses a runtime-specific configuration state without file actions', () => {
    const renderer = renderCredentialTab({
      row: makeRow({ runtimeOnly: true }),
      summary: null,
    });
    const text = readText(renderer.toJSON());
    const routing = renderer.root.findByProps({ 'data-credential-section': 'routing' });

    expect(renderer.root.findAllByProps({ role: 'note' })).toHaveLength(0);
    expect(routing.props['data-credential-routing']).toBe('runtime');
    expect(text).toContain('accounts.detail_runtime_config_unavailable');
    expect(text).not.toContain('accounts.detail_reload_file');
    expect(text).not.toContain('accounts.detail_configure_routing');
  });
});
