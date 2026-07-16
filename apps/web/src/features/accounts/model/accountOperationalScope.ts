import { getAuthFileCodexInspectionKey } from '@/features/authFiles/model/authFilesPageModel';
import type { AccountRow } from './accountRows';

export interface AccountOperationalItem {
  authFileName: string;
  authIndex?: unknown;
}

export const buildAccountOperationalScopeKeys = (rows: AccountRow[]): Map<string, string[]> => {
  const eligibleRows = rows.filter((row) => !row.runtimeOnly);
  const fallbackCounts = new Map<string, number>();
  eligibleRows.forEach((row) => {
    const fallbackKey = getAuthFileCodexInspectionKey(row.fileName, null);
    fallbackCounts.set(fallbackKey, (fallbackCounts.get(fallbackKey) ?? 0) + 1);
  });

  return new Map(
    eligibleRows.map((row) => {
      const exactKey = getAuthFileCodexInspectionKey(row.fileName, row.authIndex || null);
      const fallbackKey = getAuthFileCodexInspectionKey(row.fileName, null);
      const keys = [exactKey];
      if (fallbackKey !== exactKey && fallbackCounts.get(fallbackKey) === 1) {
        keys.push(fallbackKey);
      }
      return [row.selectionKey, keys];
    })
  );
};

export const buildAccountOperationalItemsByRowKey = <T extends AccountOperationalItem>(
  rows: AccountRow[],
  items: T[]
): Map<string, T[]> => {
  const itemsByScopeKey = new Map<string, T[]>();
  items.forEach((item) => {
    if (!item.authFileName) return;
    const key = getAuthFileCodexInspectionKey(item.authFileName, item.authIndex ?? null);
    itemsByScopeKey.set(key, [...(itemsByScopeKey.get(key) ?? []), item]);
  });

  const scopeKeysByRowKey = buildAccountOperationalScopeKeys(rows);
  return new Map(
    Array.from(scopeKeysByRowKey, ([rowKey, scopeKeys]) => [
      rowKey,
      scopeKeys.flatMap((key) => itemsByScopeKey.get(key) ?? []),
    ])
  );
};
