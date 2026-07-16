import { useCallback, useEffect, useRef, useState } from 'react';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem } from '@/types';
import {
  buildAuthFileSafeSummary,
  type AuthFileSafeSummary,
} from '@/features/authFiles/model/authFileSafeSummary';

export interface AccountCredentialSafeSummaryState {
  fileName: string;
  loading: boolean;
  error: string;
  summary: AuthFileSafeSummary | null;
}

const EMPTY_STATE: AccountCredentialSafeSummaryState = {
  fileName: '',
  loading: false,
  error: '',
  summary: null,
};

export const useAccountCredentialSafeSummary = (file: AuthFileItem | null, enabled: boolean) => {
  const cacheRef = useRef(new Map<string, AuthFileSafeSummary>());
  const requestIdRef = useRef(0);
  const [state, setState] = useState<AccountCredentialSafeSummaryState>(EMPTY_STATE);

  const load = useCallback(
    async (force = false) => {
      if (!file || !enabled || file.runtimeOnly === true || file.runtime_only === true) {
        setState(EMPTY_STATE);
        return;
      }

      const fileName = file.name;
      const cached = !force ? cacheRef.current.get(fileName) : undefined;
      if (cached) {
        setState({ fileName, loading: false, error: '', summary: cached });
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setState({ fileName, loading: true, error: '', summary: null });

      try {
        const rawText = await authFilesApi.downloadText(fileName);
        if (requestIdRef.current !== requestId) return;
        const summary = buildAuthFileSafeSummary(file, rawText);
        cacheRef.current.set(fileName, summary);
        setState({ fileName, loading: false, error: '', summary });
      } catch (error: unknown) {
        if (requestIdRef.current !== requestId) return;
        setState({
          fileName,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load credential details',
          summary: null,
        });
      }
    },
    [enabled, file]
  );

  const invalidate = useCallback(
    (fileName?: string) => {
      if (fileName) cacheRef.current.delete(fileName);
      else cacheRef.current.clear();
      if (enabled && file && (!fileName || file.name === fileName)) {
        void load(true);
      }
    },
    [enabled, file, load]
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [load]);

  return { ...state, reload: () => load(true), invalidate };
};
