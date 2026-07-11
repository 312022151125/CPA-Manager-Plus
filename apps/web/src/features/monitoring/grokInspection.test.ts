import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthFileItem, XaiBillingSummary } from '@/types';
import { authFilesApi } from '@/services/api/authFiles';
import {
  DEFAULT_GROK_INSPECTION_SETTINGS,
  GROK_INSPECTION_SETTINGS_STORAGE_KEY,
  createGrokInspectionConnectionFingerprint,
  executeGrokInspectionActions,
  loadGrokInspectionConfigurableSettings,
  resolveGrokInspectionAutoActionItems,
  resolveGrokProbeAction,
  saveGrokInspectionConfigurableSettings,
  type GrokInspectionAction,
  type GrokInspectionResultItem,
} from './grokInspection';
import { buildGrokQuotaWindows, inspectSingleGrokAccount, toGrokInspectionAccount } from './model/grokInspectionProbe';

vi.mock('@/utils/quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/quota')>();
  return {
    ...actual,
    fetchXaiQuota: vi.fn(),
  };
});

import { createStatusError, fetchXaiQuota } from '@/utils/quota';
const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => {
      values.clear();
    }),
  } as unknown as Storage;
};

const createResultItem = (
  action: GrokInspectionAction,
  overrides: Partial<GrokInspectionResultItem> = {}
): GrokInspectionResultItem => ({
  key: overrides.key ?? `${action}.json::1`,
  fileName: overrides.fileName ?? `${action}.json`,
  displayAccount: overrides.displayAccount ?? `${action}@example.com`,
  authIndex: overrides.authIndex ?? '1',
  provider: overrides.provider ?? 'xai',
  disabled: overrides.disabled ?? false,
  status: overrides.status ?? '',
  state: overrides.state ?? '',
  raw:
    overrides.raw ??
    ({
      name: `${action}.json`,
      type: 'xai',
      authIndex: '1',
    } as AuthFileItem),
  action,
  actionReason: overrides.actionReason ?? 'reason',
  statusCode: overrides.statusCode ?? 200,
  usedPercent: overrides.usedPercent ?? null,
  isQuota: overrides.isQuota ?? false,
  error: overrides.error ?? '',
  planType: overrides.planType ?? '',
  quotaWindows: overrides.quotaWindows ?? [],
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resolveGrokProbeAction', () => {
  it('suggests disable when usage >= threshold and enabled', () => {
    expect(resolveGrokProbeAction({ disabled: false }, 100, 100)).toEqual({
      action: 'disable',
      actionReason: 'monitoring.grok_inspection_reason_quota_high',
      isQuota: true,
    });
  });

  it('keeps already disabled over-threshold accounts', () => {
    expect(resolveGrokProbeAction({ disabled: true }, 100, 100)).toEqual({
      action: 'keep',
      actionReason: 'monitoring.grok_inspection_reason_quota_high_already_disabled',
      isQuota: true,
    });
  });

  it('suggests enable when recovered under threshold', () => {
    expect(resolveGrokProbeAction({ disabled: true }, 10, 100)).toEqual({
      action: 'enable',
      actionReason: 'monitoring.grok_inspection_reason_recovered',
      isQuota: false,
    });
  });

  it('keeps disabled accounts when usage is unknown', () => {
    expect(resolveGrokProbeAction({ disabled: true }, null, 100)).toEqual({
      action: 'keep',
      actionReason: 'monitoring.grok_inspection_reason_disabled_usage_unknown',
      isQuota: false,
    });
  });

  it('keeps healthy accounts', () => {
    expect(resolveGrokProbeAction({ disabled: false }, 10, 100)).toEqual({
      action: 'keep',
      actionReason: 'monitoring.grok_inspection_reason_ok',
      isQuota: false,
    });
  });
});

describe('buildGrokQuotaWindows', () => {
  it('maps weekly and monthly billing into windows and max usedPercent', () => {
    const billing: XaiBillingSummary = {
      periodType: 'weekly',
      usagePercent: 80,
      periodEnd: '2026-07-12T00:00:00Z',
      productUsage: [{ product: 'grok', usagePercent: 90 }],
      monthlyLimitCents: 1000,
      usedCents: 500,
      includedUsedCents: 500,
      onDemandCapCents: null,
      onDemandUsedCents: null,
      onDemandUsedPercent: null,
      billingPeriodEnd: '2026-08-01T00:00:00Z',
      usedPercent: 50,
    };

    const windows = buildGrokQuotaWindows(billing);
    expect(windows.find((item) => item.id === 'weekly')?.usedPercent).toBe(80);
    expect(windows.find((item) => item.id === 'monthly')?.usedPercent).toBe(50);
    expect(windows.find((item) => item.id === 'product-0')?.usedPercent).toBe(90);
    expect(windows.find((item) => item.id === 'product-0')?.labelKey).toBe('xai_quota.product_usage');
  });
});

describe('inspectSingleGrokAccount', () => {
  const t = ((key: string) => key) as never;
  const settings = {
    ...DEFAULT_GROK_INSPECTION_SETTINGS,
    baseUrl: 'http://localhost',
    token: 'token',
  };

  it('returns reauth on 401', async () => {
    const account = toGrokInspectionAccount({
      name: 'xai.json',
      type: 'xai',
      authIndex: '9',
      account: 'user@x.ai',
    } as AuthFileItem);
    vi.mocked(fetchXaiQuota).mockRejectedValue(createStatusError('unauthorized', 401));

    const result = await inspectSingleGrokAccount({ account, settings, t });
    expect(result.action).toBe('reauth');
    expect(result.statusCode).toBe(401);
    expect(result.actionReason).toBe('monitoring.grok_inspection_reason_reauth');
  });
  it('maps successful billing and suggests disable at threshold', async () => {
    const account = toGrokInspectionAccount({
      name: 'xai.json',
      type: 'xai',
      authIndex: '9',
      account: 'user@x.ai',
    } as AuthFileItem);
    vi.mocked(fetchXaiQuota).mockResolvedValueOnce({
      periodType: 'weekly',
      usagePercent: 100,
      periodEnd: '2026-07-12T00:00:00Z',
      productUsage: [],
      monthlyLimitCents: null,
      usedCents: null,
      includedUsedCents: null,
      onDemandCapCents: null,
      onDemandUsedCents: null,
      onDemandUsedPercent: null,
      billingPeriodEnd: '2026-08-01T00:00:00Z',
      usedPercent: 20,
    });

    const result = await inspectSingleGrokAccount({
      account,
      settings: { ...settings, usedPercentThreshold: 100 },
      t,
    });
    expect(result.action).toBe('disable');
    expect(result.statusCode).toBe(200);
    expect(result.usedPercent).toBe(100);
    expect(result.quotaWindows?.length).toBeGreaterThan(0);
  });
});

describe('executeGrokInspectionActions', () => {
  it('dedupes by fileName and keeps first action', async () => {
    const deleteSpy = vi.spyOn(authFilesApi, 'deleteFileByName').mockResolvedValue({
      success: [],
      failed: [],
    } as never);
    const statusSpy = vi.spyOn(authFilesApi, 'setStatusWithFallback').mockResolvedValue(undefined as never);
    vi.spyOn(authFilesApi, 'list').mockResolvedValue({ files: [] } as never);

    const items = [
      createResultItem('disable', { fileName: 'same.json', displayAccount: 'a' }),
      createResultItem('enable', { fileName: 'same.json', displayAccount: 'b' }),
    ];

    const result = await executeGrokInspectionActions({
      settings: {
        ...DEFAULT_GROK_INSPECTION_SETTINGS,
        baseUrl: '',
        token: '',
      },
      items,
      previousFiles: [],
    });

    expect(statusSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledWith('same.json', true);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]?.action).toBe('disable');
  });
});

describe('Grok inspection settings storage', () => {
  it('round-trips configurable settings under grok storage key', () => {
    const storage = createStorage();
    vi.stubGlobal('localStorage', storage);

    const saved = saveGrokInspectionConfigurableSettings({
      workers: 3,
      retries: 2,
      timeout: 45,
      usedPercentThreshold: 90,
      sampleSize: 5,
      autoActionMode: 'enable',
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      GROK_INSPECTION_SETTINGS_STORAGE_KEY,
      expect.any(String)
    );
    expect(saved.workers).toBe(3);
    expect(loadGrokInspectionConfigurableSettings()).toEqual(saved);
  });
});

describe('Grok inspection helpers', () => {
  it('prefixes connection fingerprint with grok:', () => {
    const fingerprint = createGrokInspectionConnectionFingerprint(
      'http://localhost:8317',
      'management-key'
    );
    expect(fingerprint).toMatch(/^grok:v1:/);
  });

  it('filters auto action items by mode', () => {
    const items = [
      createResultItem('enable'),
      createResultItem('disable'),
      createResultItem('delete'),
    ];
    expect(resolveGrokInspectionAutoActionItems('enable', items).map((item) => item.action)).toEqual([
      'enable',
    ]);
    expect(
      resolveGrokInspectionAutoActionItems('disable', items).map((item) => item.action)
    ).toEqual(['disable', 'disable']);
  });
});
