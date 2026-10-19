import React, { useEffect, useRef, useState } from 'react';

/** True when the visitor asked the OS for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fires once when the element first scrolls into view.
 * Without IntersectionObserver (or with reduced motion) it reports "in view" immediately,
 * so content is never left hidden.
 */
export function useInViewOnce<T extends Element>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return [ref, inView] as const;
}

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: keyof React.JSX.IntrinsicElements;
  /** Stagger position within a group (each step adds 70ms). */
  index?: number;
}

/** One-time rise-in when the block first enters the viewport. */
export const Reveal: React.FC<RevealProps> = ({ as = 'div', index = 0, className = '', style, children, ...rest }) => {
  const [ref, inView] = useInViewOnce<HTMLElement>();
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? 'is-in' : ''} ${className}`}
      style={{ ...style, '--d': index } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
};

/** Counts up from 0 to `to` once visible; keeps the final formatting (grouping, suffix). */
export const CountUp: React.FC<{ to: number; prefix?: string; suffix?: string; duration?: number; className?: string }> = ({
  to,
  prefix = '',
  suffix = '',
  duration = 1400,
  className
}) => {
  const [ref, inView] = useInViewOnce<HTMLSpanElement>();
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : 0));
  // Live data: later changes animate from the value currently shown, not from zero.
  const shownRef = useRef(value);
  shownRef.current = value;

  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf = 0;
    const from = shownRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${to.toLocaleString('en-US')}${suffix}`}>
      <span aria-hidden="true">
        {prefix}
        {value.toLocaleString('en-US')}
        {suffix}
      </span>
    </span>
  );
};
