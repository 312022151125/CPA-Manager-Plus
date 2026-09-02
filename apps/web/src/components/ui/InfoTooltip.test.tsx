import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
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
