/**
 * Quota cache that survives route switches.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  KimiQuotaState,
  XaiQuotaState,
} from '@/types';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { STORAGE_KEY_QUOTA_CACHE } from '@/utils/constants';

type QuotaUpdater<T> = T | ((prev: T) => T);

interface QuotaStoreState {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  xaiQuota: Record<string, XaiQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setXaiQuota: (updater: QuotaUpdater<Record<string, XaiQuotaState>>) => void;
  clearQuotaCache: () => void;
}

const resolveUpdater = <T>(updater: QuotaUpdater<T>, prev: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
};

const emptyQuotaState = {
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  kimiQuota: {},
  xaiQuota: {},
};

type PersistableQuotaState = {
  status?: string;
  observedFromUsageHeaders?: boolean;
};

const isPersistableQuotaState = (item: PersistableQuotaState | undefined): boolean =>
  item?.status === 'success' || item?.status === 'error';

const filterPersistableQuotaStates = <TState extends PersistableQuotaState>(
  quota: Record<string, TState> | undefined
): Record<string, TState> => {
  if (!quota) return {};

  return Object.fromEntries(
    Object.entries(quota).filter(([, item]) => isPersistableQuotaState(item))
  );
};

const filterPersistableCodexQuota = (
  quota: Record<string, CodexQuotaState> | undefined
): Record<string, CodexQuotaState> => {
  if (!quota) return {};

  return Object.fromEntries(
    Object.entries(quota).filter(([, item]) => {
      if (!isPersistableQuotaState(item)) return false;
      return item.status !== 'success' || item.observedFromUsageHeaders !== true;
    })
  );
};

export const useQuotaStore = create<QuotaStoreState>()(
  persist(
    (set) => ({
      ...emptyQuotaState,
      setAntigravityQuota: (updater) =>
        set((state) => ({
          antigravityQuota: resolveUpdater(updater, state.antigravityQuota),
        })),
      setClaudeQuota: (updater) =>
        set((state) => ({
          claudeQuota: resolveUpdater(updater, state.claudeQuota),
        })),
      setCodexQuota: (updater) =>
        set((state) => ({
          codexQuota: resolveUpdater(updater, state.codexQuota),
        })),
      setKimiQuota: (updater) =>
        set((state) => ({
          kimiQuota: resolveUpdater(updater, state.kimiQuota),
        })),
      setXaiQuota: (updater) =>
        set((state) => ({
          xaiQuota: resolveUpdater(updater, state.xaiQuota),
        })),
      clearQuotaCache: () => set(emptyQuotaState),
    }),
    {
      name: STORAGE_KEY_QUOTA_CACHE,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          if (typeof localStorage === 'undefined') return null;
          const data = obfuscatedStorage.getItem<Partial<QuotaStoreState>>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          if (typeof localStorage === 'undefined') return;
          obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          if (typeof localStorage === 'undefined') return;
          obfuscatedStorage.removeItem(name);
        },
      })),
      partialize: (state) => ({
        antigravityQuota: filterPersistableQuotaStates(state.antigravityQuota),
        claudeQuota: filterPersistableQuotaStates(state.claudeQuota),
        codexQuota: filterPersistableCodexQuota(state.codexQuota),
        kimiQuota: filterPersistableQuotaStates(state.kimiQuota),
        xaiQuota: filterPersistableQuotaStates(state.xaiQuota),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<QuotaStoreState> | undefined;
        return {
          ...currentState,
          antigravityQuota: filterPersistableQuotaStates(persisted?.antigravityQuota),
          claudeQuota: filterPersistableQuotaStates(persisted?.claudeQuota),
          codexQuota: filterPersistableCodexQuota(persisted?.codexQuota),
          kimiQuota: filterPersistableQuotaStates(persisted?.kimiQuota),
          xaiQuota: filterPersistableQuotaStates(persisted?.xaiQuota),
        };
      },
    }
  )
);
