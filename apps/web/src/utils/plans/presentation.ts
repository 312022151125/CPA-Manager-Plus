import type { TFunction } from 'i18next';
import { normalizePlanProvider, normalizeRawPlanType } from './normalize';
import {
  resolveAntigravityPlanDescriptor,
  resolveClaudePlanDescriptor,
  resolveCodexPlanDescriptor,
} from './providers';
import type { PlanResolverDescriptor } from './providers/types';
import type { GetPlanPresentationInput, PlanDisplayMode, PlanPresentation } from './types';

type PlanResolver = (planType: unknown) => PlanResolverDescriptor | null;

const PLAN_RESOLVERS: Readonly<Record<string, PlanResolver>> = {
  codex: resolveCodexPlanDescriptor,
  claude: resolveClaudePlanDescriptor,
  antigravity: resolveAntigravityPlanDescriptor,
};

const translate = (t: TFunction | undefined, key: string, fallback: string): string => {
  if (!t) return fallback;
  const value = t(key, { defaultValue: fallback });
  return value === key ? fallback : value;
};

const resolveDescriptor = (provider: string, planType: unknown) =>
  PLAN_RESOLVERS[provider]?.(planType) ?? null;

export const getCanonicalPlanType = (provider: unknown, planType: unknown): string | null => {
  const normalized = normalizeRawPlanType(planType);
  if (!normalized) return null;
  return (
    resolveDescriptor(normalizePlanProvider(provider), normalized)?.canonicalPlanType ?? normalized
  );
};

export const getPlanPresentation = ({
  provider,
  planType,
  t,
}: GetPlanPresentationInput): PlanPresentation | null => {
  const normalizedProvider = normalizePlanProvider(provider) || 'unknown';
  const rawPlanType = normalizeRawPlanType(planType);
  if (!rawPlanType) return null;

  const resolved = resolveDescriptor(normalizedProvider, rawPlanType);
  if (!resolved) {
    return {
      provider: normalizedProvider,
      rawPlanType,
      canonicalPlanType: rawPlanType,
      shortLabel: rawPlanType,
      fullLabel: rawPlanType,
      known: false,
    };
  }

  const shortLabel = translate(t, resolved.shortLabelKey, resolved.shortDefault);
  const fullLabel = translate(
    t,
    resolved.fullLabelKey ?? resolved.shortLabelKey,
    resolved.fullDefault ?? resolved.shortDefault
  );
  return {
    provider: normalizedProvider,
    rawPlanType,
    canonicalPlanType: resolved.canonicalPlanType,
    shortLabel,
    fullLabel,
    known: true,
  };
};

export const getPlanLabel = (
  presentation: PlanPresentation | null | undefined,
  mode: PlanDisplayMode = 'compact'
): string | null => {
  if (!presentation) return null;
  return mode === 'full' ? presentation.fullLabel : presentation.shortLabel;
};
