import type { TFunction } from 'i18next';
import type { AuthFilesApiRequestScope } from '@/services/api';
import type { AuthFileItem } from '@/types';
import { buildQuotaFailureState, getScopedQuotaState, type QuotaConfig } from './quotaConfigs';
import { captureQuotaCacheGeneration, commitIfQuotaCacheCurrent } from '@/stores';

export type QuotaUpdater<T> = T | ((previous: T) => T);
export type QuotaSetter<T> = (updater: QuotaUpdater<Record<string, T>>) => void;

export type QuotaRefreshResult<TState, TData> =
  | {
      status: 'success';
      data: TData;
      state: TState;
    }
  | {
      status: 'error';
      data: null;
      state: TState;
      error: string;
    };

export const refreshQuotaWithConfig = async <TState, TData>({
  config,
  file,
  setQuota,
  t,
  isCurrent,
  requestScope,
  currentState,
}: {
  config: QuotaConfig<TState, TData>;
  file: AuthFileItem;
  setQuota: QuotaSetter<TState>;
  t: TFunction;
  isCurrent: () => boolean;
  requestScope?: AuthFilesApiRequestScope;
  currentState?: TState;
}): Promise<QuotaRefreshResult<TState, TData> | null> => {
  const storeKey = config.getStoreKey?.(file) ?? file.name;
  const cacheGeneration = captureQuotaCacheGeneration();
  if (!isCurrent()) return null;

  // A cached quota remains the active evidence while it is being refreshed.
  // Fresh credentials still get the config-owned loading state, while an
  // existing credential keeps its previous data visible until success/failure.
  if (!currentState) {
    const loadingCommitted = commitIfQuotaCacheCurrent(cacheGeneration, () => {
      setQuota((previous) => ({
        ...previous,
        [storeKey]: config.buildLoadingState(file),
      }));
    });
    if (!loadingCommitted) return null;
  }

  try {
    const data = await config.fetchQuota(file, t, requestScope);
    if (!isCurrent()) return null;
    const state = config.buildSuccessState(data, file);
    const committed = commitIfQuotaCacheCurrent(cacheGeneration, () => {
      setQuota((previous) => ({
        ...previous,
        [storeKey]: state,
      }));
    });
    return committed ? { status: 'success', data, state } : null;
  } catch (error: unknown) {
    if (!isCurrent()) return null;
    const message = error instanceof Error ? error.message : t('common.unknown_error');
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
    let state: TState | undefined;
    const committed = commitIfQuotaCacheCurrent(cacheGeneration, () => {
      setQuota((previous) => {
        const previousState = getScopedQuotaState(config, previous, file) ?? currentState;
        state = buildQuotaFailureState(
          config,
          message,
          Number.isFinite(status) ? status : undefined,
          file,
          previousState
        );
        return {
          ...previous,
          [storeKey]: state,
        };
      });
    });
    return committed && state ? { status: 'error', data: null, state, error: message } : null;
  }
};
