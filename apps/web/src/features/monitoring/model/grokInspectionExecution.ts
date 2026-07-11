import { authFilesApi } from '@/services/api/authFiles';
import type {
  GrokInspectionExecutionOutcome,
  GrokInspectionExecutionResult,
  GrokInspectionLogLevel,
  GrokInspectionResultItem,
  GrokInspectionSettings,
} from '@/features/monitoring/grokInspection';
import type { AuthFileItem } from '@/types';
import { clampPositiveInteger } from './grokInspectionSettings';

type LogHandler = (level: GrokInspectionLogLevel, message: string) => void;

type ExecuteGrokInspectionActionsOptions = {
  settings: GrokInspectionSettings;
  items: GrokInspectionResultItem[];
  previousFiles: AuthFileItem[];
  onLog?: LogHandler;
};

const runConcurrently = async <T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) return [];

  const size = clampPositiveInteger(limit, 1);
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await task(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return results;
};

const dedupeExecutionItems = (items: GrokInspectionResultItem[]) => {
  const map = new Map<string, GrokInspectionResultItem>();
  items.forEach((item) => {
    if (item.action === 'keep') return;
    if (!item.fileName) return;
    if (!map.has(item.fileName)) {
      map.set(item.fileName, item);
    }
  });
  return Array.from(map.values()).sort((left, right) =>
    left.fileName.localeCompare(right.fileName)
  );
};

const executeDelete = async (
  item: GrokInspectionResultItem
): Promise<GrokInspectionExecutionOutcome> => {
  try {
    const result = await authFilesApi.deleteFileByName(item.fileName);
    const failed = result.failed[0];
    if (failed) {
      return {
        action: 'delete',
        fileName: item.fileName,
        displayAccount: item.displayAccount,
        success: false,
        error: failed.error || 'delete failed',
      };
    }
    return {
      action: 'delete',
      fileName: item.fileName,
      displayAccount: item.displayAccount,
      success: true,
      error: '',
    };
  } catch (error) {
    return {
      action: 'delete',
      fileName: item.fileName,
      displayAccount: item.displayAccount,
      success: false,
      error: error instanceof Error ? error.message : String(error || 'delete failed'),
    };
  }
};

const executeStatusChange = async (
  item: GrokInspectionResultItem,
  disabled: boolean
): Promise<GrokInspectionExecutionOutcome> => {
  try {
    await authFilesApi.setStatusWithFallback(item.fileName, disabled);
    return {
      action: disabled ? 'disable' : 'enable',
      fileName: item.fileName,
      displayAccount: item.displayAccount,
      success: true,
      error: '',
    };
  } catch (error) {
    return {
      action: disabled ? 'disable' : 'enable',
      fileName: item.fileName,
      displayAccount: item.displayAccount,
      success: false,
      error: error instanceof Error ? error.message : String(error || 'status update failed'),
    };
  }
};

export const executeGrokInspectionActions = async ({
  settings,
  items,
  previousFiles,
  onLog,
}: ExecuteGrokInspectionActionsOptions): Promise<GrokInspectionExecutionResult> => {
  const dedupedItems = dedupeExecutionItems(items);
  const deleteItems = dedupedItems.filter((item) => item.action === 'delete');
  const disableItems = dedupedItems.filter((item) => item.action === 'disable');
  const enableItems = dedupedItems.filter((item) => item.action === 'enable');
  const outcomes: GrokInspectionExecutionOutcome[] = [];
  const workers = settings.workers;

  if (deleteItems.length > 0) {
    onLog?.('info', `Deleting ${deleteItems.length} account(s)`);
    const deleteOutcomes = await runConcurrently(deleteItems, workers, executeDelete);
    deleteOutcomes.forEach((outcome) => {
      onLog?.(
        outcome.success ? 'success' : 'error',
        `${outcome.displayAccount} delete ${outcome.success ? 'ok' : `failed: ${outcome.error}`}`
      );
    });
    outcomes.push(...deleteOutcomes);
  }

  if (disableItems.length > 0) {
    onLog?.('info', `Disabling ${disableItems.length} account(s)`);
    const disableOutcomes = await runConcurrently(disableItems, workers, (item) =>
      executeStatusChange(item, true)
    );
    disableOutcomes.forEach((outcome) => {
      onLog?.(
        outcome.success ? 'success' : 'error',
        `${outcome.displayAccount} disable ${outcome.success ? 'ok' : `failed: ${outcome.error}`}`
      );
    });
    outcomes.push(...disableOutcomes);
  }

  if (enableItems.length > 0) {
    onLog?.('info', `Enabling ${enableItems.length} account(s)`);
    const enableOutcomes = await runConcurrently(enableItems, workers, (item) =>
      executeStatusChange(item, false)
    );
    enableOutcomes.forEach((outcome) => {
      onLog?.(
        outcome.success ? 'success' : 'error',
        `${outcome.displayAccount} enable ${outcome.success ? 'ok' : `failed: ${outcome.error}`}`
      );
    });
    outcomes.push(...enableOutcomes);
  }

  let refreshedFiles = previousFiles;
  let refreshError = '';
  try {
    const response = await authFilesApi.list();
    refreshedFiles = Array.isArray(response.files) ? response.files : previousFiles;
  } catch (error) {
    refreshError = error instanceof Error ? error.message : String(error || 'refresh failed');
    onLog?.('warning', `Post-execute list refresh failed, using previous snapshot: ${refreshError}`);
  }

  return {
    outcomes,
    refreshedFiles,
    refreshError,
  };
};
