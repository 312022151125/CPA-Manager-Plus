import type {
  MonitoringAccountHistoryItem,
  MonitoringAccountHistoryTarget,
} from '@/services/api/usageService';
import type { AccountRow } from './accountRows';

export interface AccountHistoryTargetEntry {
  rowKey: string;
  accountKey: string;
  target: MonitoringAccountHistoryTarget;
}

const readString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

export const buildAccountHistoryTargetEntries = (rows: AccountRow[]): AccountHistoryTargetEntry[] =>
  rows
    .map((row) => {
      const accountSnapshot = readString(row.raw.account) || readString(row.raw.email);
      const authLabelSnapshot = readString(row.raw.label) || readString(row.raw.note);
      const source = readString(row.fileName);
      const authIndex = readString(row.authIndex);
      const accountKey = accountSnapshot || authLabelSnapshot || source || authIndex;

      return {
        rowKey: row.selectionKey,
        accountKey,
        target: {
          account_snapshot: accountSnapshot || undefined,
          auth_label_snapshot: authLabelSnapshot || undefined,
          source: source || undefined,
          auth_index: authIndex || undefined,
        },
      };
    })
    .filter((entry) => entry.accountKey);

export const buildAccountHistoryByRowKey = (
  entries: AccountHistoryTargetEntry[],
  items: MonitoringAccountHistoryItem[]
): Map<string, MonitoringAccountHistoryItem> => {
  const result = new Map<string, MonitoringAccountHistoryItem>();
  entries.forEach((entry, index) => {
    const item =
      items[index] ?? items.find((candidate) => candidate.account_key === entry.accountKey);
    if (item) {
      result.set(entry.rowKey, item);
    }
  });
  return result;
};
