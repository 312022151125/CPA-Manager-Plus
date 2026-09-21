import { describe, expect, it } from 'vitest';
import { resolveAccountReauthAction } from './accountReauth';

describe('accountReauth', () => {
  it('keeps Codex on the dedicated reauth dialog', () => {
    expect(resolveAccountReauthAction({ name: 'codex.json', type: 'codex' })).toEqual({
      kind: 'codex-dialog',
    });
  });

  it('routes xAI and Claude accounts to their OAuth providers', () => {
    expect(resolveAccountReauthAction({ name: 'xai.json', type: 'xai' })).toEqual({
      kind: 'navigate',
      oauthProvider: 'xai',
      path: '/oauth#oauth-provider-xai',
    });
    expect(resolveAccountReauthAction({ name: 'claude.json', type: 'claude' })).toEqual({
      kind: 'navigate',
      oauthProvider: 'anthropic',
      path: '/oauth#oauth-provider-anthropic',
    });
    expect(resolveAccountReauthAction({ name: 'devin.json', type: 'devin' })).toEqual({
      kind: 'navigate',
      oauthProvider: 'devin',
      path: '/oauth#oauth-provider-devin',
    });
  });

  it('routes Meta OAuth credentials to Meta OAuth reauth path', () => {
    // snake_case auth_kind
    expect(
      resolveAccountReauthAction({
        name: 'meta-oauth.json',
        provider: 'meta',
        auth_kind: 'oauth',
      })
    ).toEqual({
      kind: 'navigate',
      oauthProvider: 'meta',
      path: '/oauth#oauth-provider-meta',
    });

    // camelCase authKind with muse alias
    expect(
      resolveAccountReauthAction({
        name: 'muse-oauth.json',
        provider: 'muse',
        authKind: 'oauth',
      })
    ).toEqual({
      kind: 'navigate',
      oauthProvider: 'meta',
      path: '/oauth#oauth-provider-meta',
    });

    // explicit token evidence fallback
    expect(
      resolveAccountReauthAction({
        name: 'meta-token.json',
        provider: 'meta',
        access_token: 'dummy-token',
      })
    ).toEqual({
      kind: 'navigate',
      oauthProvider: 'meta',
      path: '/oauth#oauth-provider-meta',
    });
  });

  it('returns unsupported reauth action for Meta API-key and config credentials', () => {
    // api_key + config_index
    expect(
      resolveAccountReauthAction({
        name: 'meta-key.json',
        provider: 'meta',
        api_key: 'redacted-dummy-key',
        config_index: 0,
      })
    ).toEqual({
      kind: 'unsupported',
      provider: 'meta',
    });

    // auth_kind = api_key
    expect(
      resolveAccountReauthAction({
        name: 'meta-key.json',
        provider: 'meta',
        auth_kind: 'api_key',
      })
    ).toEqual({
      kind: 'unsupported',
      provider: 'meta',
    });

    // camelCase authKind = apikey
    expect(
      resolveAccountReauthAction({
        name: 'meta-key.json',
        provider: 'meta',
        authKind: 'apikey',
      })
    ).toEqual({
      kind: 'unsupported',
      provider: 'meta',
    });

    // camelCase apiKey
    expect(
      resolveAccountReauthAction({
        name: 'meta-key.json',
        provider: 'meta',
        apiKey: 'redacted-dummy-key',
      })
    ).toEqual({
      kind: 'unsupported',
      provider: 'meta',
    });

    // camelCase configIndex
    expect(
      resolveAccountReauthAction({
        name: 'meta-key.json',
        provider: 'meta',
        configIndex: 1,
      })
    ).toEqual({
      kind: 'unsupported',
      provider: 'meta',
    });

    // source config:...
    expect(
      resolveAccountReauthAction({
        name: 'meta-config.json',
        provider: 'meta',
        source: 'config:meta-api-key',
      })
    ).toEqual({
      kind: 'unsupported',
      provider: 'meta',
    });

    // bare meta credential without OAuth signals
    expect(
      resolveAccountReauthAction({
        name: 'meta-bare.json',
        provider: 'meta',
      })
    ).toEqual({
      kind: 'unsupported',
      provider: 'meta',
    });
  });

  it('returns an explicit unsupported action for providers without OAuth login', () => {
    expect(resolveAccountReauthAction({ name: 'vertex.json', type: 'vertex' })).toEqual({
      kind: 'unsupported',
      provider: 'vertex',
    });
  });
});
