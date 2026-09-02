import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { IconInfo } from './icons';
import styles from './InfoTooltip.module.scss';

const VIEWPORT_MARGIN = 12;
const TOOLTIP_OFFSET = 8;
const TOOLTIP_MAX_WIDTH = 420;
const TOOLTIP_MAX_HEIGHT = 360;

type TooltipPlacement = 'above' | 'below';

type TooltipAnchorRect = Pick<DOMRect, 'bottom' | 'left' | 'top' | 'width'>;

export type InfoTooltipPosition = {
  placement: TooltipPlacement;
  style: CSSProperties;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// eslint-disable-next-line react-refresh/only-export-components
export const resolveInfoTooltipPosition = (
  rect: TooltipAnchorRect,
  viewportWidth: number,
  viewportHeight: number
): InfoTooltipPosition => {
  const maxWidth = Math.max(0, Math.min(TOOLTIP_MAX_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2));
  const halfWidth = maxWidth / 2;
  const left = clamp(
    rect.left + rect.width / 2,
    VIEWPORT_MARGIN + halfWidth,
    Math.max(VIEWPORT_MARGIN + halfWidth, viewportWidth - VIEWPORT_MARGIN - halfWidth)
  );
  const spaceAbove = rect.top - VIEWPORT_MARGIN - TOOLTIP_OFFSET;
  const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - TOOLTIP_OFFSET;
  const placement: TooltipPlacement =
    spaceAbove >= TOOLTIP_MAX_HEIGHT || spaceAbove >= spaceBelow ? 'above' : 'below';
  const availableHeight = Math.max(0, placement === 'above' ? spaceAbove : spaceBelow);

  return placement === 'above'
    ? {
        placement,
        style: {
          left,
          bottom: viewportHeight - rect.top + TOOLTIP_OFFSET,
          maxWidth,
          maxHeight: Math.min(TOOLTIP_MAX_HEIGHT, availableHeight),
        },
      }
    : {
        placement,
        style: {
          left,
          top: rect.bottom + TOOLTIP_OFFSET,
          maxWidth,
          maxHeight: Math.min(TOOLTIP_MAX_HEIGHT, availableHeight),
        },
      };
};

interface InfoTooltipProps {
  content: ReactNode;
  ariaLabel: string;
  className?: string;
}

export function InfoTooltip({ content, ariaLabel, className = '' }: InfoTooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<InfoTooltipPosition | null>(null);
  const isBrowser = typeof document !== 'undefined';

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    setPosition(
      resolveInfoTooltipPosition(
        triggerRef.current.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight
      )
    );
  }, []);

  const showTooltip = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hideTooltip = useCallback(() => setOpen(false), []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const tooltip = (
    <span
      id={tooltipId}
      role="tooltip"
      className={styles.tooltip}
      style={isBrowser ? position?.style : undefined}
      data-placement={position?.placement}
      data-info-tooltip-content="true"
    >
      {content}
    </span>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onKeyDown={handleKeyDown}
        data-info-tooltip-trigger="true"
      >
        <IconInfo size={15} />
      </button>
      {open && !isBrowser ? tooltip : null}
      {open && isBrowser && position ? createPortal(tooltip, document.body) : null}
    </>
  );
}
