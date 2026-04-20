import { useEffect, useState } from 'react';

/**
 * Breakpoint buckets used across the app. We deliberately snap to three
 * discrete names so components don't have to reason about raw pixels:
 *
 * - `mobile`  — below 640px, the layout fundamentally changes: list and
 *   detail are separate views, chips scroll horizontally, bottom sheets
 *   take over from centred modals.
 * - `tablet`  — 640px to 1023px. The master/detail split still holds
 *   but panels are narrower and some cards collapse into tighter forms.
 * - `desktop` — 1024px and above. The reference layout; unchanged from
 *   the original build.
 *
 * These align with Tailwind defaults (`sm: 640`, `lg: 1024`) so inline
 * `sm:` / `lg:` classes on components Just Work without a custom config.
 */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 639; // below 640px
const TABLET_MAX = 1023; // 640–1023px

function currentBreakpoint(): Breakpoint {
  // SSR-safe default: assume desktop so server markup matches the
  // reference layout and the first client render can upgrade.
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w <= MOBILE_MAX) return 'mobile';
  if (w <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

/**
 * Subscribe to breakpoint changes via matchMedia. We use two queries
 * (one for mobile, one for tablet) and derive the bucket from their
 * combined state so we only re-render on the transitions that matter.
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => currentBreakpoint());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mobileMq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const tabletMq = window.matchMedia(
      `(min-width: ${MOBILE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`,
    );
    const recompute = () => setBp(currentBreakpoint());
    // addEventListener is the modern API; addListener is the legacy one
    // kept around for older Safari. We cover both so we don't crash in
    // browsers that only expose one of them.
    mobileMq.addEventListener?.('change', recompute);
    tabletMq.addEventListener?.('change', recompute);
    mobileMq.addListener?.(recompute);
    tabletMq.addListener?.(recompute);
    recompute();
    return () => {
      mobileMq.removeEventListener?.('change', recompute);
      tabletMq.removeEventListener?.('change', recompute);
      mobileMq.removeListener?.(recompute);
      tabletMq.removeListener?.(recompute);
    };
  }, []);

  return bp;
}

/** Convenience: true on screens below 640px. */
export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}

/** Convenience: true at 640–1023px. */
export function useIsTablet(): boolean {
  return useBreakpoint() === 'tablet';
}
