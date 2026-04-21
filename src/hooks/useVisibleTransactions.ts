import { useMemo } from 'react';
import { taxYearRange, useStore } from '../store';
import { applyFilters, defaultSort } from '../lib/filters';
import type {
  AccountFilter,
  DateRangeKey,
  FilterKey,
  TaxYearKey,
  Transaction,
} from '../types';

/**
 * Slim view of the store fields the visible-list calculation cares about.
 * We keep this local so callers can invoke `computeVisibleTransactions`
 * from outside a component (e.g. inside a setTimeout in auto-advance
 * flows) without pulling in the whole Store type.
 */
type VisibleInputs = {
  transactions: Transaction[];
  activeFilters: ReadonlySet<FilterKey>;
  dateRange: DateRangeKey;
  customDateRange: { start: string; end: string } | null;
  accountFilter: AccountFilter;
  personalTaxYear: TaxYearKey;
  currentView: 'to-review' | 'all-transactions';
};

/**
 * Pure calculation of the list the user is currently looking at: the same
 * filtering TransactionList performs. Exported so non-component code
 * (auto-advance timeout, etc.) can resolve the next selection from the
 * latest store state without racing React.
 */
export function computeVisibleTransactions(
  s: VisibleInputs,
): Transaction[] {
  let list = applyFilters(s.transactions, {
    filters: s.activeFilters,
    dateRange: s.dateRange,
    customDateRange: s.customDateRange,
    account: s.accountFilter,
    excludeReviewed: s.currentView === 'to-review',
  });
  if (s.activeFilters.has('personal')) {
    const { start, end } = taxYearRange(s.personalTaxYear);
    list = list.filter((t) => t.date >= start && t.date <= end);
  }
  return defaultSort(list);
}

/**
 * Reactive version of {@link computeVisibleTransactions} for use inside
 * components. Subscribes to each relevant store slice individually so
 * identity-stable inputs don't cause spurious recomputes.
 */
export function useVisibleTransactions(): Transaction[] {
  const transactions = useStore((s) => s.transactions);
  const activeFilters = useStore((s) => s.activeFilters);
  const dateRange = useStore((s) => s.dateRange);
  const customDateRange = useStore((s) => s.customDateRange);
  const accountFilter = useStore((s) => s.accountFilter);
  const personalTaxYear = useStore((s) => s.personalTaxYear);
  const currentView = useStore((s) => s.currentView);

  return useMemo(
    () =>
      computeVisibleTransactions({
        transactions,
        activeFilters,
        dateRange,
        customDateRange,
        accountFilter,
        personalTaxYear,
        currentView,
      }),
    [
      transactions,
      activeFilters,
      dateRange,
      customDateRange,
      accountFilter,
      personalTaxYear,
      currentView,
    ],
  );
}
