import type { AuthFileItem } from '@/types/authFile';
import { parseIdTokenPayload } from '@/utils/quota/parsers';
import { resolveCodexPlanType } from '@/utils/quota/resolvers';
import { normalizePlanProvider, normalizeRawPlanType } from './normalize';
import { resolveAntigravityPlanType } from './providers/antigravity';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const firstMeaningfulPlan = (values: unknown[]): string | null => {
  const normalized = values
    .map(normalizeRawPlanType)
    .filter((value): value is string => value !== null);
  return normalized.find((value) => value !== 'unknown') ?? normalized[0] ?? null;
};

const readTokenPlanType = (value: unknown): string | null => {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return firstMeaningfulPlan([payload.plan_type, payload.planType]);
};

const readNestedSubscriptionPlanType = (value: unknown): string | null => {
  const record = asRecord(value);
  if (!record) return normalizeRawPlanType(value);
  return firstMeaningfulPlan([record.plan, record.tierName, record.tierId]);
};

/** Resolves a raw provider plan identity without changing the raw quota/API contract. */
export const resolveAuthFilePlanType = (file: AuthFileItem): string | null => {
  const provider = normalizePlanProvider(file.provider ?? file.type);
  const codexPlanType = provider === 'codex' ? resolveCodexPlanType(file) : null;
  if (codexPlanType && codexPlanType !== 'unknown') return codexPlanType;

  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);
  const tokenCandidates = [file.id_token, metadata?.id_token, attributes?.id_token];
  const tokenPlanType = firstMeaningfulPlan(tokenCandidates.map(readTokenPlanType));
  if (tokenPlanType && tokenPlanType !== 'unknown') return tokenPlanType;

  const directPlanType = firstMeaningfulPlan([
    file.plan_type,
    file.planType,
    metadata?.plan_type,
    metadata?.planType,
    attributes?.plan_type,
    attributes?.planType,
    file.tier,
    file.tierName,
    file.tierId,
    file.subscriptionType,
    file.accountType,
  ]);
  if (directPlanType && directPlanType !== 'unknown') return directPlanType;

  const subscriptionPlanType = firstMeaningfulPlan([
    provider === 'antigravity'
      ? resolveAntigravityPlanType(file.subscription)
      : readNestedSubscriptionPlanType(file.subscription),
    readNestedSubscriptionPlanType(metadata?.subscription),
    readNestedSubscriptionPlanType(attributes?.subscription),
  ]);
  return subscriptionPlanType ?? tokenPlanType ?? directPlanType ?? codexPlanType;
};
