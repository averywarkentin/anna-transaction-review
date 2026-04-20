import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number;
  duration?: number;
};

/**
 * Tweens between numeric values over ~250ms so counter changes feel
 * like progress rather than a jump. Uses ease-out cubic.
 */
export function AnimatedNumber({ value, duration = 250 }: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(step);
      } else {
        prevRef.current = to;
        setDisplay(to);
      }
    }

    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(step);

    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <>{Math.round(display)}</>;
}
