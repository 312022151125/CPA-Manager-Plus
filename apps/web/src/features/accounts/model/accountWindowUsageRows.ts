import type {
  MonitoringAccountWindowUsageItem,
  MonitoringAccountWindowUsageTarget,
} from '@/services/api/usageService';
import type { AccountRow } from './accountRows';
import { buildAccountHistoryTargetEntries } from './accountHistoryRows';

export interface AccountWindowUsageWindow {
  key: string;
  fromMs: number | null;
  toMs: number | null;
}

export interface AccountWindowUsageTargetEntry {
  rowKey: string;
  windowKey: string;
  requestKey: string;
  target: MonitoringAccountWindowUsageTarget;
}

export const accountWindowUsageRequestKey = (rowKey: string, windowKey: string) =>
  `${rowKey}\u0000${windowKey}`;

export const buildAccountWindowUsageTargetEntries = (
  rows: AccountRow[],
  windowsByRowKey: Map<string, AccountWindowUsageWindow[]>
): AccountWindowUsageTargetEntry[] => {
  const targetByRowKey = new Map(
    buildAccountHistoryTargetEntries(rows).map((entry) => [entry.rowKey, entry.target])
  );
  const entries: AccountWindowUsageTargetEntry[] = [];

  rows.forEach((row) => {
    const accountTarget = targetByRowKey.get(row.selectionKey);
    if (!accountTarget) return;
    const windows = windowsByRowKey.get(row.selectionKey) ?? [];
    windows.forEach((window) => {
      if (!window.fromMs || !window.toMs || window.fromMs >= window.toMs) return;
      const requestKey = accountWindowUsageRequestKey(row.selectionKey, window.key);
      entries.push({
        rowKey: row.selectionKey,
        windowKey: window.key,
        requestKey,
        target: {
          row_key: row.selectionKey,
          window_key: window.key,
          from_ms: window.fromMs,
          to_ms: window.toMs,
          account_snapshot: accountTarget.account_snapshot,
          auth_label_snapshot: accountTarget.auth_label_snapshot,
          auth_index: accountTarget.auth_index,
          source: accountTarget.source,
        },
      });
    });
  });

  return entries;
};

export const buildAccountWindowUsageByKey = (
  entries: AccountWindowUsageTargetEntry[],
  items: MonitoringAccountWindowUsageItem[]
): Map<string, MonitoringAccountWindowUsageItem> => {
  const result = new Map<string, MonitoringAccountWindowUsageItem>();
  entries.forEach((entry, index) => {
    const item =
      items.find(
        (candidate) =>
          candidate.row_key === entry.rowKey && candidate.window_key === entry.windowKey
      ) ?? items[index];
    if (item) {
      result.set(entry.requestKey, item);
    }
  });
  return result;
};
