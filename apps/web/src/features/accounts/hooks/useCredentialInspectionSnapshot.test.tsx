import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { useCredentialInspectionSnapshot } from './useCredentialInspectionSnapshot';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { mocks } = vi.hoisted(() => ({
  mocks: {
    loadLastRun: vi.fn(() => null),
    listRuns: vi.fn(async () => ({ items: [] })),
    getRun: vi.fn(),
  },
}));

vi.mock('@/features/monitoring/codexInspection', () => ({
  loadCodexInspectionLastRun: mocks.loadLastRun,
}));

vi.mock('@/services/api', () => ({
  usageServiceApi: {
    listCodexInspectionRuns: mocks.listRuns,
    getCodexInspectionRun: mocks.getRun,
  },
}));

function Harness({ onResults }: { onResults: (results: readonly unknown[]) => void }) {
  const { results } = useCredentialInspectionSnapshot({
    connectionFingerprint: 'connection-a',
    checking: false,
    serverAvailable: false,
    managerServiceBase: '',
    managementKey: 'manager-key',
  });
  onResults(results);
  return null;
}

describe('useCredentialInspectionSnapshot', () => {
  it('keeps the empty result collection stable across parent renders', () => {
    const observed: Array<readonly unknown[]> = [];
    const onResults = (results: readonly unknown[]) => observed.push(results);
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(<Harness onResults={onResults} />);
    });
    const initialResults = observed[observed.length - 1];

    act(() => {
      renderer!.update(<Harness onResults={onResults} />);
    });

    expect(initialResults).toBeDefined();
    expect(observed[observed.length - 1]).toBe(initialResults);
    expect(mocks.listRuns).not.toHaveBeenCalled();
  });
});
