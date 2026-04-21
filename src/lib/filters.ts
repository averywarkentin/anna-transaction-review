import type {
  AccountFilter,
  Category,
  DateRangeKey,
  FilterKey,
  Transaction,
} from '../types';
import { VAT_ELIGIBLE_CATEGORIES } from '../data/transactions';

const TODAY = new Date('2026-04-18T12:00:00Z');

/**
 * Current VAT return quarter bounds (inclusive).
 *
 * VAT readiness is always computed against the active quarter, regardless
 * of the global date range dropdown. The "Needs VAT" chip and the VAT
 * return card both use this scope so their numbers always agree.
 */
export function currentVatQuarterBounds(d: Date = TODAY): {
  start: Date;
  end: Date;
} {
  const q = Math.floor(d.getUTCMonth() / 3);
  const start = new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0, 23, 59, 59),
  );
  return { start, end };
}

/**
 * True when the transaction belongs to the current VAT return: a debit in
 * a VAT-eligible category within the current VAT quarter. Shared by the
 * "Needs VAT" filter and the VAT return readiness card.
 */
export function isInVatReturnScope(t: Transaction): boolean {
  if (t.amount > 0) return false;
  if (!VAT_ELIGIBLE_CATEGORIES.includes(t.category)) return false;
  const { start, end } = currentVatQuarterBounds();
  const d = new Date(t.date);
  return d >= start && d <= end;
}

function withinDateRange(
  iso: string,
  range: DateRangeKey,
  customRange?: { start: string; end: string } | null,
): boolean {
  if (range === 'all') return true;
  if (range === 'custom') {
    if (!customRange) return true;
    // Both endpoints inclusive. ISO date-only strings compare
    // lexicographically, so string compare is correct here.
    const day = iso.slice(0, 10);
    return day >= customRange.start && day <= customRange.end;
  }
  const d = new Date(iso);

  if (range === 'this-month') {
    return (
      d.getUTCFullYear() === TODAY.getUTCFullYear() &&
      d.getUTCMonth() === TODAY.getUTCMonth()
    );
  }

  if (range === 'last-month') {
    const lastMonth = new Date(TODAY);
    lastMonth.setUTCMonth(TODAY.getUTCMonth() - 1);
    return (
      d.getUTCFullYear() === lastMonth.getUTCFullYear() &&
      d.getUTCMonth() === lastMonth.getUTCMonth()
    );
  }

  if (range === 'this-quarter') {
    const quarter = Math.floor(TODAY.getUTCMonth() / 3);
    const dQuarter = Math.floor(d.getUTCMonth() / 3);
    return (
      d.getUTCFullYear() === TODAY.getUTCFullYear() && dQuarter === quarter
    );
  }

  if (range === 'this-tax-year') {
    const startYear =
      TODAY.getUTCMonth() >= 3
        ? TODAY.getUTCFullYear()
        : TODAY.getUTCFullYear() - 1;
    const start = Date.UTC(startYear, 3, 6);
    const end = Date.UTC(startYear + 1, 3, 6);
    const t = d.getTime();
    return t >= start && t < end;
  }

  return true;
}

export function matchesFilter(txn: Transaction, key: FilterKey): boolean {
  switch (key) {
    case 'needs-vat':
      // Scoped to the current VAT return: the chip count and the VAT
      // return readiness card must always agree.
      return txn.vatStatus === 'needs-vat' && isInVatReturnScope(txn);
    case 'missing-receipts':
      return txn.receiptRequired && !txn.receiptAttached;
    case 'ai-unsure':
      return txn.categoryConfidence === 'low';
    case 'personal':
      return txn.isPersonal;
    case 'from-rules':
      return txn.categorySource === 'rule';
    case 'reviewed':
      // Only meaningful in the "All transactions" view; the chip is hidden
      // in the "To review" view (where reviewed items are excluded anyway).
      return txn.reviewed === true;
  }
}

/**
 * Case-insensitive free-text match against merchant, description,
 * category, or amount digits. Amount match is intentionally loose:
 * typing "42" matches £42.00, £142.50, etc.
 */
function matchesQuery(t: Transaction, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (t.merchant.toLowerCase().includes(needle)) return true;
  if ((t.description ?? '').toLowerCase().includes(needle)) return true;
  if (t.category.toLowerCase().includes(needle)) return true;
  const absStr = Math.abs(t.amount).toFixed(2);
  if (absStr.includes(needle.replace(/[£,\s]/g, ''))) return true;
  return false;
}

export function applyFilters(
  transactions: Transaction[],
  opts: {
    filters: ReadonlySet<FilterKey>;
    dateRange: DateRangeKey;
    /** Inclusive custom start/end when dateRange === 'custom'. */
    customDateRange?: { start: string; end: string } | null;
    account: AccountFilter;
    /** If true, hide reviewed transactions (the "To review" view). */
    excludeReviewed?: boolean;
    /** Secondary category narrowing. Empty/undefined = no narrow. */
    categoryFilter?: ReadonlySet<Category>;
    /** Free-text search; trimmed, case-insensitive. */
    searchQuery?: string;
  },
): Transaction[] {
  return transactions.filter((t) => {
    if (opts.excludeReviewed && t.reviewed) return false;
    if (opts.account !== 'all' && t.account !== opts.account) return false;
    if (!withinDateRange(t.date, opts.dateRange, opts.customDateRange))
      return false;
    if (opts.categoryFilter && opts.categoryFilter.size > 0 &&
      !opts.categoryFilter.has(t.category))
      return false;
    if (opts.searchQuery && !matchesQuery(t, opts.searchQuery)) return false;
    for (const f of opts.filters) {
      if (!matchesFilter(t, f)) return false;
    }
    return true;
  });
}

export function countForFilter(
  transactions: Transaction[],
  key: FilterKey,
  baseOpts: {
    dateRange: DateRangeKey;
    customDateRange?: { start: string; end: string } | null;
    account: AccountFilter;
    /** If true, exclude reviewed transactions from the count. */
    excludeReviewed?: boolean;
  },
): number {
  let n = 0;
  for (const t of transactions) {
    if (baseOpts.excludeReviewed && t.reviewed) continue;
    if (baseOpts.account !== 'all' && t.account !== baseOpts.account) continue;
    if (!withinDateRange(t.date, baseOpts.dateRange, baseOpts.customDateRange))
      continue;
    if (matchesFilter(t, key)) n++;
  }
  return n;
}

export function hasAnyFlag(t: Transaction): boolean {
  return (
    t.vatStatus === 'needs-vat' ||
    (t.receiptRequired && !t.receiptAttached) ||
    t.categoryConfidence === 'low' ||
    t.isPersonal
  );
}

export function defaultSort(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => {
    const aFlag = hasAnyFlag(a);
    const bFlag = hasAnyFlag(b);
    if (aFlag && !bFlag) return -1;
    if (!aFlag && bFlag) return 1;
    if (aFlag && bFlag) {
      return a.date.localeCompare(b.date);
    }
    return b.date.localeCompare(a.date);
  });
}
