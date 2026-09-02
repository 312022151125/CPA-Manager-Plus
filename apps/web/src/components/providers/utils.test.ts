import { describe, expect, it } from 'vitest';
import {
  hasModelThinkingLevelsClearMarker,
  hasModelThinkingLevelsEditMarker,
  markModelThinkingLevelsForClear,
  markModelThinkingLevelsForEdit,
} from '@/types';
import {
  buildApiKeyEntry,
  buildCodexResponsesEndpoint,
  resolveClaudeFingerprintSelection,
  toCommittedOpenAIProviderSnapshot,
} from './utils';

describe('provider utils', () => {
  it('builds Codex responses endpoints from common base URL forms', () => {
    expect(buildCodexResponsesEndpoint('https://api.example.test')).toBe(
      'https://api.example.test/v1/responses'
    );
    expect(buildCodexResponsesEndpoint('https://api.example.test/v1')).toBe(
      'https://api.example.test/v1/responses'
    );
    expect(buildCodexResponsesEndpoint('https://api.example.test/v1/models')).toBe(
      'https://api.example.test/v1/responses'
    );
    expect(buildCodexResponsesEndpoint('https://api.example.test/v1/responses')).toBe(
      'https://api.example.test/v1/responses'
    );
  });

  it('preserves an explicit zero weight when building an OpenAI key entry', () => {
    expect(buildApiKeyEntry({ apiKey: 'key', weight: 0 })).toMatchObject({
      apiKey: 'key',
      weight: 0,
    });
    expect(buildApiKeyEntry()).toHaveProperty('weight', undefined);
  });

  it('strips one-shot model markers from committed OpenAI provider snapshots', () => {
    const markedModel = markModelThinkingLevelsForClear({
      name: 'model',
      thinking: { futureOption: { enabled: true } },
      futureModelOption: 123,
    });
    const editedModel = markModelThinkingLevelsForEdit({
      name: 'edited-model',
      thinking: { levels: ['high'] },
    });
    const provider = {
      name: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'key' }],
      models: [markedModel, editedModel],
      futureProviderOption: { enabled: true },
    };

    const committed = toCommittedOpenAIProviderSnapshot(provider);

    expect(committed).not.toBe(provider);
    expect(committed.models).not.toBe(provider.models);
    expect(provider.models?.[0]).toBe(markedModel);
    expect(hasModelThinkingLevelsClearMarker(markedModel)).toBe(true);
    expect(hasModelThinkingLevelsEditMarker(editedModel)).toBe(true);
    expect(hasModelThinkingLevelsClearMarker(committed.models?.[0])).toBe(false);
    expect(hasModelThinkingLevelsEditMarker(committed.models?.[1])).toBe(false);
    expect(committed.models?.[0]).toMatchObject({
      name: 'model',
      thinking: markedModel.thinking,
      futureModelOption: 123,
    });
    expect(committed.futureProviderOption).toBe(provider.futureProviderOption);
  });
});

describe('resolveClaudeFingerprintSelection', () => {
  it('keeps an untouched fingerprint untouched when Default is re-picked', () => {
    expect(resolveClaudeFingerprintSelection(undefined, '')).toBeUndefined();
    expect(resolveClaudeFingerprintSelection(undefined, 'claude-code-cli')).toBe('claude-code-cli');
  });

  it('only reaches an explicit Default through Claude Code CLI first', () => {
    expect(resolveClaudeFingerprintSelection('claude-code-cli', '')).toBe('');
    expect(resolveClaudeFingerprintSelection('', '')).toBe('');
    expect(resolveClaudeFingerprintSelection('claude-code-cli', 'claude-code-cli')).toBe(
      'claude-code-cli'
    );
  });
});
