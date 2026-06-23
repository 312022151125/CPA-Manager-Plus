import { describe, expect, it } from 'vitest';
import { buildOAuthRulePreviewRows } from './oauthRulePreview';

describe('oauthRulePreview', () => {
  it('marks exact excluded model matches as excluded', () => {
    const rows = buildOAuthRulePreviewRows({
      providers: ['codex'],
      excluded: {
        codex: ['gpt-5'],
      },
      aliases: {},
      inputModel: 'GPT-5',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'codex',
      matchedExclude: true,
      matchedAlias: '',
      effectiveModel: 'GPT-5',
      effectiveStatus: 'excluded',
      explanationKey: 'accounts.oauth_preview_excluded',
    });
  });

  it('marks alias matches as aliased when no exclusion applies', () => {
    const rows = buildOAuthRulePreviewRows({
      providers: ['codex'],
      excluded: {},
      aliases: {
        codex: [{ name: 'gpt-5', alias: 'gpt-5-high' }],
      },
      inputModel: 'gpt-5',
    });

    expect(rows[0]).toMatchObject({
      provider: 'codex',
      matchedExclude: false,
      matchedAlias: 'gpt-5-high',
      effectiveModel: 'gpt-5-high',
      effectiveStatus: 'aliased',
      explanationKey: 'accounts.oauth_preview_aliased',
    });
  });

  it('marks providers without matching rules as available', () => {
    const rows = buildOAuthRulePreviewRows({
      providers: ['claude'],
      excluded: {
        codex: ['*'],
      },
      aliases: {
        xai: [{ name: 'grok', alias: 'xai-default' }],
      },
      inputModel: 'sonnet',
    });

    const claude = rows.find((row) => row.provider === 'claude');
    expect(claude).toMatchObject({
      provider: 'claude',
      matchedExclude: false,
      matchedAlias: '',
      effectiveModel: 'sonnet',
      effectiveStatus: 'available',
      explanationKey: 'accounts.oauth_preview_available',
    });
  });

  it('keeps exclusion higher priority than alias for the same provider and model', () => {
    const rows = buildOAuthRulePreviewRows({
      providers: ['codex'],
      excluded: {
        codex: ['gpt-5'],
      },
      aliases: {
        codex: [{ name: 'gpt-5', alias: 'gpt-5-high' }],
      },
      inputModel: 'gpt-5',
    });

    expect(rows[0]).toMatchObject({
      matchedExclude: true,
      matchedAlias: 'gpt-5-high',
      effectiveModel: 'gpt-5-high',
      effectiveStatus: 'excluded',
    });
  });
});
