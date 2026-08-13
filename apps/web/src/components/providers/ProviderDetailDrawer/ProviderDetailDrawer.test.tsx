import type { ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { OpenAIProviderConfig } from '@/types';
import type { ProviderRecentUsageMap } from '../utils';
import { buildProviderRows, type ProviderRow } from '../ProviderTable/rowData';
import { ProviderDetailDrawer } from './ProviderDetailDrawer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'ai_providers.weight_label': 'Weight',
        'ai_providers.weight_default_label': 'default',
      })[key] ?? key,
  }),
}));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

const getText = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : getText(child))).join('');

const renderDetailText = (row: ProviderRow): string => {
  let renderer!: ReactTestRenderer;

  act(() => {
    renderer = create(
      <ProviderDetailDrawer
        row={row}
        open
        usageByProvider={new Map()}
        resolvedTheme="light"
        actionsDisabled={false}
        toggleDisabled={false}
        onClose={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onToggle={() => {}}
        onToggleWebsockets={() => {}}
        onToggleCloak={() => {}}
        onToggleDisableCooling={() => {}}
      />
    );
  });

  const text = getText(renderer.root);
  act(() => renderer.unmount());
  return text;
};

const buildOpenAIRow = (provider: OpenAIProviderConfig) =>
  buildProviderRows({
    gemini: [],
    codex: [],
    claude: [],
    vertex: [],
    openai: [provider],
    usageByProvider: new Map() as ProviderRecentUsageMap,
  })[0];

describe('ProviderDetailDrawer', () => {
  it('shows effective OpenAI key weights, including the default and explicit zero', () => {
    const row = buildOpenAIRow({
      name: 'Weighted OpenAI',
      baseUrl: 'https://openai.example/v1',
      apiKeyEntries: [
        { apiKey: 'default-key' },
        { apiKey: 'weighted-key', weight: 3 },
        { apiKey: 'excluded-key', weight: 0 },
      ],
    });
    const text = renderDetailText(row);
    expect(text).toContain('Weight: 1 (default)');
    expect(text).toContain('Weight: 3');
    expect(text).toContain('Weight: 0');
    expect(text.match(/\(default\)/g)).toHaveLength(1);
  });

  it('shows effective weights for every single-key provider kind', () => {
    const rows = buildProviderRows({
      gemini: [{ apiKey: 'gemini-default' }],
      interactions: [{ apiKey: 'interactions-weighted', weight: 2 }],
      codex: [{ apiKey: 'codex-zero', weight: 0 }],
      xai: [{ apiKey: 'xai-default' }],
      claude: [{ apiKey: 'claude-weighted', weight: 4 }],
      vertex: [{ apiKey: 'vertex-weighted', weight: 5 }],
      openai: [],
      usageByProvider: new Map() as ProviderRecentUsageMap,
    });
    const expectedWeights = new Map<ProviderRow['kind'], string>([
      ['gemini', 'Weight1 (default)'],
      ['interactions', 'Weight2'],
      ['codex', 'Weight0'],
      ['xai', 'Weight1 (default)'],
      ['claude', 'Weight4'],
      ['vertex', 'Weight5'],
    ]);

    expect(rows).toHaveLength(expectedWeights.size);
    rows.forEach((row) => {
      expect(renderDetailText(row)).toContain(expectedWeights.get(row.kind));
    });
  });
});
