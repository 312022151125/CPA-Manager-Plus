import { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { QuotaCooldownInfo } from '@/services/api/usageService';
import { formatUnixTimestamp } from '@/utils/format';
import type { AuthFileItem, CodexQuotaState } from '@/types';
import { AuthFileCard } from './AuthFileCard';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'common.not_set') return 'Not set';
      return options ? `${key}:${JSON.stringify(options)}` : key;
    },
  }),
}));

const file: AuthFileItem = {
  name: 'credential.json',
  type: 'xai',
  disabled: true,
};

const renderCard = (quotaCooldown: QuotaCooldownInfo): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <AuthFileCard
        file={{ ...file, type: quotaCooldown.provider ?? file.type }}
        compact
        selected={false}
        resolvedTheme="dark"
        disableControls={false}
        deleting={null}
        statusUpdating={{}}
        statusBarCache={new Map()}
        quotaCooldown={quotaCooldown}
        onShowModels={vi.fn()}
        onDownload={vi.fn()}
        onOpenPrefixProxyEditor={vi.fn()}
        onDelete={vi.fn()}
        onToggleStatus={vi.fn()}
        onToggleSelect={vi.fn()}
      />
    );
  });
  return renderer;
};
const renderCodexCard = (codexDisplayQuota: CodexQuotaState): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <AuthFileCard
        file={{ name: 'codex-auth.json', type: 'codex', disabled: false }}
        compact
        selected={false}
        resolvedTheme="dark"
        disableControls={false}
        deleting={null}
        statusUpdating={{}}
        statusBarCache={new Map()}
        codexDisplayQuota={codexDisplayQuota}
        onShowModels={vi.fn()}
        onDownload={vi.fn()}
        onOpenPrefixProxyEditor={vi.fn()}
        onDelete={vi.fn()}
        onToggleStatus={vi.fn()}
        onToggleSelect={vi.fn()}
      />
    );
  });
  return renderer;
};

const findCodexExpiryBadge = (renderer: ReactTestRenderer): ReactTestInstance | undefined =>
  renderer.root.findAllByType('span').find((node) => {
    const title = node.props.title;
    return (
      typeof title === 'string' && title.startsWith('auth_files.codex_subscription_expiry_title')
    );
  });
const findCodexBadgeRow = (renderer: ReactTestRenderer): ReactTestInstance => {
  const row = renderer.root.findAllByType('div').find((node) => {
    const className = node.props.className;
    return typeof className === 'string' && className.includes('cardBadgeRow');
  });
  if (!row) throw new Error('Codex badge row not found');
  return row;
};

const findCooldownBadge = (renderer: ReactTestRenderer): ReactTestInstance => {
  const badge = renderer.root.findAllByType('span').find((node) => {
    const title = node.props.title;
    return typeof title === 'string' && title.startsWith('auth_files.quota_cooldown_badge_title_');
  });
  if (!badge) throw new Error('Quota cooldown badge not found');
  return badge;
};

const textContent = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');

describe('AuthFileCard quota cooldown presentation', () => {
  it('renders xAI cooldown as event-driven xAI automation', () => {
    const badge = findCooldownBadge(
      renderCard({
        authFileName: file.name,
        provider: 'xai',
        owner: 'cpamp_xai_free_usage',
        disabledAtMs: 1_900_000_000_000,
        recoverAtMs: 2_000_000_000_000,
        evidence: {
          provider: 'xai',
          code: 'subscription:free-usage-exhausted',
          unit: 'tokens',
          actual: 1_024_413,
          limit: 1_000_000,
          remaining: 0,
          overage: 24_413,
          recover_at_ms: 2_000_000_000_000,
          recover_at_estimated: true,
        },
      })
    );

    expect(textContent(badge)).toContain('auth_files.quota_cooldown_badge_xai');
    expect(badge.props.title).toContain('auth_files.quota_cooldown_badge_title_xai');
    expect(badge.props.title).toContain('1,024,413 / 1,000,000 tokens');
    expect(badge.props.title).toContain('provider_usage_remaining');
    expect(badge.props.title).toContain('24,413');
    expect(badge.props.title).toContain('provider_usage_estimated');
    expect(badge.props.title).not.toContain('"disabledAt":"Not set"');
  });

  it('renders Codex cooldown with the Codex reset-time policy', () => {
    const badge = findCooldownBadge(
      renderCard({
        authFileName: file.name,
        provider: 'codex',
        owner: 'cpamp_usage_429',
        disabledAtMs: 1_900_000_000_000,
        recoverAtMs: 2_000_000_000_000,
      })
    );

    expect(textContent(badge)).toContain('auth_files.quota_cooldown_badge_codex');
    expect(badge.props.title).toContain('auth_files.quota_cooldown_badge_title_codex');
  });

  it('uses the localized not-set value when disabled time is absent', () => {
    const badge = findCooldownBadge(
      renderCard({
        authFileName: file.name,
        provider: 'xai',
        owner: 'cpamp_xai_free_usage',
        recoverAtMs: 2_000_000_000_000,
      })
    );

    expect(badge.props.title).toContain('"disabledAt":"Not set"');
    expect(badge.props.title).toContain('provider_usage_recovery_unknown');
  });

  it('does not report a provider recovery source for partial evidence', () => {
    const badge = findCooldownBadge(
      renderCard({
        authFileName: file.name,
        provider: 'xai',
        owner: 'cpamp_xai_free_usage',
        recoverAtMs: 2_000_000_000_000,
        evidence: {
          provider: 'xai',
          code: 'subscription:free-usage-exhausted',
          actual: 1_000_000,
          limit: 1_000_000,
        },
      })
    );

    expect(badge.props.title).toContain('provider_usage_recovery_unknown');
    expect(badge.props.title).not.toContain('provider_usage_reported');
  });

  it('does not report a recovery source when evidence targets another schedule', () => {
    const badge = findCooldownBadge(
      renderCard({
        authFileName: file.name,
        provider: 'xai',
        owner: 'cpamp_xai_free_usage',
        recoverAtMs: 2_000_000_000_000,
        evidence: {
          provider: 'xai',
          code: 'subscription:free-usage-exhausted',
          recover_at_ms: 1_900_000_000_000,
          recover_at_estimated: false,
        },
      })
    );

    expect(badge.props.title).toContain('provider_usage_recovery_unknown');
    expect(badge.props.title).not.toContain('provider_usage_reported');
  });

  it('renders Codex expiry beside the Codex badge when expiry is valid', () => {
    const renderer = renderCodexCard({
      status: 'success',
      windows: [],
      subscriptionActiveUntil: '2026-08-01T12:34:56.000Z',
    });
    const badge = findCodexExpiryBadge(renderer);
    const rowBadges = findCodexBadgeRow(renderer).findAllByType('span');
    const shortDate = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(Date.parse('2026-08-01T12:34:56.000Z'));

    expect(badge).toBeDefined();
    expect(rowBadges[0].props.className).toContain('typeBadge');
    expect(rowBadges[1]).toBe(badge);
    expect(rowBadges[1].props.className).toContain('codexStatusBadgeInfo');
    expect(textContent(badge!)).toContain(`Expires ${shortDate}`);
    expect(badge!.props.title).toContain(
      formatUnixTimestamp(Date.parse('2026-08-01T12:34:56.000Z'))
    );
    expect(rowBadges[2].props.className).toContain('stateBadge');
  });

  it.each([null, 'not-a-date'] as const)(
    'omits Codex expiry for %s expiry',
    (subscriptionActiveUntil) => {
      const badge = findCodexExpiryBadge(
        renderCodexCard({ status: 'success', windows: [], subscriptionActiveUntil })
      );

      expect(badge).toBeUndefined();
    }
  );
});
