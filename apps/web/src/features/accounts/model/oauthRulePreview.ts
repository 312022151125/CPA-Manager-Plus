import type { OAuthModelAliasEntry } from '@/types';

export interface OAuthRulePreviewRow {
  provider: string;
  inputModel: string;
  matchedExclude: boolean;
  matchedAlias: string;
  effectiveModel: string;
  effectiveStatus: 'available' | 'excluded' | 'aliased';
  explanationKey: string;
}

const normalize = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const buildOAuthRulePreviewRows = ({
  providers,
  excluded,
  aliases,
  inputModel,
}: {
  providers: string[];
  excluded: Record<string, string[]>;
  aliases: Record<string, OAuthModelAliasEntry[]>;
  inputModel: string;
}): OAuthRulePreviewRow[] => {
  const modelKey = normalize(inputModel);
  const providerList = Array.from(
    new Set([
      ...providers.map(normalize),
      ...Object.keys(excluded).map(normalize),
      ...Object.keys(aliases).map(normalize),
    ])
  )
    .filter(Boolean)
    .sort();

  return providerList.map((provider) => {
    const excludedModels = excluded[provider] ?? [];
    const matchedExclude = Boolean(
      modelKey &&
        excludedModels.some((model) => {
          const key = normalize(model);
          return key === modelKey || key === '*';
        })
    );
    const aliasEntry = (aliases[provider] ?? []).find((entry) => normalize(entry.name) === modelKey);
    const matchedAlias = aliasEntry?.alias ?? '';

    if (matchedExclude) {
      return {
        provider,
        inputModel,
        matchedExclude: true,
        matchedAlias,
        effectiveModel: matchedAlias || inputModel,
        effectiveStatus: 'excluded',
        explanationKey: 'accounts.oauth_preview_excluded',
      };
    }

    if (matchedAlias) {
      return {
        provider,
        inputModel,
        matchedExclude: false,
        matchedAlias,
        effectiveModel: matchedAlias,
        effectiveStatus: 'aliased',
        explanationKey: 'accounts.oauth_preview_aliased',
      };
    }

    return {
      provider,
      inputModel,
      matchedExclude: false,
      matchedAlias: '',
      effectiveModel: inputModel,
      effectiveStatus: 'available',
      explanationKey: 'accounts.oauth_preview_available',
    };
  });
};
