export interface WindowUsageForecastMetrics {
  requests: number;
  tokens: number;
  cost: number;
}

export interface WindowUsageForecast extends WindowUsageForecastMetrics {
  basis: 'current' | 'previous';
}

const roundForecastCost = (value: number): number => Math.round(value * 100) / 100;

export const estimateWindowUsage = (input: {
  nowMs: number;
  cycleStartMs: number;
  cycleEndMs: number;
  current: WindowUsageForecastMetrics | null;
  previous?: WindowUsageForecastMetrics | null;
}): WindowUsageForecast | null => {
  const durationMs = input.cycleEndMs - input.cycleStartMs;
  const elapsedMs = Math.min(input.nowMs, input.cycleEndMs) - input.cycleStartMs;
  if (durationMs <= 0 || elapsedMs <= 0) return null;

  const minimumSampleMs = Math.min(15 * 60 * 1000, durationMs * 0.05);
  const hasCurrentSample =
    input.current !== null &&
    elapsedMs >= minimumSampleMs &&
    (input.current.requests > 0 || input.current.tokens > 0 || input.current.cost > 0);
  if (hasCurrentSample && input.current) {
    const multiplier = durationMs / elapsedMs;
    return {
      requests: Math.max(input.current.requests, Math.round(input.current.requests * multiplier)),
      tokens: Math.max(input.current.tokens, Math.round(input.current.tokens * multiplier)),
      cost: Math.max(input.current.cost, roundForecastCost(input.current.cost * multiplier)),
      basis: 'current',
    };
  }
  if (input.previous) {
    return { ...input.previous, basis: 'previous' };
  }
  return null;
};
