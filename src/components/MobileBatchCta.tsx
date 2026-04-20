import { useMemo } from 'react';
import { ListChecks } from 'lucide-react';
import { useStore } from '../store';
import { applyFilters, defaultSort } from '../lib/filters';
import type { FilterKey } from '../types';

/**
 * Fixed-position mobile CTA for "Review all N in VAT mode".
 *
 * Surfaces on mobile only, under the list, whenever the user is in the
 * to-review inbox with the Needs VAT chip active and at least one
 * in-scope transaction. Gives a prominent one-tap path into
 * BatchReviewMode that doesn't require scrolling the chip row.
 *
 * Safe-area aware so it clears the home indicator on iOS. Hidden from
 * sm up (desktop/tablet already has the inline "Review all (N)" button
 * next to the Needs VAT chip in the filter bar).
 */
export function MobileBatchCta() {
  const transactions = useStore((s) => s.transactions);
  const activeFilters = useStore((s) => s.activeFilters);
  const dateRange = useStore((s) => s.dateRange);
  const accountFilter = useStore((s) => s.accountFilter);
  const currentView = useStore((s) => s.currentView);
  const startBatch = useStore((s) => s.startBatch);

  const ids = useMemo(() => {
    if (currentView !== 'to-review') return [];
    if (!activeFilters.has('needs-vat')) return [];
    const list = applyFilters(transactions, {
      filters: new Set<FilterKey>(['needs-vat']),
      dateRange,
      account: accountFilter,
      excludeReviewed: true,
    });
    return defaultSort(list).map((t) => t.id);
  }, [transactions, activeFilters, dateRange, accountFilter, currentView]);

  if (ids.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-paper px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] sm:hidden"
      role="region"
      aria-label="Batch review action"
    >
      <button
        type="button"
        onClick={() => startBatch(ids)}
        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-[14px] font-semibold text-white shadow-sm hover:bg-accent-hover"
      >
        <ListChecks className="h-4 w-4" aria-hidden="true" />
        Review all {ids.length} in VAT mode
      </button>
    </div>
  );
}
