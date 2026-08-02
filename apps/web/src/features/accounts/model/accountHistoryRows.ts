import type {
  MonitoringAccountHistoryItem,
  MonitoringAccountHistoryTarget,
} from '@/services/api/usageService';
import { resolveCredentialIdentity } from '@/utils/authFileCredentialIdentity';
import type { AccountRow } from './accountRows';

export interface AccountHistoryTargetEntry {
  rowKey: string;
  target: MonitoringAccountHistoryTarget;
}

const readString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const readRowKey = (value: unknown): string => (typeof value === 'string' ? value : '');

export const buildAccountHistoryTargetEntries = (rows: AccountRow[]): AccountHistoryTargetEntry[] =>
  rows
    .map((row) => {
      const identity = resolveCredentialIdentity(row.raw);
      const accountSnapshot = identity.accountSnapshot;
      const authLabelSnapshot = identity.authLabelSnapshot;
      const authFileSnapshot = identity.physicalName || readString(row.fileName);
      const rowProvider = readString(row.provider);
      const authProviderSnapshot =
        identity.provider || (rowProvider === 'unknown' ? '' : rowProvider);
      const authProjectIdSnapshot = identity.accountId || readString(row.projectId);
      const authIndex = identity.authIndex || readString(row.authIndex);

      return {
        rowKey: row.selectionKey,
        target: {
          row_key: row.selectionKey,
          account_snapshot: accountSnapshot || undefined,
          auth_label_snapshot: authLabelSnapshot || undefined,
          auth_file_snapshot: authFileSnapshot || undefined,
          auth_provider_snapshot: authProviderSnapshot || undefined,
          auth_project_id_snapshot: authProjectIdSnapshot || undefined,
          auth_index: authIndex || undefined,
          source: authFileSnapshot || undefined,
        },
      };
    })
    .filter(
      (entry) =>
        entry.target.auth_file_snapshot ||
        entry.target.auth_index ||
        entry.target.auth_project_id_snapshot ||
        entry.target.account_snapshot ||
        entry.target.auth_label_snapshot ||
        entry.target.source
    );

export const buildAccountHistoryByRowKey = (
  entries: AccountHistoryTargetEntry[],
  items: MonitoringAccountHistoryItem[]
): Map<string, MonitoringAccountHistoryItem> => {
  const result = new Map<string, MonitoringAccountHistoryItem>();
  const requestedRowKeys = new Set(entries.map((entry) => entry.rowKey));
  items.forEach((item) => {
    const rowKey = readRowKey(item.row_key);
    if (rowKey && requestedRowKeys.has(rowKey)) {
      result.set(rowKey, item);
    }
  });
  return result;
};
