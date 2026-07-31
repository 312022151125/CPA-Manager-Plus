import type { AuthFileItem } from '@/types';

export interface AuthFileSafeSummary {
  accountId: string;
  createdAtMs: number | null;
  modifiedAtMs: number | null;
  expiresAtMs: number | null;
  lastRefreshAtMs: number | null;
  fileSize: number | null;
  prefix: string;
  proxyConfigured: boolean;
  maskedProxyUrl: string;
  priority: number | null;
  websockets: boolean | null;
  usingApi: boolean | null;
  headerNames: string[];
  note: string;
  statusMessage: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const readNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const readBoolean = (...values: unknown[]): boolean | null => {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return null;
};

const readTimestampMs = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value !== 'string' || !value.trim()) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const maskProxyUrl = (value: string): string => {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    const protocol = value.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1];
    return protocol ? `${protocol}://已配置` : '已配置';
  }
};

const readHeaderNames = (value: unknown): string[] => {
  if (!isRecord(value)) return [];
  return Object.keys(value)
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
};

export const buildAuthFileSafeSummary = (
  file: AuthFileItem,
  rawText: string
): AuthFileSafeSummary => {
  let content: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (isRecord(parsed)) content = parsed;
  } catch {
    content = {};
  }

  const proxyUrl = readString(content.proxy_url, content.proxyUrl);
  const headers = content.headers;

  return {
    accountId: readString(content.account_id, content.accountId, file.account_id, file.accountId),
    createdAtMs: readTimestampMs(
      content.created_at,
      content.createdAt,
      file.created_at,
      file.createdAt,
      file.created_at_ms,
      file.createdAtMs
    ),
    modifiedAtMs: readTimestampMs(
      file.modified,
      file.modtime,
      file.updated_at,
      file.updatedAt,
      content.updated_at,
      content.updatedAt
    ),
    expiresAtMs: readTimestampMs(
      content.expired,
      content.expires_at,
      content.expiresAt,
      content.expiry
    ),
    lastRefreshAtMs: readTimestampMs(
      content.last_refresh,
      content.lastRefresh,
      file.lastRefresh,
      file.last_refresh
    ),
    fileSize: readNumber(file.size),
    prefix: readString(content.prefix),
    proxyConfigured: Boolean(proxyUrl),
    maskedProxyUrl: maskProxyUrl(proxyUrl),
    priority: readNumber(content.priority, file.priority),
    websockets: readBoolean(content.websockets, content.websocket, file.websockets),
    usingApi: readBoolean(content.using_api, content.usingApi, file.using_api, file.usingApi),
    headerNames: readHeaderNames(headers),
    note: readString(content.note, file.note),
    statusMessage: readString(file.statusMessage, file.status_message, content.status_message),
  };
};
