import type { ComponentProps } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { AccountLatestRequest } from './AccountLatestRequest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) =>
      ({
        'monitoring.fail_status_code_short': 'HTTP',
        'monitoring.result_failed': 'Failed',
        'monitoring.result_success': 'Success',
        'monitoring.header_error': 'Header error',
        'monitoring.header_trace': 'Trace',
        'accounts.latest_request_copy_details': 'Copy error details',
        'accounts.latest_request_time_title': 'Last real request time',
        'accounts.latest_request_loading': 'Loading request',
        'accounts.latest_request_unavailable': 'Request record unavailable',
        'accounts.latest_request_empty': 'No request yet',
      })[key] ?? key,
  }),
}));

const readText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readText).join('');
  if (value && typeof value === 'object') {
    if ('props' in value) {
      return readText((value as { props: { children?: unknown } }).props.children);
    }
    if ('children' in value) {
      return readText((value as { children?: unknown }).children);
    }
  }
  return '';
};

const renderLatestRequest = (props: Partial<ComponentProps<typeof AccountLatestRequest>> = {}) => {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(<AccountLatestRequest onCopy={vi.fn()} {...props} />);
  });
  return renderer!;
};

const containsText = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => readText(node.props.children).includes(text)).length > 0;

describe('AccountLatestRequest', () => {
  it('shows a failed latest request with a copyable, masked diagnostic tooltip', () => {
    const onCopy = vi.fn();
    const renderer = renderLatestRequest({
      onCopy,
      latestRequest: {
        timestamp_ms: 1_700_000_000_000,
        failed: true,
        fail_status_code: 429,
        fail_summary: 'Authorization: Bearer private-request-token',
        header_error_kind: 'rate_limit',
        header_error_code: 'quota_exceeded',
        header_trace_id: 'trace-123',
      },
    });

    const trigger = renderer.root.findByProps({
      'aria-label': 'Failed · HTTP 429 · Authorization: [redacted] · rate_limit',
    });
    act(() => trigger.props.onClick());
    expect(readText(trigger.props.children)).toContain('HTTP 429');

    const copyButton = renderer.root.findByProps({ 'aria-label': 'Copy error details' });
    act(() => copyButton.props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() }));

    expect(onCopy).toHaveBeenCalledWith(
      'HTTP 429\nAuthorization: [redacted]\nHeader error: rate_limit / quota_exceeded\nTrace: trace-123'
    );
  });

  it('distinguishes successful and missing request records', () => {
    const success = renderLatestRequest({
      latestRequest: { timestamp_ms: 1_700_000_000_000, failed: false },
    });
    expect(containsText(success, 'Success')).toBe(true);

    const empty = renderLatestRequest();
    expect(containsText(empty, 'No request yet')).toBe(true);
  });
});
