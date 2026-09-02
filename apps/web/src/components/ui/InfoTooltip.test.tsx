import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { InfoTooltip, resolveInfoTooltipPosition } from './InfoTooltip';

describe('InfoTooltip', () => {
  it('opens from keyboard focus with an accessible tooltip', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<InfoTooltip ariaLabel="Thinking levels information" content="Details" />);
    });

    const trigger = renderer.root.findByProps({ 'data-info-tooltip-trigger': 'true' });
    expect(trigger.props['aria-describedby']).toBeUndefined();

    act(() => {
      trigger.props.onFocus();
    });

    const tooltip = renderer.root.findByProps({ role: 'tooltip' });
    expect(tooltip.children.join('')).toContain('Details');
    expect(trigger.props['aria-describedby']).toBe(tooltip.props.id);

    act(() => {
      renderer.root.findByProps({ 'data-info-tooltip-trigger': 'true' }).props.onBlur();
    });
    expect(renderer.root.findAllByProps({ role: 'tooltip' })).toHaveLength(0);
    expect(
      renderer.root.findByProps({ 'data-info-tooltip-trigger': 'true' }).props['aria-describedby']
    ).toBeUndefined();
  });

  it('opens on hover and closes when the pointer leaves', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<InfoTooltip ariaLabel="Information" content="Details" />);
    });

    const trigger = renderer.root.findByProps({ 'data-info-tooltip-trigger': 'true' });
    act(() => {
      trigger.props.onMouseEnter();
    });
    expect(renderer.root.findAllByProps({ role: 'tooltip' })).toHaveLength(1);

    act(() => {
      renderer.root.findByProps({ 'data-info-tooltip-trigger': 'true' }).props.onMouseLeave();
    });
    expect(renderer.root.findAllByProps({ role: 'tooltip' })).toHaveLength(0);
  });

  it('closes on Escape and prevents the browser default action', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<InfoTooltip ariaLabel="Information" content="Details" />);
    });
    const preventDefault = vi.fn();
    const trigger = renderer.root.findByProps({ 'data-info-tooltip-trigger': 'true' });

    act(() => {
      trigger.props.onFocus();
    });
    act(() => {
      renderer.root.findByProps({ 'data-info-tooltip-trigger': 'true' }).props.onKeyDown({
        key: 'Escape',
        preventDefault,
      });
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ role: 'tooltip' })).toHaveLength(0);
  });

  it('keeps the tooltip within the viewport at narrow widths', () => {
    const position = resolveInfoTooltipPosition(
      { bottom: 100, left: 4, top: 84, width: 16 },
      320,
      640
    );

    expect(position.style.left).toBe(160);
    expect(position.style.maxWidth).toBe(296);
  });
});
