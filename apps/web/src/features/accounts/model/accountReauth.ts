import type { AuthFileItem } from '@/types';
import { normalizeAccountProvider } from './accountRows';
import { buildAccountOAuthReauthPath } from './accountReauthSession';

export type AccountReauthAction =
  | { kind: 'codex-dialog' }
  | { kind: 'navigate'; oauthProvider: string; path: string }
  | { kind: 'unsupported'; provider: string };

const OAUTH_PROVIDER_BY_ACCOUNT_PROVIDER: Record<string, string> = {
  anthropic: 'anthropic',
  antigravity: 'antigravity',
  claude: 'anthropic',
  kimi: 'kimi',
  xai: 'xai',
  devin: 'devin',
};

const hasPresentField = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

export const isMetaOAuthCredential = (file: AuthFileItem): boolean => {
  const rawAuthKind = String(file.auth_kind ?? file.authKind ?? '').trim().toLowerCase();
  if (rawAuthKind === 'oauth') return true;
  if (rawAuthKind === 'api_key' || rawAuthKind === 'apikey') return false;

  const hasApiKey = hasPresentField(file.api_key ?? file.apiKey);
  const hasConfigIndex = hasPresentField(file.config_index ?? file.configIndex);
  const source = typeof file.source === 'string' ? file.source.trim().toLowerCase() : '';
  const isConfigSource = source.startsWith('config:');

  if (hasApiKey || hasConfigIndex || isConfigSource) {
    return false;
  }

  const hasOAuthTokenEvidence = Boolean(
    hasPresentField(file.access_token ?? file.accessToken) ||
    hasPresentField(file.refresh_token ?? file.refreshToken) ||
    hasPresentField(file.token)
  );

  return hasOAuthTokenEvidence;
};

export const resolveAccountReauthAction = (file: AuthFileItem): AccountReauthAction => {
  const provider = normalizeAccountProvider(file);
  if (provider === 'codex') return { kind: 'codex-dialog' };

  if (provider === 'meta') {
    if (isMetaOAuthCredential(file)) {
      return {
        kind: 'navigate',
        oauthProvider: 'meta',
        path: buildAccountOAuthReauthPath('meta'),
      };
    }
    return { kind: 'unsupported', provider };
  }

  const oauthProvider = OAUTH_PROVIDER_BY_ACCOUNT_PROVIDER[provider];
  if (oauthProvider) {
    return {
      kind: 'navigate',
      oauthProvider,
      path: buildAccountOAuthReauthPath(oauthProvider),
    };
  }

  return { kind: 'unsupported', provider };
};

