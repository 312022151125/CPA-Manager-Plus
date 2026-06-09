import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components';
import type {
  BarSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
} from 'echarts/charts';
import type { ComposeOption, ECElementEvent } from 'echarts/core';
import { EChartsView } from '@/components/charts/EChartsView';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Select';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconInbox,
  IconKey,
  IconModelCluster,
  IconRefreshCw,
  IconSearch,
  IconShield,
  IconTrendingUp,
} from '@/components/ui/icons';
import { useThemeStore } from '@/stores';
import {
  buildUsageHeatmapChartData,
  buildMonitoringDetailUrl,
  buildOptionValues,
  summarizeAnomalies,
  anomalyMetricLabelKey,
  DEFAULT_SELECTED_METRICS,
  formatDateTimeLocalValue,
  formatLocalDateTime,
  formatMetricValue,
  hasUsageData,
  maskApiKeyHash,
  parseDateTimeLocalValue,
  USAGE_ANALYTICS_TABS,
  USAGE_MATRIX_DIMENSIONS,
  USAGE_MATRIX_METRICS,
  USAGE_METRICS,
  USAGE_TIME_RANGES,
  type UsageAnalyticsTab,
  type UsageCredentialQuotaRow,
  type UsageEntityTrendSeries,
  type UsageInsight,
  type UsageAnalyticsGranularity,
  type UsageAnalyticsStatus,
  type UsageDrilldownEvent,
  type UsageHeatmapPoint,
  type UsageKeyAnomalyRow,
  type UsageMatrix,
  type UsageMatrixDimension,
  type UsageMatrixMetricKey,
  type UsageMetricKey,
  type UsageProviderRow,
  type UsageRankRow,
  type UsageServerAnomaly,
  type UsageTimelinePoint,
  type UsageTrendMetricKey,
} from './usageAnalyticsModel';
import { useUsageAnalytics } from './useUsageAnalytics';
import { UsageSummarySection } from './components/UsageSummaryCards';
import {
  buildUsageEntitySummaryCards,
  buildUsageHeatmapSummaryCards,
  buildUsageOverviewSummaryCards,
  buildUsageTrendSummaryCards,
  formatUsageDurationMs,
} from './usageAnalyticsPresentation';
import styles from './UsageAnalyticsPage.module.scss';

const trendMetricOptions: Array<{ value: UsageTrendMetricKey; labelKey: string }> = [
  { value: 'requestCount', labelKey: 'usage_analytics.trend_metric_requestCount' },
  { value: 'totalTokens', labelKey: 'usage_analytics.trend_metric_totalTokens' },
  { value: 'estimatedCost', labelKey: 'usage_analytics.trend_metric_estimatedCost' },
];

const chartHeight = 360;
const compactChartHeight = 220;

type UsageTrendChartOption = ComposeOption<
  | DataZoomComponentOption
  | GridComponentOption
  | LegendComponentOption
  | LineSeriesOption
  | TooltipComponentOption
>;

type CostShareChartOption = ComposeOption<
  LegendComponentOption | PieSeriesOption | TooltipComponentOption
>;

type CostRankChartOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption
>;

type HealthChartOption = ComposeOption<
  | BarSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | LineSeriesOption
  | TooltipComponentOption
>;

type TokenStructureChartOption = ComposeOption<
  BarSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>;

type EntityTrendChartOption = ComposeOption<
  GridComponentOption | LegendComponentOption | LineSeriesOption | TooltipComponentOption
>;

type HeatmapChartOption = ComposeOption<
  GridComponentOption | HeatmapSeriesOption | TooltipComponentOption | VisualMapComponentOption
>;

const usageChartAxisKeys = {
  requests: 0,
  tokens: 1,
  cost: 2,
} as const;

type UsageChartTheme = {
  axisColors: Record<'requests' | 'tokens' | 'cost', string>;
  categoryPalette: string[];
  heatmapColors: string[];
  healthColors: {
    failure: string;
    latency: string;
    success: string;
  };
  metricColors: Record<UsageMetricKey, string>;
  surface: {
    axisLabel: string;
    axisLine: string;
    axisPointer: string;
    barBackground: string;
    heatmapCellBorder: string;
    heatmapEmphasisBorder: string;
    pieBorder: string;
    pieShadow: string;
    selectedLine: string;
    splitLine: string;
    tooltipBackground: string;
    tooltipBorder: string;
    tooltipMuted: string;
    tooltipShadow: string;
    tooltipText: string;
  };
  tokenStructureColors: string[];
};

const lightUsageChartTheme: UsageChartTheme = {
  axisColors: {
    requests: '#409eff',
    tokens: '#14b8a6',
    cost: '#f59e0b',
  },
  categoryPalette: ['#409eff', '#14b8a6', '#8b5cf6', '#f59e0b', '#94a3b8'],
  heatmapColors: ['#eff6ff', '#93c5fd', '#409eff', '#7c3aed'],
  healthColors: {
    failure: '#f56c6c',
    latency: '#7c3aed',
    success: '#67c23a',
  },
  metricColors: {
    cachedTokens: '#06b6d4',
    estimatedCost: '#f59e0b',
    inputTokens: '#60a5fa',
    outputTokens: '#8b5cf6',
    requestCount: '#409eff',
    totalTokens: '#14b8a6',
  },
  surface: {
    axisLabel: '#5f6c7b',
    axisLine: '#d8e5f2',
    axisPointer: '#8b95a6',
    barBackground: 'rgba(139, 149, 166, 0.14)',
    heatmapCellBorder: '#ffffff',
    heatmapEmphasisBorder: '#2c3e50',
    pieBorder: '#ffffff',
    pieShadow: 'rgba(15, 23, 42, 0.18)',
    selectedLine: '#8b95a6',
    splitLine: '#d3e1ef',
    tooltipBackground: 'rgba(255, 255, 255, 0.96)',
    tooltipBorder: '#d8e5f2',
    tooltipMuted: '#5f6c7b',
    tooltipShadow: 'box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);',
    tooltipText: '#2c3e50',
  },
  tokenStructureColors: ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b'],
};

const darkUsageChartTheme: UsageChartTheme = {
  axisColors: {
    requests: '#79bbff',
    tokens: '#2dd4bf',
    cost: '#fbbf24',
  },
  categoryPalette: ['#79bbff', '#2dd4bf', '#a78bfa', '#fbbf24', '#a3a6ad'],
  heatmapColors: ['#102f4f', '#1d5f98', '#409eff', '#79bbff'],
  healthColors: {
    failure: '#fab6b6',
    latency: '#c4b5fd',
    success: '#95d475',
  },
  metricColors: {
    cachedTokens: '#22d3ee',
    estimatedCost: '#fbbf24',
    inputTokens: '#60a5fa',
    outputTokens: '#a78bfa',
    requestCount: '#79bbff',
    totalTokens: '#2dd4bf',
  },
  surface: {
    axisLabel: '#a3a3a3',
    axisLine: 'rgba(255, 255, 255, 0.12)',
    axisPointer: '#7a7a7a',
    barBackground: 'rgba(255, 255, 255, 0.08)',
    heatmapCellBorder: '#1b1f2a',
    heatmapEmphasisBorder: '#e5e5e5',
    pieBorder: '#1b1f2a',
    pieShadow: 'rgba(0, 0, 0, 0.36)',
    selectedLine: '#7a7a7a',
    splitLine: 'rgba(255, 255, 255, 0.1)',
    tooltipBackground: 'rgba(24, 28, 40, 0.96)',
    tooltipBorder: 'rgba(255, 255, 255, 0.12)',
    tooltipMuted: '#a3a3a3',
    tooltipShadow: 'box-shadow: 0 16px 36px rgba(0, 0, 0, 0.38);',
    tooltipText: '#e5e5e5',
  },
  tokenStructureColors: ['#60a5fa', '#a78bfa', '#2dd4bf', '#fbbf24'],
};

const getUsageChartTheme = (resolvedTheme: 'light' | 'dark'): UsageChartTheme =>
  resolvedTheme === 'dark' ? darkUsageChartTheme : lightUsageChartTheme;

const useUsageChartTheme = () => {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  return getUsageChartTheme(resolvedTheme);
};

const appendHexAlpha = (color: string, alphaHex: string) =>
  /^#[\da-f]{6}$/i.test(color) ? `${color}${alphaHex}` : color;

const getThemedUsageMetrics = (chartTheme: UsageChartTheme): typeof USAGE_METRICS =>
  USAGE_METRICS.map((metric) => ({
    ...metric,
    color: chartTheme.metricColors[metric.key],
  })) as typeof USAGE_METRICS;

const compactNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
};

const formatPercent = (value: number) =>
  `${(Number.isFinite(value) ? value * 100 : 0).toFixed(2)}%`;

const formatDelta = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const tooltipTitleHtml = (chartTheme: UsageChartTheme, titleHtml: string) =>
  `<b style="color:${chartTheme.surface.tooltipText}">${titleHtml}</b>`;

const tooltipRowHtml = (chartTheme: UsageChartTheme, labelHtml: string, valueHtml: string) =>
  `<div class="${styles.echartsTooltipRow}" style="color:${chartTheme.surface.tooltipMuted}"><span>${labelHtml}</span><strong style="color:${chartTheme.surface.tooltipText}">${valueHtml}</strong></div>`;

const tooltipHtml = (chartTheme: UsageChartTheme, rowsHtml: string, titleHtml?: string | null) =>
  `<div class="${styles.echartsTooltip}" style="color:${chartTheme.surface.tooltipMuted}">${
    titleHtml ? tooltipTitleHtml(chartTheme, titleHtml) : ''
  }${rowsHtml}</div>`;

const getTooltipOption = (chartTheme: UsageChartTheme) => ({
  backgroundColor: chartTheme.surface.tooltipBackground,
  borderColor: chartTheme.surface.tooltipBorder,
  extraCssText: chartTheme.surface.tooltipShadow,
  textStyle: {
    color: chartTheme.surface.tooltipMuted,
  },
});

const getMetricLabel = (key: UsageMetricKey, t: ReturnType<typeof useTranslation>['t']) => {
  const metric = USAGE_METRICS.find((item) => item.key === key);
  return metric ? t(metric.labelKey) : key;
};

const formatTrendMetricValue = (key: UsageTrendMetricKey, value: number) => {
  if (key === 'estimatedCost') return formatMetricValue('estimatedCost', value);
  if (key === 'totalTokens') return formatMetricValue('totalTokens', value);
  return formatMetricValue('requestCount', value);
};

const formatMatrixMetricValue = (key: UsageMatrixMetricKey, value: number) => {
  if (key === 'failureRate') return formatPercent(value);
  if (key === 'estimatedCost') return formatMetricValue('estimatedCost', value);
  if (key === 'totalTokens') return formatMetricValue('totalTokens', value);
  return formatMetricValue('requestCount', value);
};

const formatQuotaValue = (value: number) => formatMetricValue('estimatedCost', value);

const mapProviderRowsToRankRows = (rows: UsageProviderRow[]): UsageRankRow[] =>
  rows.map((row) => ({
    id: row.id,
    label: row.label,
    provider: row.id,
    requestCount: row.requestCount,
    successCount: row.successCount,
    failureCount: row.failureCount,
    successRate: row.successRate,
    totalTokens: row.totalTokens,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    estimatedCost: row.estimatedCost,
    averageLatencyMs: row.averageLatencyMs,
    share: row.share,
    models: row.models,
  }));

const buildStableSelectOptions = (
  allLabel: string,
  values: Array<string | null | undefined>,
  currentValue?: string,
  currentLabel?: string
): SelectOption[] => {
  const normalizedCurrent = currentValue?.trim();
  const options = buildOptionValues([
    ...values,
    normalizedCurrent && normalizedCurrent !== 'all' ? normalizedCurrent : undefined,
  ]).map((value) => ({
    value,
    label: value === normalizedCurrent && currentLabel ? currentLabel : value,
  }));
  return [{ value: 'all', label: allLabel }, ...options];
};

type StableUsageOptionCache = {
  models: string[];
  providers: string[];
  authFiles: string[];
  projectIds: string[];
  requestTypes: string[];
  apiKeys: SelectOption[];
};

const emptyStableOptionCache = (): StableUsageOptionCache => ({
  models: [],
  providers: [],
  authFiles: [],
  projectIds: [],
  requestTypes: [],
  apiKeys: [],
});

const mergeSelectOptions = (options: SelectOption[]) =>
  Array.from(
    new Map(
      options
        .filter((option) => option.value.trim())
        .map((option) => [option.value, option] as const)
    ).values()
  ).sort((left, right) => left.label.localeCompare(right.label));

const mergeStableOptionCache = (
  current: StableUsageOptionCache,
  incoming: StableUsageOptionCache
): StableUsageOptionCache => ({
  models: buildOptionValues([...current.models, ...incoming.models]),
  providers: buildOptionValues([...current.providers, ...incoming.providers]),
  authFiles: buildOptionValues([...current.authFiles, ...incoming.authFiles]),
  projectIds: buildOptionValues([...current.projectIds, ...incoming.projectIds]),
  requestTypes: buildOptionValues([...current.requestTypes, ...incoming.requestTypes]),
  apiKeys: mergeSelectOptions([...current.apiKeys, ...incoming.apiKeys]),
});

const stableOptionCachesEqual = (left: StableUsageOptionCache, right: StableUsageOptionCache) =>
  left.models.join('\n') === right.models.join('\n') &&
  left.providers.join('\n') === right.providers.join('\n') &&
  left.authFiles.join('\n') === right.authFiles.join('\n') &&
  left.projectIds.join('\n') === right.projectIds.join('\n') &&
  left.requestTypes.join('\n') === right.requestTypes.join('\n') &&
  left.apiKeys.map((option) => `${option.value}:${option.label}`).join('\n') ===
    right.apiKeys.map((option) => `${option.value}:${option.label}`).join('\n');

const metricValue = (point: UsageTimelinePoint, key: UsageMetricKey) => point[key];

const getMetricAxisIndex = (axis: (typeof USAGE_METRICS)[number]['axis']) =>
  usageChartAxisKeys[axis];

const getAxisValueFormatter = (axis: (typeof USAGE_METRICS)[number]['axis']) => {
  if (axis === 'cost') return (value: number) => formatMetricValue('estimatedCost', value);
  if (axis === 'requests') return (value: number) => compactNumber(value);
  return (value: number) => compactNumber(value);
};

const getUsageChartTooltipFormatter =
  (
    timeline: UsageTimelinePoint[],
    locale: string,
    t: ReturnType<typeof useTranslation>['t'],
    chartTheme: UsageChartTheme
  ) =>
  (params: unknown) => {
    const items = Array.isArray(params) ? params : [params];
    const first = items[0] as { dataIndex?: number } | undefined;
    const point = typeof first?.dataIndex === 'number' ? timeline[first.dataIndex] : undefined;
    const rows = items
      .map((item) => {
        const entry = item as {
          color?: string;
          data?: number;
          marker?: string;
          seriesName?: string;
        };
        const metric = USAGE_METRICS.find(
          (candidate) => t(candidate.labelKey) === entry.seriesName
        );
        const value =
          metric && typeof entry.data === 'number'
            ? formatMetricValue(metric.key, entry.data)
            : String(entry.data ?? '-');
        return tooltipRowHtml(
          chartTheme,
          `${entry.marker ?? ''}${escapeHtml(entry.seriesName)}`,
          escapeHtml(value)
        );
      })
      .join('');

    return tooltipHtml(
      chartTheme,
      rows,
      escapeHtml(point ? formatLocalDateTime(point.bucketMs, locale) : '')
    );
  };

const buildUsageTrendChartOption = ({
  compact,
  locale,
  metrics,
  selectedBucket,
  t,
  chartTheme,
  timeline,
}: {
  compact: boolean;
  locale: string;
  metrics: typeof USAGE_METRICS;
  selectedBucket?: UsageTimelinePoint | null;
  t: ReturnType<typeof useTranslation>['t'];
  chartTheme: UsageChartTheme;
  timeline: UsageTimelinePoint[];
}): UsageTrendChartOption => {
  const selectedLabel = selectedBucket?.label;
  const visibleAxisSet = new Set(metrics.map((metric) => metric.axis));
  const requestsVisible = visibleAxisSet.has('requests');
  const tokensVisible = visibleAxisSet.has('tokens');
  const costVisible = visibleAxisSet.has('cost');
  const tokensOnRight = tokensVisible && requestsVisible;
  const costOnRight = costVisible && (requestsVisible || tokensVisible);
  const rightAxisCount = Number(tokensOnRight) + Number(costOnRight);
  const splitLineAxis = requestsVisible ? 'requests' : tokensVisible ? 'tokens' : 'cost';
  const selectedLine =
    selectedLabel && metrics.length > 0
      ? {
          symbol: ['none', 'none'],
          label: { show: false },
          lineStyle: {
            color: chartTheme.surface.selectedLine,
            type: 'dashed' as const,
            width: 1.5,
          },
          data: [{ xAxis: selectedLabel }],
          silent: true,
        }
      : undefined;

  return {
    animationDuration: compact ? 180 : 320,
    backgroundColor: 'transparent',
    color: metrics.map((metric) => metric.color),
    dataZoom:
      timeline.length > 12
        ? [
            {
              type: 'inside',
              xAxisIndex: 0,
              filterMode: 'none',
              minSpan: Math.min(100, Math.max(10, (6 / timeline.length) * 100)),
              zoomOnMouseWheel: true,
              moveOnMouseMove: true,
              moveOnMouseWheel: false,
            },
          ]
        : [],
    grid: {
      bottom: compact ? 34 : 44,
      containLabel: true,
      left: 10,
      right: rightAxisCount > 1 ? 104 : rightAxisCount === 1 ? 72 : 28,
      top: compact ? 16 : 28,
    },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemGap: 16,
      itemHeight: 8,
      itemWidth: 8,
      selectedMode: false,
      textStyle: {
        color: chartTheme.surface.axisLabel,
        fontSize: 12,
        fontWeight: 700,
      },
    },
    tooltip: {
      appendToBody: true,
      axisPointer: {
        lineStyle: {
          color: chartTheme.surface.axisPointer,
          type: 'dashed',
          width: 1,
        },
        snap: true,
        type: 'line',
      },
      ...getTooltipOption(chartTheme),
      borderRadius: 10,
      borderWidth: 1,
      className: styles.echartsTooltipWrapper,
      confine: true,
      formatter: getUsageChartTooltipFormatter(timeline, locale, t, chartTheme),
      padding: 0,
      trigger: 'axis',
    },
    xAxis: {
      axisLabel: {
        color: chartTheme.surface.axisLabel,
        fontSize: 11,
        fontWeight: 700,
        hideOverlap: true,
        margin: 14,
      },
      axisLine: {
        lineStyle: {
          color: chartTheme.surface.axisLine,
        },
      },
      axisTick: { show: false },
      boundaryGap: false,
      data: timeline.map((point) => point.label),
      type: 'category',
    },
    yAxis: [
      {
        axisLabel: {
          color: chartTheme.axisColors.requests,
          formatter: getAxisValueFormatter('requests'),
          fontWeight: 700,
        },
        nameTextStyle: { color: chartTheme.axisColors.requests },
        position: 'left',
        scale: true,
        show: requestsVisible,
        splitLine: {
          show: splitLineAxis === 'requests',
          lineStyle: {
            color: chartTheme.surface.splitLine,
            type: 'dashed',
          },
        },
        type: 'value',
      },
      {
        axisLabel: {
          color: chartTheme.axisColors.tokens,
          formatter: getAxisValueFormatter('tokens'),
          fontWeight: 700,
        },
        offset: tokensOnRight && costOnRight ? 46 : 0,
        position: tokensOnRight ? 'right' : 'left',
        scale: true,
        show: tokensVisible,
        splitLine: {
          show: splitLineAxis === 'tokens',
          lineStyle: {
            color: chartTheme.surface.splitLine,
            type: 'dashed',
          },
        },
        type: 'value',
      },
      {
        axisLabel: {
          color: chartTheme.axisColors.cost,
          formatter: getAxisValueFormatter('cost'),
          fontWeight: 700,
        },
        position: costOnRight ? 'right' : 'left',
        scale: true,
        show: costVisible,
        splitLine: {
          show: splitLineAxis === 'cost',
          lineStyle: {
            color: chartTheme.surface.splitLine,
            type: 'dashed',
          },
        },
        type: 'value',
      },
    ],
    series: metrics.map((metric, index) => ({
      areaStyle:
        compact || index > 1
          ? undefined
          : {
              color: {
                colorStops: [
                  { color: appendHexAlpha(metric.color, compact ? '1f' : '2e'), offset: 0 },
                  { color: appendHexAlpha(metric.color, '00'), offset: 1 },
                ],
                x: 0,
                x2: 0,
                y: 0,
                y2: 1,
                type: 'linear',
              },
            },
      connectNulls: true,
      data: timeline.map((point) => metricValue(point, metric.key)),
      emphasis: {
        focus: 'series',
        lineStyle: { width: compact ? 2.6 : 3.2 },
      },
      lineStyle: {
        color: metric.color,
        width: compact ? 2 : 2.5,
      },
      markLine: index === 0 && selectedLine ? selectedLine : undefined,
      name: t(metric.labelKey),
      showSymbol: timeline.length <= 36,
      smooth: 0.25,
      symbol: 'circle',
      symbolSize: compact ? 5 : 6,
      type: 'line',
      yAxisIndex: getMetricAxisIndex(metric.axis),
    })),
  };
};

function UsageLineChart({
  timeline,
  selectedMetrics,
  selectedBucket,
  onSelectBucket,
  compact = false,
}: {
  timeline: UsageTimelinePoint[];
  selectedMetrics: UsageMetricKey[];
  selectedBucket?: UsageTimelinePoint | null;
  onSelectBucket?: (point: UsageTimelinePoint) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const chartTheme = useUsageChartTheme();
  const metrics = useMemo(
    () =>
      getThemedUsageMetrics(chartTheme).filter((metric) => selectedMetrics.includes(metric.key)),
    [chartTheme, selectedMetrics]
  );
  const option = useMemo(
    () =>
      buildUsageTrendChartOption({
        chartTheme,
        compact,
        locale: i18n.language,
        metrics,
        selectedBucket,
        t,
        timeline,
      }),
    [chartTheme, compact, i18n.language, metrics, selectedBucket, t, timeline]
  );
  const handleClick = useCallback(
    (event: ECElementEvent) => {
      const dataIndex = typeof event.dataIndex === 'number' ? event.dataIndex : -1;
      const point = dataIndex >= 0 ? timeline[dataIndex] : undefined;
      if (point) onSelectBucket?.(point);
    },
    [onSelectBucket, timeline]
  );

  if (timeline.length === 0 || metrics.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  const height = compact ? compactChartHeight : chartHeight;

  return (
    <div className={styles.localChart}>
      <EChartsView
        option={option}
        className={styles.echartsCanvas}
        style={{ height }}
        role={onSelectBucket ? 'button' : 'img'}
        ariaLabel={t('usage_analytics.trend_title')}
        onClick={onSelectBucket ? handleClick : undefined}
      />
    </div>
  );
}

function MiniTrendPlaceholder() {
  const { t } = useTranslation();
  return (
    <span className={styles.sparklinePlaceholder} title={t('usage_analytics.trend_pending_data')}>
      <svg viewBox="0 0 58 18" aria-hidden="true">
        <path d="M2 13 L14 9 L26 11 L38 5 L56 7" />
      </svg>
      <em>{t('usage_analytics.trend_pending_data')}</em>
    </span>
  );
}

function CostShareChart({ rows }: { rows: UsageRankRow[] }) {
  const { t } = useTranslation();
  const chartTheme = useUsageChartTheme();
  const totalCost = rows.reduce((sum, row) => sum + row.estimatedCost, 0);
  const chartRows = rows.filter((row) => row.estimatedCost > 0).slice(0, 5);

  if (totalCost <= 0 || chartRows.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{formatMetricValue('estimatedCost', 0)}</span>
      </div>
    );
  }

  const option: CostShareChartOption = {
    animationDuration: 260,
    backgroundColor: 'transparent',
    color: chartTheme.categoryPalette,
    legend: { show: false },
    tooltip: {
      appendToBody: true,
      ...getTooltipOption(chartTheme),
      borderRadius: 10,
      borderWidth: 1,
      className: styles.echartsTooltipWrapper,
      confine: true,
      formatter: (params: unknown) => {
        const item = params as { data?: { value?: number }; marker?: string; name?: string };
        const value = Number(item.data?.value ?? 0);
        const titleHtml = escapeHtml(
          item.name // user-controlled tooltip label
        );
        return tooltipHtml(
          chartTheme,
          `${tooltipRowHtml(
            chartTheme,
            `${item.marker ?? ''}${escapeHtml(t('usage_analytics.total_cost'))}`,
            escapeHtml(formatMetricValue('estimatedCost', value))
          )}${tooltipRowHtml(
            chartTheme,
            escapeHtml(t('usage_analytics.share')),
            escapeHtml(formatPercent(value / totalCost))
          )}`,
          titleHtml
        );
      },
      padding: 0,
      trigger: 'item',
    },
    series: [
      {
        avoidLabelOverlap: true,
        center: ['50%', '50%'],
        data: chartRows.map((row) => ({
          name: row.label,
          value: row.estimatedCost,
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: chartTheme.surface.pieShadow,
          },
          scaleSize: 4,
        },
        itemStyle: {
          borderColor: chartTheme.surface.pieBorder,
          borderRadius: 6,
          borderWidth: 3,
        },
        label: { show: false },
        labelLine: { show: false },
        radius: ['58%', '78%'],
        type: 'pie',
      },
    ],
  };

  return (
    <div className={styles.costShareChart}>
      <div className={styles.costShareDonut}>
        <EChartsView
          option={option}
          className={styles.echartsCanvas}
          style={{ height: 180 }}
          ariaLabel={t('usage_analytics.cost_share_title')}
        />
        <div className={styles.donutCenter} aria-hidden="true">
          <strong>{formatMetricValue('estimatedCost', totalCost)}</strong>
          <span>{t('usage_analytics.total_cost')}</span>
        </div>
      </div>
      <div className={styles.costShareLegend}>
        {chartRows.map((row, index) => (
          <span key={row.id}>
            <i
              style={{
                backgroundColor:
                  chartTheme.categoryPalette[index % chartTheme.categoryPalette.length],
              }}
            />
            <b>{row.label}</b>
            <em>{formatPercent(row.estimatedCost / totalCost)}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function CostRankChart({ rows, title }: { rows: UsageRankRow[]; title: string }) {
  const { t } = useTranslation();
  const chartTheme = useUsageChartTheme();
  const chartRows = useMemo(
    () =>
      [...rows]
        .filter((row) => row.estimatedCost > 0)
        .sort((left, right) => right.estimatedCost - left.estimatedCost)
        .slice(0, 5),
    [rows]
  );
  const maxCost = Math.max(...chartRows.map((row) => row.estimatedCost), 0);

  const option = useMemo<CostRankChartOption>(
    () => ({
      animationDuration: 260,
      backgroundColor: 'transparent',
      grid: { bottom: 8, containLabel: true, left: 8, right: 74, top: 8 },
      tooltip: {
        appendToBody: true,
        ...getTooltipOption(chartTheme),
        borderRadius: 10,
        borderWidth: 1,
        className: styles.echartsTooltipWrapper,
        confine: true,
        formatter: (params: unknown) => {
          const item = params as {
            data?: { share?: number; value?: number };
            marker?: string;
            name?: string;
          };
          const value = Number(item.data?.value ?? 0);
          const share = Number(item.data?.share ?? 0);
          const titleHtml = escapeHtml(
            item.name // user-controlled tooltip label
          );
          return tooltipHtml(
            chartTheme,
            `${tooltipRowHtml(
              chartTheme,
              `${item.marker ?? ''}${escapeHtml(t('usage_analytics.total_cost'))}`,
              escapeHtml(formatMetricValue('estimatedCost', value))
            )}${tooltipRowHtml(
              chartTheme,
              escapeHtml(t('usage_analytics.share')),
              escapeHtml(formatPercent(share))
            )}`,
            titleHtml
          );
        },
        padding: 0,
        trigger: 'item',
      },
      xAxis: {
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        max: Math.max(maxCost * 1.18, 1),
        splitLine: { show: false },
        type: 'value',
      },
      yAxis: {
        axisLabel: {
          color: chartTheme.surface.tooltipText,
          fontSize: 12,
          fontWeight: 700,
          overflow: 'truncate',
          width: 138,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        data: chartRows.map((row) => row.label),
        inverse: true,
        type: 'category',
      },
      series: [
        {
          barMaxWidth: 16,
          barWidth: 14,
          data: chartRows.map((row, index) => ({
            itemStyle: {
              color: chartTheme.categoryPalette[index % chartTheme.categoryPalette.length],
            },
            share: row.share,
            value: row.estimatedCost,
          })),
          itemStyle: {
            borderRadius: [0, 8, 8, 0],
          },
          label: {
            color: chartTheme.surface.tooltipText,
            fontSize: 12,
            fontWeight: 800,
            formatter: (params: unknown) =>
              formatMetricValue('estimatedCost', Number((params as { value?: number }).value ?? 0)),
            position: 'right',
            show: true,
          },
          showBackground: true,
          backgroundStyle: {
            borderRadius: [0, 8, 8, 0],
            color: chartTheme.surface.barBackground,
          },
          type: 'bar',
        },
      ],
    }),
    [chartRows, chartTheme, maxCost, t]
  );

  if (chartRows.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{formatMetricValue('estimatedCost', 0)}</span>
      </div>
    );
  }

  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: Math.max(180, chartRows.length * 36 + 26) }}
      ariaLabel={title}
    />
  );
}

const buildHealthChartOption = (
  timeline: UsageTimelinePoint[],
  t: ReturnType<typeof useTranslation>['t'],
  chartTheme: UsageChartTheme
): HealthChartOption => ({
  animationDuration: 260,
  backgroundColor: 'transparent',
  color: [
    chartTheme.healthColors.success,
    chartTheme.healthColors.failure,
    chartTheme.healthColors.latency,
  ],
  grid: { bottom: 34, containLabel: true, left: 8, right: 58, top: 20 },
  legend: {
    bottom: 0,
    icon: 'circle',
    itemHeight: 8,
    itemWidth: 8,
    textStyle: { color: chartTheme.surface.axisLabel, fontSize: 12, fontWeight: 700 },
  },
  tooltip: {
    appendToBody: true,
    axisPointer: { type: 'cross' },
    ...getTooltipOption(chartTheme),
    borderRadius: 10,
    borderWidth: 1,
    confine: true,
    formatter: (params: unknown) => {
      const items = Array.isArray(params) ? params : [params];
      const first = items[0] as { dataIndex?: number } | undefined;
      const point = typeof first?.dataIndex === 'number' ? timeline[first.dataIndex] : undefined;
      const rows = items
        .map((item) => {
          const entry = item as { marker?: string; seriesName?: string; data?: number };
          const value =
            entry.seriesName === t('usage_analytics.metric_average_latency')
              ? formatUsageDurationMs(Number(entry.data ?? 0))
              : formatPercent(Number(entry.data ?? 0));
          return tooltipRowHtml(
            chartTheme,
            `${entry.marker ?? ''}${escapeHtml(entry.seriesName)}`,
            escapeHtml(value)
          );
        })
        .join('');
      return tooltipHtml(chartTheme, rows, escapeHtml(point?.label));
    },
    padding: 0,
    trigger: 'axis',
  },
  xAxis: {
    axisLabel: {
      color: chartTheme.surface.axisLabel,
      fontSize: 11,
      fontWeight: 700,
      hideOverlap: true,
    },
    axisLine: { lineStyle: { color: chartTheme.surface.axisLine } },
    axisTick: { show: false },
    data: timeline.map((point) => point.label),
    type: 'category',
  },
  yAxis: [
    {
      axisLabel: {
        color: chartTheme.surface.axisLabel,
        formatter: (value: number) => `${Math.round(value * 100)}%`,
      },
      max: 1,
      min: 0,
      splitLine: { lineStyle: { color: chartTheme.surface.splitLine, type: 'dashed' } },
      type: 'value',
    },
    {
      axisLabel: {
        color: chartTheme.healthColors.latency,
        formatter: (value: number) => formatUsageDurationMs(value),
      },
      position: 'right',
      scale: true,
      splitLine: { show: false },
      type: 'value',
    },
  ],
  series: [
    {
      data: timeline.map((point) => point.successRate),
      lineStyle: { width: 2.5 },
      name: t('usage_analytics.success_rate'),
      showSymbol: timeline.length <= 36,
      smooth: 0.25,
      type: 'line',
      yAxisIndex: 0,
    },
    {
      data: timeline.map((point) => point.failureRate),
      lineStyle: { width: 2.5 },
      name: t('usage_analytics.failure_rate'),
      showSymbol: timeline.length <= 36,
      smooth: 0.25,
      type: 'line',
      yAxisIndex: 0,
    },
    {
      barMaxWidth: 16,
      data: timeline.map((point) => point.averageLatencyMs ?? 0),
      name: t('usage_analytics.metric_average_latency'),
      type: 'bar',
      yAxisIndex: 1,
    },
  ],
});

function HealthTrendChart({ timeline }: { timeline: UsageTimelinePoint[] }) {
  const { t } = useTranslation();
  const chartTheme = useUsageChartTheme();
  const option = useMemo(
    () => buildHealthChartOption(timeline, t, chartTheme),
    [chartTheme, timeline, t]
  );
  if (timeline.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }
  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 260 }}
      ariaLabel={t('usage_analytics.health_trend_title')}
    />
  );
}

const weekdayLabelKeys = [
  'usage_analytics.weekday_sun',
  'usage_analytics.weekday_mon',
  'usage_analytics.weekday_tue',
  'usage_analytics.weekday_wed',
  'usage_analytics.weekday_thu',
  'usage_analytics.weekday_fri',
  'usage_analytics.weekday_sat',
] as const;

function UsageHeatmapChart({ points }: { points: UsageHeatmapPoint[] }) {
  const { t } = useTranslation();
  const chartTheme = useUsageChartTheme();
  const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
  const weekdays = weekdayLabelKeys.map((key) => t(key));
  const data = buildUsageHeatmapChartData(points);
  const maxValue = Math.max(1, ...data.map((point) => point[2]));
  const option: HeatmapChartOption = {
    animationDuration: 260,
    backgroundColor: 'transparent',
    grid: { bottom: 28, containLabel: true, left: 8, right: 14, top: 10 },
    tooltip: {
      appendToBody: true,
      ...getTooltipOption(chartTheme),
      borderRadius: 10,
      borderWidth: 1,
      confine: true,
      formatter: (params: unknown) => {
        const item = params as { value?: number[] };
        const [hour, weekday, calls, cost, failureRate] = item.value ?? [];
        return tooltipHtml(
          chartTheme,
          `${tooltipRowHtml(
            chartTheme,
            escapeHtml(t('usage_analytics.metric_request_count')),
            escapeHtml(compactNumber(calls ?? 0))
          )}${tooltipRowHtml(
            chartTheme,
            escapeHtml(t('usage_analytics.metric_estimated_cost')),
            escapeHtml(formatMetricValue('estimatedCost', cost ?? 0))
          )}${tooltipRowHtml(
            chartTheme,
            escapeHtml(t('usage_analytics.failure_rate')),
            escapeHtml(formatPercent(failureRate ?? 0))
          )}`,
          escapeHtml(`${weekdays[weekday] ?? ''} ${hours[hour] ?? ''}`)
        );
      },
      padding: 0,
    },
    visualMap: {
      bottom: 0,
      calculable: true,
      dimension: 2,
      inRange: { color: chartTheme.heatmapColors },
      left: 'center',
      max: maxValue,
      min: 0,
      orient: 'horizontal',
      textStyle: { color: chartTheme.surface.axisLabel, fontSize: 11 },
    },
    xAxis: {
      axisLabel: { color: chartTheme.surface.axisLabel, fontSize: 10 },
      axisTick: { show: false },
      data: hours,
      splitArea: { show: true },
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: chartTheme.surface.axisLabel, fontSize: 11, fontWeight: 700 },
      axisTick: { show: false },
      data: weekdays,
      splitArea: { show: true },
      type: 'category',
    },
    series: [
      {
        data,
        encode: { x: 0, y: 1, value: 2, tooltip: [2, 3, 4] },
        emphasis: {
          itemStyle: { borderColor: chartTheme.surface.heatmapEmphasisBorder, borderWidth: 1 },
        },
        itemStyle: { borderColor: chartTheme.surface.heatmapCellBorder, borderWidth: 1 },
        label: { show: false },
        name: t('usage_analytics.heatmap_title'),
        type: 'heatmap',
      },
    ],
  };

  if (data.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 340 }}
      ariaLabel={t('usage_analytics.heatmap_title')}
    />
  );
}

function TokenStructureChart({ timeline }: { timeline: UsageTimelinePoint[] }) {
  const { t } = useTranslation();
  const chartTheme = useUsageChartTheme();
  const tokenBarItemStyle = useMemo(
    () => ({
      borderColor: chartTheme.surface.pieBorder,
      borderWidth: 1,
    }),
    [chartTheme]
  );
  const option = useMemo<TokenStructureChartOption>(
    () => ({
      animationDuration: 260,
      backgroundColor: 'transparent',
      color: chartTheme.tokenStructureColors,
      grid: { bottom: 34, containLabel: true, left: 8, right: 18, top: 18 },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemHeight: 8,
        itemWidth: 8,
        textStyle: { color: chartTheme.surface.axisLabel, fontSize: 12, fontWeight: 700 },
      },
      tooltip: {
        appendToBody: true,
        axisPointer: { type: 'shadow' },
        ...getTooltipOption(chartTheme),
        borderRadius: 10,
        borderWidth: 1,
        confine: true,
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const first = items[0] as { dataIndex?: number } | undefined;
          const point =
            typeof first?.dataIndex === 'number' ? timeline[first.dataIndex] : undefined;
          const rows = items
            .map((item) => {
              const entry = item as { marker?: string; seriesName?: string; data?: number };
              return tooltipRowHtml(
                chartTheme,
                `${entry.marker ?? ''}${escapeHtml(entry.seriesName)}`,
                escapeHtml(compactNumber(Number(entry.data ?? 0)))
              );
            })
            .join('');
          return tooltipHtml(chartTheme, rows, escapeHtml(point?.label));
        },
        padding: 0,
        trigger: 'axis',
      },
      xAxis: {
        axisLabel: {
          color: chartTheme.surface.axisLabel,
          fontSize: 11,
          fontWeight: 700,
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: chartTheme.surface.axisLine } },
        axisTick: { show: false },
        data: timeline.map((point) => point.label),
        type: 'category',
      },
      yAxis: {
        axisLabel: { color: chartTheme.surface.axisLabel, formatter: compactNumber },
        splitLine: { lineStyle: { color: chartTheme.surface.splitLine, type: 'dashed' } },
        type: 'value',
      },
      series: [
        {
          barMaxWidth: 22,
          data: timeline.map((point) => point.inputTokens),
          itemStyle: tokenBarItemStyle,
          name: t('usage_analytics.metric_input_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
        {
          barMaxWidth: 22,
          data: timeline.map((point) => point.outputTokens),
          itemStyle: tokenBarItemStyle,
          name: t('usage_analytics.metric_output_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
        {
          barMaxWidth: 22,
          data: timeline.map((point) => point.cachedTokens),
          itemStyle: tokenBarItemStyle,
          name: t('usage_analytics.metric_cached_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
        {
          barMaxWidth: 22,
          data: timeline.map((point) => point.reasoningTokens),
          itemStyle: tokenBarItemStyle,
          name: t('usage_analytics.metric_reasoning_tokens'),
          stack: 'tokens',
          type: 'bar',
        },
      ],
    }),
    [chartTheme, t, timeline, tokenBarItemStyle]
  );

  if (timeline.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 260 }}
      ariaLabel={t('usage_analytics.token_structure_title')}
    />
  );
}

function EntityTrendChart({
  metric,
  series,
}: {
  metric: UsageTrendMetricKey;
  series: UsageEntityTrendSeries[];
}) {
  const { t } = useTranslation();
  const chartTheme = useUsageChartTheme();
  const option = useMemo<EntityTrendChartOption>(
    () => ({
      animationDuration: 260,
      backgroundColor: 'transparent',
      color: series.map(
        (_, index) => chartTheme.categoryPalette[index % chartTheme.categoryPalette.length]
      ),
      grid: { bottom: 34, containLabel: true, left: 8, right: 18, top: 18 },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemHeight: 8,
        itemWidth: 8,
        textStyle: { color: chartTheme.surface.axisLabel, fontSize: 12, fontWeight: 700 },
      },
      tooltip: {
        appendToBody: true,
        axisPointer: { type: 'line' },
        ...getTooltipOption(chartTheme),
        borderRadius: 10,
        borderWidth: 1,
        confine: true,
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const rows = items
            .map((item) => {
              const entry = item as { marker?: string; seriesName?: string; data?: number };
              return tooltipRowHtml(
                chartTheme,
                `${entry.marker ?? ''}${escapeHtml(entry.seriesName)}`,
                escapeHtml(formatTrendMetricValue(metric, Number(entry.data ?? 0)))
              );
            })
            .join('');
          return tooltipHtml(chartTheme, rows);
        },
        padding: 0,
        trigger: 'axis',
      },
      xAxis: {
        axisLabel: {
          color: chartTheme.surface.axisLabel,
          fontSize: 11,
          fontWeight: 700,
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: chartTheme.surface.axisLine } },
        axisTick: { show: false },
        boundaryGap: false,
        data: series[0]?.points.map((point) => point.label) ?? [],
        type: 'category',
      },
      yAxis: {
        axisLabel: {
          color: chartTheme.surface.axisLabel,
          formatter: (value: number) => formatTrendMetricValue(metric, value),
        },
        splitLine: { lineStyle: { color: chartTheme.surface.splitLine, type: 'dashed' } },
        type: 'value',
      },
      series: series.map((item, index) => ({
        data: item.points.map((point) => point.value),
        lineStyle: {
          color: chartTheme.categoryPalette[index % chartTheme.categoryPalette.length],
          width: 2.3,
        },
        name: item.label,
        showSymbol: item.points.length <= 36,
        smooth: 0.25,
        type: 'line',
      })),
    }),
    [chartTheme, metric, series]
  );

  if (series.length === 0) {
    return (
      <div className={styles.chartEmptyInline}>
        <IconInbox size={24} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <EChartsView
      option={option}
      className={styles.echartsCanvas}
      style={{ height: 260 }}
      ariaLabel={t('usage_analytics.entity_trend_title')}
    />
  );
}

function MatrixHeatmap({ matrix }: { matrix: UsageMatrix }) {
  const { t } = useTranslation();
  const cellMap = useMemo(
    () =>
      new Map(matrix.cells.map((cell) => [`${cell.rowLabel}\n${cell.columnLabel}`, cell] as const)),
    [matrix.cells]
  );

  if (matrix.cells.length === 0) {
    return (
      <div className={styles.inlineEmpty}>
        <IconInbox size={22} />
        <span>{t('usage_analytics.empty_title')}</span>
      </div>
    );
  }

  return (
    <div
      className={styles.matrixHeatmap}
      style={
        {
          '--matrix-columns': matrix.columnLabels.length,
        } as CSSProperties
      }
    >
      <span className={styles.matrixCorner}>{t('usage_analytics.col_dimension')}</span>
      {matrix.columnLabels.map((label) => (
        <span key={label} className={styles.matrixAxisLabel} title={label}>
          {label}
        </span>
      ))}
      {matrix.rowLabels.map((rowLabel) => (
        <div key={rowLabel} className={styles.matrixRow}>
          <span className={styles.matrixAxisLabel} title={rowLabel}>
            {rowLabel}
          </span>
          {matrix.columnLabels.map((columnLabel) => {
            const cell = cellMap.get(`${rowLabel}\n${columnLabel}`);
            const intensity = cell ? Math.max(0.08, cell.value / matrix.maxValue) : 0;
            return (
              <span
                key={`${rowLabel}-${columnLabel}`}
                className={styles.matrixCell}
                style={{ '--matrix-intensity': `${Math.round(intensity * 42)}%` } as CSSProperties}
                title={`${rowLabel} / ${columnLabel}: ${formatMatrixMetricValue(
                  matrix.metric,
                  cell?.value ?? 0
                )}`}
              >
                {cell && cell.value > 0 ? formatMatrixMetricValue(matrix.metric, cell.value) : '-'}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function InsightsPanel({
  insights,
  onOpen,
}: {
  insights: UsageInsight[];
  onOpen: (tab: UsageAnalyticsTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{t('usage_analytics.insights_title')}</h2>
          <p>{t('usage_analytics.insights_hint')}</p>
        </div>
      </div>
      {insights.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconCheck size={22} />
          <span>{t('usage_analytics.insights_empty')}</span>
        </div>
      ) : (
        <div className={styles.insightList}>
          {insights.map((insight) => (
            <button
              key={insight.id}
              type="button"
              className={`${styles.insightItem} ${styles[`insight${insight.tone}`]}`}
              onClick={() => insight.actionTab && onOpen(insight.actionTab)}
            >
              <span>
                <IconEye size={16} />
              </span>
              <strong>{t(insight.titleKey)}</strong>
              <em>{t(insight.bodyKey)}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyAnomalyTable({ locale, rows }: { locale: string; rows: UsageKeyAnomalyRow[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableWrap}>
      <table className={styles.compactTable}>
        <thead>
          <tr>
            <th>{t('usage_analytics.col_api_key')}</th>
            <th>{t('usage_analytics.col_reason')}</th>
            <th>{t('usage_analytics.col_severity')}</th>
            <th>{t('usage_analytics.col_triggered_at')}</th>
            <th>{t('usage_analytics.metric_estimated_cost')}</th>
            <th>{t('usage_analytics.failure_rate')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>{t('usage_analytics.anomaly_none')}</td>
            </tr>
          ) : (
            rows.slice(0, 8).map((row) => (
              <tr key={row.id}>
                <td>{maskApiKeyHash(row.row.apiKeyHash || row.id)}</td>
                <td>{t(row.reasonKey)}</td>
                <td>
                  <span className={`${styles.severityBadge} ${styles[`severity${row.severity}`]}`}>
                    {t(`usage_analytics.severity_${row.severity}`)}
                  </span>
                </td>
                <td>{row.triggeredAtMs ? formatLocalDateTime(row.triggeredAtMs, locale) : '-'}</td>
                <td>{formatMetricValue('estimatedCost', row.row.estimatedCost)}</td>
                <td>{formatPercent(row.row.failureCount / Math.max(row.row.requestCount, 1))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CredentialQuotaTable({
  locale,
  rows,
}: {
  locale: string;
  rows: UsageCredentialQuotaRow[];
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableWrap}>
      <table className={styles.compactTable}>
        <thead>
          <tr>
            <th>{t('usage_analytics.col_credential')}</th>
            <th>{t('usage_analytics.col_plan')}</th>
            <th>{t('usage_analytics.col_status')}</th>
            <th>{t('usage_analytics.col_used_quota')}</th>
            <th>{t('usage_analytics.col_remaining_quota')}</th>
            <th>{t('usage_analytics.col_reset_at')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>{t('usage_analytics.empty_title')}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.plan}</td>
                <td>
                  <span className={`${styles.quotaStatus} ${styles[`quota${row.status}`]}`}>
                    {t(`usage_analytics.quota_status_${row.status}`)}
                  </span>
                </td>
                <td>
                  <span className={styles.quotaMeter}>
                    <i style={{ width: `${Math.min(100, row.usedRate * 100)}%` }} />
                    <b>{formatQuotaValue(row.used)}</b>
                  </span>
                </td>
                <td>{formatQuotaValue(row.remaining)}</td>
                <td>{formatLocalDateTime(row.resetAtMs, locale)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProviderHealthPanel({ rows }: { rows: UsageProviderRow[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.providerList}>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.empty_title')}</span>
        </div>
      ) : (
        rows.slice(0, 6).map((row) => (
          <div key={row.id} className={styles.providerItem}>
            <div>
              <strong>{row.label}</strong>
              <span>
                {compactNumber(row.requestCount)} ·{' '}
                {formatMetricValue('estimatedCost', row.estimatedCost)}
              </span>
            </div>
            <span className={styles.providerMeter}>
              <i style={{ width: `${Math.min(100, row.successRate * 100)}%` }} />
              <b>{formatPercent(row.successRate)}</b>
            </span>
            <span className={styles.providerMeter}>
              <i style={{ width: `${Math.min(100, row.cacheRate * 100)}%` }} />
              <b>{formatPercent(row.cacheRate)}</b>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function ProviderSharePanel({ rows }: { rows: UsageProviderRow[] }) {
  const { t } = useTranslation();
  const chartTheme = useUsageChartTheme();
  return (
    <div className={styles.providerShareList}>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.empty_title')}</span>
        </div>
      ) : (
        rows.slice(0, 6).map((row, index) => (
          <span key={row.id}>
            <i
              style={{
                backgroundColor:
                  chartTheme.categoryPalette[index % chartTheme.categoryPalette.length],
              }}
            />
            <b>{row.label}</b>
            <em>{formatPercent(row.share)}</em>
          </span>
        ))
      )}
    </div>
  );
}

function HotCombinationsPanel({ matrix }: { matrix: UsageMatrix }) {
  const { t } = useTranslation();
  const rows = [...matrix.cells].sort((left, right) => right.value - left.value).slice(0, 8);
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>{t('usage_analytics.hot_combinations_title')}</h2>
      </div>
      <div className={styles.hotCombinationList}>
        {rows.length === 0 ? (
          <span className={styles.shortcutEmpty}>{t('usage_analytics.empty_title')}</span>
        ) : (
          rows.map((row) => (
            <div key={`${row.rowLabel}-${row.columnLabel}`}>
              <span>
                <strong>{row.rowLabel}</strong>
                <em>{row.columnLabel}</em>
              </span>
              <b>{formatMatrixMetricValue(matrix.metric, row.value)}</b>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyState}>
      <IconInbox size={28} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function UsageAnalyticsPageInner() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const usage = useUsageAnalytics();
  const chartTheme = useUsageChartTheme();
  const themedUsageMetrics = useMemo(() => getThemedUsageMetrics(chartTheme), [chartTheme]);
  const [selectedMetrics, setSelectedMetrics] =
    useState<UsageMetricKey[]>(DEFAULT_SELECTED_METRICS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customStartInput, setCustomStartInput] = useState(() =>
    formatDateTimeLocalValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  );
  const [customEndInput, setCustomEndInput] = useState(() => formatDateTimeLocalValue(new Date()));
  const [stableOptionCache, setStableOptionCache] = useState<StableUsageOptionCache>(() =>
    emptyStableOptionCache()
  );
  const allOptionLabel = t('usage_analytics.all');
  const allModelOptionLabel = t('monitoring.filter_all_models');
  const allApiKeyOptionLabel = t('monitoring.filter_all_api_keys');
  const allProviderOptionLabel = t('monitoring.filter_all_providers');
  const allStatusOptionLabel = t('monitoring.filter_all_statuses');

  const incomingOptionCache = useMemo<StableUsageOptionCache>(() => {
    const apiKeys = mergeSelectOptions([
      ...(usage.filterOptions?.api_key_stats ?? []).map((row) => {
        const hash = row.api_key_hash || row.id;
        return { value: hash, label: maskApiKeyHash(hash) };
      }),
      ...usage.apiKeyRows.map((row) => {
        const hash = row.apiKeyHash || row.id;
        return { value: hash, label: row.label };
      }),
    ]);

    return {
      models: buildOptionValues([
        ...(usage.filterOptions?.model_stats ?? []).map((row) => row.model),
        ...usage.modelRows.map((row) => row.model || row.label),
      ]),
      providers: buildOptionValues([
        ...(usage.filterOptions?.providers ?? []),
        ...usage.modelRows.map((row) => row.provider),
        ...usage.apiKeyRows.map((row) => row.provider),
        ...usage.credentialRows.map((row) => row.provider),
      ]),
      authFiles: buildOptionValues([
        ...(usage.filterOptions?.auth_files ?? []),
        ...usage.credentialRows.map((row) => row.authFile),
      ]),
      projectIds: buildOptionValues([
        ...(usage.filterOptions?.project_ids ?? []),
        ...usage.credentialRows.map((row) => row.projectId),
      ]),
      requestTypes: buildOptionValues(usage.filterOptions?.request_types ?? []),
      apiKeys,
    };
  }, [
    usage.apiKeyRows,
    usage.credentialRows,
    usage.filterOptions?.api_key_stats,
    usage.filterOptions?.auth_files,
    usage.filterOptions?.model_stats,
    usage.filterOptions?.project_ids,
    usage.filterOptions?.providers,
    usage.filterOptions?.request_types,
    usage.modelRows,
  ]);

  const displayOptionCache = useMemo(
    () => mergeStableOptionCache(stableOptionCache, incomingOptionCache),
    [incomingOptionCache, stableOptionCache]
  );

  const rememberVisibleOptions = () => {
    setStableOptionCache((current) => {
      const next = mergeStableOptionCache(current, incomingOptionCache);
      return stableOptionCachesEqual(current, next) ? current : next;
    });
  };

  const updateFilters = (patch: Partial<typeof usage.filters>) => {
    rememberVisibleOptions();
    usage.setFilters(patch);
  };

  const usageTabItems = useMemo<ReadonlyArray<SegmentedTabItem<UsageAnalyticsTab>>>(
    () =>
      USAGE_ANALYTICS_TABS.map((tab) => ({
        id: tab,
        label: t(`usage_analytics.tab_${tab}`),
      })),
    [t]
  );

  const modelOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(allModelOptionLabel, displayOptionCache.models, usage.filters.model),
    [allModelOptionLabel, displayOptionCache.models, usage.filters.model]
  );
  const apiKeyOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: allApiKeyOptionLabel },
      ...mergeSelectOptions(
        [
          ...displayOptionCache.apiKeys,
          usage.filters.apiKeyHash !== 'all'
            ? {
                value: usage.filters.apiKeyHash,
                label: maskApiKeyHash(usage.filters.apiKeyHash),
              }
            : null,
        ].filter((option): option is SelectOption => Boolean(option?.value))
      ),
    ],
    [allApiKeyOptionLabel, displayOptionCache.apiKeys, usage.filters.apiKeyHash]
  );
  const providerOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allProviderOptionLabel,
        displayOptionCache.providers,
        usage.filters.provider
      ),
    [allProviderOptionLabel, displayOptionCache.providers, usage.filters.provider]
  );
  const authFileOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.authFiles,
        usage.filters.authFile
      ),
    [allOptionLabel, displayOptionCache.authFiles, usage.filters.authFile]
  );
  const projectOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.projectIds,
        usage.filters.projectId
      ),
    [allOptionLabel, displayOptionCache.projectIds, usage.filters.projectId]
  );
  const requestTypeOptions = useMemo<SelectOption[]>(
    () =>
      buildStableSelectOptions(
        allOptionLabel,
        displayOptionCache.requestTypes,
        usage.filters.requestType
      ),
    [allOptionLabel, displayOptionCache.requestTypes, usage.filters.requestType]
  );
  const statusOptions: SelectOption[] = [
    { value: 'all', label: allStatusOptionLabel },
    { value: 'success', label: t('usage_analytics.status_success') },
    { value: 'failed', label: t('usage_analytics.status_failed') },
  ];
  const trendMetricSelectOptions: SelectOption[] = trendMetricOptions.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));
  const matrixDimensionOptions: SelectOption[] = USAGE_MATRIX_DIMENSIONS.map((dimension) => ({
    value: dimension,
    label: t(`usage_analytics.matrix_dimension_${dimension}`),
  }));
  const matrixMetricOptions: SelectOption[] = USAGE_MATRIX_METRICS.map((metric) => ({
    value: metric,
    label: t(`usage_analytics.matrix_metric_${metric}`),
  }));
  const noData = !usage.loading && !usage.error && !hasUsageData(usage.summary, usage.timeline);
  const visibleModelRows = usage.modelRows.slice(0, 8);
  const visibleApiKeyRows = usage.apiKeyRows.slice(0, 8);
  const visibleCredentialRows = usage.credentialRows.slice(0, 8);
  const abnormalApiKeyCount = usage.apiKeyRows.filter(
    (row) => row.failureCount > 0 || row.share > 0.3
  ).length;
  const abnormalCredentialCount = usage.credentialRows.filter(
    (row) => row.failureCount > 0 || row.share > 0.3
  ).length;
  const anomalyUrl = usage.anomalyAnalysis
    ? buildMonitoringDetailUrl(usage.anomalyAnalysis.point, usage.filters)
    : '';
  const overviewReasoningTokens = useMemo(
    () => usage.timeline.reduce((sum, point) => sum + point.reasoningTokens, 0),
    [usage.timeline]
  );
  const providerOverviewRows = useMemo(
    () => mapProviderRowsToRankRows(usage.providerRows),
    [usage.providerRows]
  );

  const overviewAnomalySummary = useMemo(
    () => summarizeAnomalies(usage.anomalyPoints, { minRequests: 10, limit: 3 }),
    [usage.anomalyPoints]
  );
  const overviewSummaryCards = useMemo(
    () =>
      buildUsageOverviewSummaryCards({
        anomalyCount: usage.anomalyPoints.length,
        locale: i18n.language,
        reasoningTokens: overviewReasoningTokens,
        summary: usage.summary,
        summaryDelta: usage.summaryDelta,
        t,
      }),
    [
      i18n.language,
      overviewReasoningTokens,
      t,
      usage.anomalyPoints.length,
      usage.summary,
      usage.summaryDelta,
    ]
  );
  const trendSummaryCards = useMemo(
    () =>
      buildUsageTrendSummaryCards({
        locale: i18n.language,
        summaryDelta: usage.summaryDelta,
        timeline: usage.timeline,
        t,
      }),
    [i18n.language, t, usage.summaryDelta, usage.timeline]
  );
  const modelSummaryCards = useMemo(
    () =>
      buildUsageEntitySummaryCards({
        activeAccent: 'indigo',
        activeCount: usage.modelRows.length,
        activeIcon: 'model',
        activeLabel: t('usage_analytics.active_models'),
        activeMeta: t('usage_analytics.summary_meta'),
        locale: i18n.language,
        summary: usage.summary,
        t,
      }),
    [i18n.language, t, usage.modelRows.length, usage.summary]
  );
  const apiKeySummaryCards = useMemo(
    () =>
      buildUsageEntitySummaryCards({
        activeAccent: 'violet',
        activeCount: usage.apiKeyRows.length,
        activeIcon: 'key',
        activeLabel: t('usage_analytics.active_api_keys'),
        activeMeta: t('usage_analytics.summary_meta'),
        anomalyCount: abnormalApiKeyCount,
        anomalyLabel: t('usage_analytics.anomaly_keys'),
        locale: i18n.language,
        summary: usage.summary,
        t,
      }),
    [abnormalApiKeyCount, i18n.language, t, usage.apiKeyRows.length, usage.summary]
  );
  const credentialSummaryCards = useMemo(
    () =>
      buildUsageEntitySummaryCards({
        activeAccent: 'cyan',
        activeCount: usage.credentialRows.length,
        activeIcon: 'credential',
        activeLabel: t('usage_analytics.active_credentials'),
        activeMeta: t('usage_analytics.active_credential_hint', {
          active: usage.credentialRows.length,
          total: usage.allCredentialRows.length,
        }),
        anomalyCount: abnormalCredentialCount,
        anomalyLabel: t('usage_analytics.anomaly_credentials'),
        locale: i18n.language,
        summary: usage.summary,
        t,
      }),
    [
      abnormalCredentialCount,
      i18n.language,
      t,
      usage.allCredentialRows.length,
      usage.credentialRows.length,
      usage.summary,
    ]
  );
  const heatmapSummaryCards = useMemo(
    () =>
      buildUsageHeatmapSummaryCards({
        locale: i18n.language,
        summary: usage.summary,
        t,
      }),
    [i18n.language, t, usage.summary]
  );

  const toggleMetric = (key: UsageMetricKey) => {
    setSelectedMetrics((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const applyCustomRange = () => {
    const startMs = parseDateTimeLocalValue(customStartInput);
    const endMs = parseDateTimeLocalValue(customEndInput);
    if (startMs === null || endMs === null || startMs >= endMs) return;
    updateFilters({
      timeRange: 'custom',
      customRange: { startMs, endMs },
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabSwitchPanel}>
        <SegmentedTabs
          items={usageTabItems}
          activeTab={usage.activeTab}
          onChange={usage.setActiveTab}
          ariaLabel={t('usage_analytics.tabs_label')}
          idBase="usage-analytics-tab"
          className={styles.tabs}
        />
      </div>

      <section className={styles.filterPanel}>
        <div className={styles.controlBar}>
          <div
            className={styles.segmentedControl}
            aria-label={t('usage_analytics.filter_time_range')}
          >
            {USAGE_TIME_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                className={`${styles.segmentButton} ${
                  usage.filters.timeRange === range ? styles.segmentButtonActive : ''
                }`}
                onClick={() => updateFilters({ timeRange: range })}
              >
                {t(`usage_analytics.range_${range}`)}
              </button>
            ))}
          </div>

          <div
            className={styles.segmentedControl}
            aria-label={t('usage_analytics.filter_granularity')}
          >
            {(['auto', 'hour', 'day'] as UsageAnalyticsGranularity[]).map((granularity) => (
              <button
                key={granularity}
                type="button"
                className={`${styles.segmentButton} ${
                  usage.filters.granularity === granularity ? styles.segmentButtonActive : ''
                }`}
                onClick={() => updateFilters({ granularity })}
              >
                {t(`usage_analytics.granularity_${granularity}`)}
              </button>
            ))}
          </div>

          <div className={styles.refreshControls}>
            <span className={styles.filterMeta}>
              {t('usage_analytics.resolved_granularity', {
                granularity: usage.resolvedGranularity,
              })}
            </span>
            <button
              type="button"
              className={styles.filterActionButton}
              onClick={usage.resetFilters}
            >
              {t('usage_analytics.clear_all')}
            </button>
            <button
              type="button"
              className={styles.filterActionButton}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen
                ? t('usage_analytics.hide_advanced_filters')
                : t('usage_analytics.show_advanced_filters')}
            </button>
            <Button variant="secondary" size="sm" onClick={usage.refresh} loading={usage.loading}>
              <IconRefreshCw size={15} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        <div className={styles.filterBar}>
          <div className={styles.filterGrid}>
            <Select
              value={usage.filters.model}
              options={modelOptions}
              onChange={(model) => updateFilters({ model })}
              ariaLabel={t('usage_analytics.filter_model')}
              triggerClassName={styles.filterSelectTrigger}
            />
            <Select
              value={usage.filters.apiKeyHash}
              options={apiKeyOptions}
              onChange={(apiKeyHash) => updateFilters({ apiKeyHash })}
              ariaLabel={t('usage_analytics.filter_api_key')}
              triggerClassName={styles.filterSelectTrigger}
            />
            <Select
              value={usage.filters.provider}
              options={providerOptions}
              onChange={(provider) => updateFilters({ provider })}
              ariaLabel={t('usage_analytics.filter_provider')}
              triggerClassName={styles.filterSelectTrigger}
            />
            <Select
              value={usage.filters.status}
              options={statusOptions}
              onChange={(status) => updateFilters({ status: status as UsageAnalyticsStatus })}
              ariaLabel={t('usage_analytics.filter_status')}
              triggerClassName={styles.filterSelectTrigger}
            />
          </div>
        </div>

        {usage.filters.timeRange === 'custom' ? (
          <div className={styles.customRangeRow}>
            <input
              type="datetime-local"
              value={customStartInput}
              onChange={(event) => setCustomStartInput(event.target.value)}
              aria-label={t('usage_analytics.custom_start')}
            />
            <input
              type="datetime-local"
              value={customEndInput}
              onChange={(event) => setCustomEndInput(event.target.value)}
              aria-label={t('usage_analytics.custom_end')}
            />
            <Button variant="secondary" size="sm" onClick={applyCustomRange}>
              {t('usage_analytics.apply_custom_range')}
            </Button>
          </div>
        ) : null}

        {advancedOpen ? (
          <div className={styles.advancedPanel}>
            <div className={styles.advancedGrid}>
              <label className={styles.filterGroup}>
                <span>{t('usage_analytics.filter_auth_file')}</span>
                <Select
                  value={usage.filters.authFile}
                  options={authFileOptions}
                  onChange={(authFile) => updateFilters({ authFile })}
                  ariaLabel={t('usage_analytics.filter_auth_file')}
                />
              </label>
              <label className={styles.filterGroup}>
                <span>{t('usage_analytics.filter_request_type')}</span>
                <Select
                  value={usage.filters.requestType}
                  options={requestTypeOptions}
                  onChange={(requestType) => updateFilters({ requestType })}
                  ariaLabel={t('usage_analytics.filter_request_type')}
                />
              </label>
              <label className={styles.filterGroup}>
                <span>{t('usage_analytics.filter_project_team')}</span>
                <Select
                  value={usage.filters.projectId}
                  options={projectOptions}
                  onChange={(projectId) => updateFilters({ projectId })}
                  ariaLabel={t('usage_analytics.filter_project_team')}
                />
              </label>
            </div>
          </div>
        ) : null}
      </section>

      {usage.error ? (
        <section className={styles.alertPanel}>
          <IconShield size={22} />
          <div>
            <strong>{t('usage_analytics.error_title')}</strong>
            <span>{usage.error}</span>
          </div>
        </section>
      ) : null}

      {noData ? (
        <EmptyState
          title={t('usage_analytics.empty_title')}
          body={t('usage_analytics.empty_body')}
        />
      ) : null}

      {usage.activeTab === 'overview' ? (
        <>
          <UsageSummarySection cards={overviewSummaryCards} />

          <section className={styles.overviewHeroGrid}>
            <div className={styles.chartPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.overview_trend_title')}</h2>
                  <p>{t('usage_analytics.overview_trend_hint')}</p>
                </div>
              </div>
              <UsageLineChart
                timeline={usage.timeline}
                selectedMetrics={DEFAULT_SELECTED_METRICS}
                selectedBucket={usage.selectedBucket}
                onSelectBucket={usage.selectBucket}
                compact
              />
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.health_trend_title')}</h2>
                </div>
              </div>
              <HealthTrendChart timeline={usage.timeline} />
            </div>
          </section>

          <section className={styles.analysisGrid}>
            <AnomalyPointsPanel
              rows={overviewAnomalySummary}
              onOpen={(row) => navigate(buildMonitoringDetailUrl(row, usage.filters))}
              onViewAll={() => usage.setActiveTab('trends')}
            />
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>

          <section className={styles.overviewCards}>
            <OverviewCard
              title={t('usage_analytics.model_overview_title')}
              rows={usage.modelRows}
              onViewAll={() => usage.setActiveTab('models')}
            />
            <OverviewCard
              title={t('usage_analytics.api_key_overview_title')}
              rows={usage.apiKeyRows}
              onViewAll={() => usage.setActiveTab('apiKeys')}
            />
            <OverviewCard
              title={t('usage_analytics.provider_overview_title')}
              rows={providerOverviewRows}
              onViewAll={() => usage.setActiveTab('credentials')}
            />
          </section>

          {usage.selectedBucket ? (
            <DrilldownPreviewPanel rows={usage.drilldownPreview} locale={i18n.language} />
          ) : null}
        </>
      ) : null}

      {usage.activeTab === 'trends' ? (
        <>
          <UsageSummarySection cards={trendSummaryCards} />

          <section className={styles.chartPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('usage_analytics.trend_title')}</h2>
                <p>{t('usage_analytics.trend_hint')}</p>
              </div>
            </div>
            <div className={styles.metricChips}>
              {themedUsageMetrics.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={selectedMetrics.includes(metric.key) ? styles.metricChipActive : ''}
                  style={{ '--metric-color': metric.color } as CSSProperties}
                  onClick={() => toggleMetric(metric.key)}
                >
                  <span />
                  {t(metric.labelKey)}
                </button>
              ))}
            </div>
            <div className={styles.chartCanvas}>
              <UsageLineChart
                timeline={usage.timeline}
                selectedMetrics={selectedMetrics}
                selectedBucket={usage.selectedBucket}
                onSelectBucket={usage.selectBucket}
              />
            </div>
          </section>

          {usage.anomalyAnalysis ? (
            <section className={styles.anomalyPanel}>
              <div className={styles.anomalyMain}>
                <IconTrendingUp size={32} />
                <div>
                  <h2>{t('usage_analytics.anomaly_title')}</h2>
                  <p>{formatLocalDateTime(usage.anomalyAnalysis.point.bucketMs, i18n.language)}</p>
                  <div className={styles.anomalyTags}>
                    {usage.anomalyAnalysis.anomalies.length > 0 ? (
                      usage.anomalyAnalysis.anomalies.map((item) => (
                        <span key={item.key}>{t(item.labelKey)}</span>
                      ))
                    ) : (
                      <span>{t('usage_analytics.anomaly_none')}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className={styles.anomalyMetrics}>
                {(['requestCount', 'totalTokens', 'estimatedCost'] as UsageMetricKey[]).map(
                  (key) => (
                    <div key={key}>
                      <span>{getMetricLabel(key, t)}</span>
                      <strong>{formatMetricValue(key, usage.anomalyAnalysis!.point[key])}</strong>
                      <em>{formatDelta(usage.anomalyAnalysis!.changes[key])}</em>
                    </div>
                  )
                )}
              </div>
              <div className={styles.possibleCauses}>
                <h3>{t('usage_analytics.possible_causes')}</h3>
                <ul>
                  {usage.anomalyAnalysis.causeKeys.map((causeKey) => (
                    <li key={causeKey}>{t(causeKey)}</li>
                  ))}
                </ul>
              </div>
              <Button onClick={() => navigate(anomalyUrl)}>
                {t('usage_analytics.view_monitoring_details')}
              </Button>
            </section>
          ) : null}

          {usage.selectedBucket ? (
            <DrilldownPreviewPanel rows={usage.drilldownPreview} locale={i18n.language} />
          ) : null}

          <section className={styles.dualChartGrid}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.health_trend_title')}</h2>
                </div>
              </div>
              <HealthTrendChart timeline={usage.timeline} />
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.token_structure_title')}</h2>
                  <p>{t('usage_analytics.token_structure_hint')}</p>
                </div>
              </div>
              <TokenStructureChart timeline={usage.timeline} />
            </div>
          </section>

          <section className={styles.panel}>
            <div className={`${styles.panelHeader} ${styles.trendEntityHeader}`}>
              <h2>{t('usage_analytics.trend_entity_compare_title')}</h2>
              <div
                className={`${styles.segmentedControl} ${styles.trendMetricTabs}`}
                aria-label={t('usage_analytics.filter_metric')}
              >
                {trendMetricOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.segmentButton} ${
                      usage.trendMetric === option.value ? styles.segmentButtonActive : ''
                    }`}
                    onClick={() => usage.setTrendMetric(option.value)}
                    aria-pressed={usage.trendMetric === option.value}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.trendEntityGrid}>
              <div className={styles.trendEntityChart}>
                <h3>{t('usage_analytics.model_compare_title')}</h3>
                <EntityTrendChart series={usage.modelTrendSeries} metric={usage.trendMetric} />
              </div>
              <div className={styles.trendEntityChart}>
                <h3>{t('usage_analytics.api_key_compare_title')}</h3>
                <EntityTrendChart series={usage.apiKeyTrendSeries} metric={usage.trendMetric} />
              </div>
            </div>
          </section>

          <AnomalyPointsPanel
            rows={usage.anomalyPoints}
            onOpen={(row) => navigate(buildMonitoringDetailUrl(row, usage.filters))}
          />
        </>
      ) : null}

      {usage.activeTab === 'models' ? (
        <>
          <UsageSummarySection cards={modelSummaryCards} />
          <section className={styles.analysisGrid}>
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <h2>{t('usage_analytics.model_rank_title')}</h2>
              </div>
              <RankTable
                rows={visibleModelRows}
                type="model"
                selectedId={usage.selectedModel?.id}
                onSelect={(row) => usage.setSelectedModelId(row.id)}
              />
            </div>
            <div className={styles.sidePanels}>
              <div className={styles.panel}>
                <h2>{t('usage_analytics.cost_share_title')}</h2>
                <CostShareChart rows={usage.modelRows} />
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>{t('usage_analytics.model_compare_title')}</h2>
                    <p>{t('usage_analytics.entity_trend_hint')}</p>
                  </div>
                  <Select
                    value={usage.trendMetric}
                    options={trendMetricSelectOptions}
                    onChange={(value) => usage.setTrendMetric(value as UsageTrendMetricKey)}
                    ariaLabel={t('usage_analytics.filter_metric')}
                    triggerClassName={styles.compactSelectTrigger}
                  />
                </div>
                <EntityTrendChart series={usage.modelTrendSeries} metric={usage.trendMetric} />
              </div>
            </div>
            {usage.selectedModel ? <DetailPanel row={usage.selectedModel} type="model" /> : null}
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>
        </>
      ) : null}

      {usage.activeTab === 'apiKeys' ? (
        <>
          <UsageSummarySection cards={apiKeySummaryCards} />
          <section className={styles.analysisGrid}>
            <div className={styles.apiSearchBar}>
              <IconSearch size={16} />
              <input
                value={usage.filters.apiKeyKeyword}
                onChange={(event) => updateFilters({ apiKeyKeyword: event.target.value })}
                placeholder={t('usage_analytics.api_key_keyword_placeholder')}
              />
            </div>
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <h2>{t('usage_analytics.api_key_rank_title')}</h2>
              </div>
              <RankTable
                rows={visibleApiKeyRows}
                type="apiKey"
                selectedId={usage.selectedApiKey?.apiKeyHash}
                onSelect={(row) => usage.setSelectedApiKeyHash(row.apiKeyHash || row.id)}
              />
            </div>
            <div className={styles.warningPanel}>
              <div className={styles.panelHeader}>
                <h2>{t('usage_analytics.api_key_warning_title')}</h2>
                <button type="button" onClick={() => usage.setActiveTab('heatmap')}>
                  {t('usage_analytics.view_exception_combinations')}
                </button>
              </div>
              <KeyAnomalyTable rows={usage.keyAnomalies} locale={i18n.language} />
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.entity_trend_title')}</h2>
                  <p>{t('usage_analytics.entity_trend_hint')}</p>
                </div>
                <Select
                  value={usage.trendMetric}
                  options={trendMetricSelectOptions}
                  onChange={(value) => usage.setTrendMetric(value as UsageTrendMetricKey)}
                  ariaLabel={t('usage_analytics.filter_metric')}
                  triggerClassName={styles.compactSelectTrigger}
                />
              </div>
              <EntityTrendChart series={usage.apiKeyTrendSeries} metric={usage.trendMetric} />
            </div>
            {usage.selectedApiKey ? (
              <DetailPanel
                row={usage.selectedApiKey}
                type="apiKey"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/monitoring?api_key_hash=${encodeURIComponent(
                          usage.selectedApiKey?.apiKeyHash || ''
                        )}`
                      )
                    }
                  >
                    <IconExternalLink size={14} />
                    {t('usage_analytics.view_request_details')}
                  </Button>
                }
              />
            ) : null}
          </section>
        </>
      ) : null}

      {usage.activeTab === 'credentials' ? (
        <>
          <UsageSummarySection cards={credentialSummaryCards} />
          <section className={styles.analysisGrid}>
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.credential_rank_title')}</h2>
                  <p>
                    {t('usage_analytics.active_credential_hint', {
                      active: usage.credentialRows.length,
                      total: usage.allCredentialRows.length,
                    })}
                  </p>
                </div>
                <label className={styles.toggleControl}>
                  <input
                    type="checkbox"
                    checked={usage.activeCredentialsOnly}
                    onChange={(event) => usage.setActiveCredentialsOnly(event.target.checked)}
                  />
                  <span>{t('usage_analytics.active_only')}</span>
                </label>
              </div>
              <RankTable
                rows={visibleCredentialRows}
                type="credential"
                selectedId={usage.selectedCredential?.id}
                onSelect={(row) => usage.setSelectedCredentialId(row.id)}
              />
            </div>
            <div className={styles.sidePanels}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>{t('usage_analytics.provider_usage_share_title')}</h2>
                </div>
                <ProviderSharePanel rows={usage.providerRows} />
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>{t('usage_analytics.provider_health_title')}</h2>
                </div>
                <ProviderHealthPanel rows={usage.providerRows} />
              </div>
            </div>
            {usage.selectedCredential ? (
              <DetailPanel
                row={usage.selectedCredential}
                type="credential"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/monitoring?auth_file=${encodeURIComponent(
                          usage.selectedCredential?.authFile || ''
                        )}&project_id=${encodeURIComponent(
                          usage.selectedCredential?.projectId || ''
                        )}`
                      )
                    }
                  >
                    <IconExternalLink size={14} />
                    {t('usage_analytics.view_request_details')}
                  </Button>
                }
              />
            ) : null}
            <div className={styles.tablePanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t('usage_analytics.quota_status_title')}</h2>
                  <p>{t('usage_analytics.quota_status_hint')}</p>
                </div>
              </div>
              <CredentialQuotaTable rows={usage.credentialQuotaRows} locale={i18n.language} />
            </div>
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>
        </>
      ) : null}

      {usage.activeTab === 'heatmap' ? (
        <>
          <UsageSummarySection cards={heatmapSummaryCards} />
          <section className={styles.chartPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('usage_analytics.heatmap_title')}</h2>
                <p>{t('usage_analytics.heatmap_hint')}</p>
              </div>
            </div>
            <UsageHeatmapChart points={usage.heatmap} />
          </section>
          <section className={styles.chartPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{t('usage_analytics.heatmap_matrix_title')}</h2>
                <p>{t('usage_analytics.heatmap_matrix_hint')}</p>
              </div>
              <div className={styles.matrixControls}>
                <Select
                  value={usage.matrixDimension}
                  options={matrixDimensionOptions}
                  onChange={(value) => usage.setMatrixDimension(value as UsageMatrixDimension)}
                  ariaLabel={t('usage_analytics.filter_dimension')}
                  triggerClassName={styles.compactSelectTrigger}
                />
                <Select
                  value={usage.matrixMetric}
                  options={matrixMetricOptions}
                  onChange={(value) => usage.setMatrixMetric(value as UsageMatrixMetricKey)}
                  ariaLabel={t('usage_analytics.filter_metric')}
                  triggerClassName={styles.compactSelectTrigger}
                />
              </div>
            </div>
            <MatrixHeatmap matrix={usage.matrix} />
          </section>
          <section className={styles.analysisGrid}>
            <HotCombinationsPanel matrix={usage.matrix} />
            <InsightsPanel insights={usage.insights} onOpen={usage.setActiveTab} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function OverviewCard({
  title,
  rows,
  onViewAll,
}: {
  title: string;
  rows: UsageRankRow[];
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.overviewCard}>
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
        <button type="button" onClick={onViewAll}>
          {t('usage_analytics.view_all')}
        </button>
      </div>
      <CostRankChart rows={rows} title={title} />
    </div>
  );
}

function AnomalyPointsPanel({
  rows,
  onOpen,
  onViewAll,
}: {
  rows: UsageServerAnomaly[];
  onOpen: (row: UsageServerAnomaly) => void;
  onViewAll?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.tablePanel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{t('usage_analytics.anomaly_points_title')}</h2>
          <p>{t('usage_analytics.anomaly_points_hint')}</p>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll}>
            {t('usage_analytics.view_all')}
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.anomaly_none')}</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.anomalyTable}>
            <thead>
              <tr>
                <th>{t('usage_analytics.col_time')}</th>
                <th>{t('usage_analytics.col_severity')}</th>
                <th>{t('usage_analytics.metric_request_count')}</th>
                <th>{t('usage_analytics.metric_total_tokens')}</th>
                <th>{t('usage_analytics.metric_estimated_cost')}</th>
                <th>{t('usage_analytics.col_anomaly_type')}</th>
                <th>{t('usage_analytics.col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={`${row.bucketMs}-${row.metricKeys.join('-')}`}>
                  <td>{row.label}</td>
                  <td>
                    <span
                      className={`${styles.severityBadge} ${styles[`severity${row.severity}`]}`}
                    >
                      {t(`usage_analytics.severity_${row.severity}`, row.severity)}
                    </span>
                  </td>
                  <td>{compactNumber(row.requestCount)}</td>
                  <td>{compactNumber(row.totalTokens)}</td>
                  <td>{formatMetricValue('estimatedCost', row.estimatedCost)}</td>
                  <td>
                    <span className={styles.anomalyTypeList}>
                      {row.metricKeys.slice(0, 3).map((key) => (
                        <em key={key}>{t(anomalyMetricLabelKey(key))}</em>
                      ))}
                    </span>
                  </td>
                  <td>
                    <button type="button" className={styles.linkButton} onClick={() => onOpen(row)}>
                      {t('usage_analytics.view_monitoring_details')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DrilldownPreviewPanel({ rows, locale }: { rows: UsageDrilldownEvent[]; locale: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.tablePanel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{t('usage_analytics.drilldown_preview_title')}</h2>
          <p>{t('usage_analytics.drilldown_preview_hint')}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <IconInbox size={22} />
          <span>{t('usage_analytics.drilldown_preview_empty')}</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.drilldownTable}>
            <thead>
              <tr>
                <th>{t('usage_analytics.col_time')}</th>
                <th>{t('usage_analytics.filter_request_id')}</th>
                <th>{t('usage_analytics.col_model')}</th>
                <th>{t('usage_analytics.col_api_key')}</th>
                <th>{t('usage_analytics.metric_total_tokens')}</th>
                <th>{t('usage_analytics.metric_average_latency')}</th>
                <th>{t('usage_analytics.filter_status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.eventHash}>
                  <td>{formatLocalDateTime(row.timestampMs, locale)}</td>
                  <td className={styles.monoCell}>{row.requestId || row.eventHash.slice(0, 10)}</td>
                  <td>{row.model}</td>
                  <td>{maskApiKeyHash(row.apiKeyHash)}</td>
                  <td>{compactNumber(row.totalTokens)}</td>
                  <td>{formatUsageDurationMs(row.latencyMs)}</td>
                  <td>
                    <span className={row.failed ? styles.statusFailed : styles.statusSuccess}>
                      {row.failed
                        ? t('usage_analytics.status_failed')
                        : t('usage_analytics.status_success')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RankTable({
  rows,
  type,
  selectedId,
  onSelect,
}: {
  rows: UsageRankRow[];
  type: 'model' | 'apiKey' | 'credential';
  selectedId?: string;
  onSelect: (row: UsageRankRow) => void;
}) {
  const { t } = useTranslation();
  const entityHeader =
    type === 'model'
      ? t('usage_analytics.col_model')
      : type === 'apiKey'
        ? t('usage_analytics.col_api_key')
        : t('usage_analytics.col_credential');
  return (
    <div className={styles.tableWrap}>
      <table className={type === 'apiKey' ? styles.apiKeyTable : styles.modelTable}>
        <thead>
          <tr>
            <th>{t('usage_analytics.col_rank')}</th>
            <th>{entityHeader}</th>
            <th>{t('usage_analytics.metric_request_count')}</th>
            <th>{t('usage_analytics.metric_total_tokens')}</th>
            <th>{t('usage_analytics.metric_input_tokens')}</th>
            <th>{t('usage_analytics.metric_output_tokens')}</th>
            <th>{t('usage_analytics.metric_cached_tokens')}</th>
            <th>{t('usage_analytics.metric_estimated_cost')}</th>
            <th>{t('usage_analytics.success_rate')}</th>
            <th>{t('usage_analytics.share')}</th>
            {type === 'apiKey' ? <th>{t('usage_analytics.trend')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const active = selectedId === (type === 'apiKey' ? row.apiKeyHash : row.id);
            return (
              <tr
                key={row.id}
                className={active ? styles.selectedRow : ''}
                onClick={() => onSelect(row)}
              >
                <td>{index + 1}</td>
                <td>
                  <span className={styles.entityCell}>
                    {type === 'apiKey' ? (
                      <IconKey size={16} />
                    ) : type === 'credential' ? (
                      <IconFileText size={16} />
                    ) : (
                      <IconModelCluster size={16} />
                    )}
                    {type === 'apiKey' ? maskApiKeyHash(row.apiKeyHash) : row.label}
                    {type === 'apiKey' ? <IconCopy size={13} /> : null}
                  </span>
                </td>
                <td>{compactNumber(row.requestCount)}</td>
                <td>{compactNumber(row.totalTokens)}</td>
                <td>{compactNumber(row.inputTokens)}</td>
                <td>{compactNumber(row.outputTokens)}</td>
                <td>{compactNumber(row.cachedTokens)}</td>
                <td>{formatMetricValue('estimatedCost', row.estimatedCost)}</td>
                <td>{formatPercent(row.successRate)}</td>
                <td>{formatPercent(row.share)}</td>
                {type === 'apiKey' ? (
                  <td>
                    <MiniTrendPlaceholder />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({
  row,
  type,
  action,
}: {
  row: UsageRankRow;
  type: 'model' | 'apiKey' | 'credential';
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const title =
    type === 'model'
      ? t('usage_analytics.model_detail_title', { model: row.label })
      : type === 'apiKey'
        ? t('usage_analytics.api_key_detail_title', { key: row.label })
        : t('usage_analytics.credential_detail_title', { credential: row.label });
  return (
    <div className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
        {action}
      </div>
      <div className={styles.detailMetrics}>
        {[
          ['requestCount', row.requestCount],
          ['totalTokens', row.totalTokens],
          ['inputTokens', row.inputTokens],
          ['outputTokens', row.outputTokens],
          ['estimatedCost', row.estimatedCost],
        ].map(([key, value]) => (
          <div key={String(key)}>
            <span>{getMetricLabel(key as UsageMetricKey, t)}</span>
            <strong>{formatMetricValue(key as UsageMetricKey, Number(value))}</strong>
          </div>
        ))}
        <div>
          <span>{t('usage_analytics.average_tokens_per_request')}</span>
          <strong>
            {compactNumber(row.requestCount > 0 ? row.totalTokens / row.requestCount : 0)}
          </strong>
        </div>
        <div>
          <span>{t('usage_analytics.average_cost')}</span>
          <strong>
            {formatMetricValue(
              'estimatedCost',
              row.requestCount > 0 ? row.estimatedCost / row.requestCount : 0
            )}
          </strong>
        </div>
        <div>
          <span>{t('usage_analytics.success_rate')}</span>
          <strong>{formatPercent(row.successRate)}</strong>
        </div>
      </div>
      {(type === 'apiKey' || type === 'credential') && row.models && row.models.length > 0 ? (
        <div className={styles.modelDistribution}>
          <h3>{t('usage_analytics.related_model_distribution')}</h3>
          <div>
            {row.models.slice(0, 4).map((model) => (
              <span key={model.id}>
                <i
                  style={{
                    width: `${Math.max(8, Math.min(100, (model.totalTokens / Math.max(row.totalTokens, 1)) * 100))}%`,
                  }}
                />
                <b>{model.label}</b>
                <em>{formatPercent(model.totalTokens / Math.max(row.totalTokens, 1))}</em>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function UsageAnalyticsPage() {
  return <UsageAnalyticsPageInner />;
}
