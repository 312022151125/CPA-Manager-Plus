import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCodexInspectionLastRun } from '@/features/monitoring/codexInspection';
import {
  createServerCredentialInspectionSnapshot,
  createStoredLocalCredentialInspectionSnapshot,
  isCompletedCredentialInspectionRun,
  selectLatestCredentialInspectionSnapshot,
  type CredentialInspectionResult,
  type CredentialInspectionSnapshot,
} from '@/features/monitoring/model/credentialInspectionSnapshot';
import { usageServiceApi } from '@/services/api';

const EMPTY_CREDENTIAL_INSPECTION_RESULTS: CredentialInspectionResult[] = [];

interface UseCredentialInspectionSnapshotOptions {
  connectionFingerprint: string | null;
  checking: boolean;
  serverAvailable: boolean;
  managerServiceBase: string;
  managementKey: string;
}

export function useCredentialInspectionSnapshot({
  connectionFingerprint,
  checking,
  serverAvailable,
  managerServiceBase,
  managementKey,
}: UseCredentialInspectionSnapshotOptions) {
  const [snapshot, setSnapshot] = useState<CredentialInspectionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const applySnapshot = useCallback((next: CredentialInspectionSnapshot) => {
    setSnapshot((current) => selectLatestCredentialInspectionSnapshot([current, next]));
  }, []);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const localState = connectionFingerprint
      ? loadCodexInspectionLastRun(connectionFingerprint)
      : null;
    const localSnapshot = localState
      ? createStoredLocalCredentialInspectionSnapshot(localState)
      : null;

    if (checking || !serverAvailable || !managerServiceBase || !managementKey) {
      if (requestIdRef.current === requestId) {
        setSnapshot(localSnapshot);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const runsResponse = await usageServiceApi.listCodexInspectionRuns(
        managerServiceBase,
        managementKey,
        10
      );
      if (requestIdRef.current !== requestId) return;
      const latestCompletedRun = runsResponse.items.find(isCompletedCredentialInspectionRun);
      if (!latestCompletedRun) {
        setSnapshot(localSnapshot);
        return;
      }
      const detail = await usageServiceApi.getCodexInspectionRun(
        managerServiceBase,
        managementKey,
        latestCompletedRun.id
      );
      if (requestIdRef.current !== requestId) return;
      setSnapshot(
        selectLatestCredentialInspectionSnapshot([
          localSnapshot,
          createServerCredentialInspectionSnapshot(detail, runsResponse.items),
        ])
      );
    } catch {
      if (requestIdRef.current === requestId) setSnapshot(localSnapshot);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [checking, connectionFingerprint, managementKey, managerServiceBase, serverAvailable]);

  useEffect(() => {
    requestIdRef.current += 1;
    setSnapshot(null);
    setLoading(false);
  }, [connectionFingerprint, managementKey, managerServiceBase]);

  return {
    snapshot,
    results: snapshot?.results ?? EMPTY_CREDENTIAL_INSPECTION_RESULTS,
    loading,
    refresh,
    applySnapshot,
  };
}
