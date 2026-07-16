import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import { buildAuthFileSafeSummary } from './authFileSafeSummary';

describe('buildAuthFileSafeSummary', () => {
  it('extracts safe lifecycle and routing fields without retaining secrets', () => {
    const file: AuthFileItem = {
      name: 'codex.json',
      type: 'codex',
      size: 4096,
      modified: 1_800_000_000_000,
      statusMessage: 'active',
    };
    const rawText = JSON.stringify({
      account_id: 'account-1',
      access_token: 'sk-access-secret',
      refresh_token: 'sk-refresh-secret',
      cookie: 'session-secret',
      expired: '2026-08-01T00:00:00Z',
      last_refresh: '2026-07-15T00:00:00Z',
      prefix: 'team-a',
      proxy_url: 'socks5://user:password@127.0.0.1:1080/?token=secret',
      priority: 10,
      websockets: true,
      using_api: false,
      headers: {
        Authorization: 'Bearer secret',
        'X-Tenant': 'private-value',
      },
      note: 'primary credential',
    });

    const summary = buildAuthFileSafeSummary(file, rawText);
    const serialized = JSON.stringify(summary);

    expect(summary).toMatchObject({
      accountId: 'account-1',
      fileSize: 4096,
      prefix: 'team-a',
      proxyConfigured: true,
      maskedProxyUrl: 'socks5://127.0.0.1:1080',
      priority: 10,
      websockets: true,
      usingApi: false,
      headerNames: ['Authorization', 'X-Tenant'],
      note: 'primary credential',
      statusMessage: 'active',
    });
    expect(summary.expiresAtMs).toBe(Date.parse('2026-08-01T00:00:00Z'));
    expect(summary.lastRefreshAtMs).toBe(Date.parse('2026-07-15T00:00:00Z'));
    expect(serialized).not.toContain('sk-access-secret');
    expect(serialized).not.toContain('sk-refresh-secret');
    expect(serialized).not.toContain('session-secret');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('Bearer secret');
    expect(serialized).not.toContain('private-value');
  });

  it('returns a safe empty summary for invalid content', () => {
    const summary = buildAuthFileSafeSummary(
      { name: 'invalid.json', type: 'codex', size: 12 },
      '<html>challenge</html>'
    );

    expect(summary.fileSize).toBe(12);
    expect(summary.proxyConfigured).toBe(false);
    expect(summary.headerNames).toEqual([]);
    expect(summary.accountId).toBe('');
  });
});
