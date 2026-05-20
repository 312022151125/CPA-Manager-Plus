import type { AuthFileItem } from '@/types';
import {
  isAntigravityFile,
  isClaudeFile,
  isCodexFile,
  isDisabledAuthFile,
  isGeminiCliFile,
  isKimiFile,
  isRuntimeOnlyAuthFile,
  normalizeAuthIndex,
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
} from '@/utils/quota';
import type { MonitoringAccountAuthState } from './accountOverviewState';
import type { MonitoringAccountRow } from './hooks/useMonitoringData';

export type MonitoringAccountQuotaProvider =
  | 'antigravity'
  | 'claude'
  | 'codex'
  | 'gemini-cli'
  | 'kimi';

export type MonitoringAccountQuotaTarget = {
  key: string;
  provider: MonitoringAccountQuotaProvider;
  authIndex: string;
  authLabel: string;
  fileName: string;
  file: AuthFileItem;
  accountId: string | null;
  planType: string | null;
};

const readAuthFileQuotaLabel = (file: AuthFileItem, authIndex: string) => {
  const candidates = [file.label, file.name, file.email, file.account, authIndex];
  for (const candidate of candidates) {
    const text =
      typeof candidate === 'string'
        ? candidate.trim()
        : candidate === null || candidate === undefined
          ? ''
          : String(candidate).trim();
    if (text) return text;
  }
  return authIndex;
};

export const resolveMonitoringAccountQuotaProvider = (
  file: AuthFileItem
): MonitoringAccountQuotaProvider | null => {
  if (isDisabledAuthFile(file)) return null;
  if (isCodexFile(file)) return 'codex';
  if (isClaudeFile(file)) return 'claude';
  if (isAntigravityFile(file)) return 'antigravity';
  if (isGeminiCliFile(file) && !isRuntimeOnlyAuthFile(file)) return 'gemini-cli';
  if (isKimiFile(file)) return 'kimi';
  return null;
};

export const buildMonitoringAccountQuotaTargetsByAccount = (
  rows: MonitoringAccountRow[],
  authStateByRowId: Map<string, MonitoringAccountAuthState>
) =>
  new Map(
    rows.map((row) => {
      const bucket = new Map<string, MonitoringAccountQuotaTarget>();
      const authState = authStateByRowId.get(row.id);

      authState?.files.forEach((file) => {
        const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
        const provider = resolveMonitoringAccountQuotaProvider(file);
        if (!authIndex || !provider) return;

        const dedupeKey = `${provider}::${authIndex}::${file.name}`;
        if (bucket.has(dedupeKey)) return;

        bucket.set(dedupeKey, {
          key: dedupeKey,
          provider,
          authIndex,
          authLabel: readAuthFileQuotaLabel(file, authIndex),
          fileName: file.name,
          file,
          accountId: provider === 'codex' ? resolveCodexChatgptAccountId(file) : null,
          planType: provider === 'codex' ? resolveCodexPlanType(file) : null,
        });
      });

      return [
        row.account,
        Array.from(bucket.values()).sort(
          (left, right) =>
            left.authLabel.localeCompare(right.authLabel) ||
            left.provider.localeCompare(right.provider)
        ),
      ] as const;
    })
  );
