export const normalizePlanProvider = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/_/g, '-');
};

export const normalizeRawPlanType = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};
