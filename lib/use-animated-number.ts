"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a numeric value toward its latest target over `durationMs`,
 * easing out. Used for balances, block heights, and totals throughout the
 * dashboard so changes read as a continuous ticking ledger rather than
 * discrete jumps — the visual motif the whole design is built around.
 * Respects prefers-reduced-motion by snapping immediately.
 */
export function useAnimatedNumber(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef(target);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setValue(target);
      return;
    }

    fromRef.current = value;
    startRef.current = performance.now();
    const from = fromRef.current;
    const delta = target - from;

    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + delta * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
