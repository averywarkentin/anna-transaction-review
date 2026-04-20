import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  BadgeCheck,
  Calendar,
  Check,
  ChevronDown,
  Filter as FilterIcon,
  Landmark,
  ListChecks,
  Sparkles,
  User,
  Receipt,
  BadgePercent,
} from 'lucide-react';
import { taxYearLabel, taxYearRange, useStore } from '../store';
import type {
  AccountFilter,
  DateRangeKey,
  FilterKey,
  TaxYearKey,
  Transaction,
} from '../types';
import { applyFilters, countForFilter, defaultSort } from '../lib/filters';
import { ProgressIndicator } from './ProgressIndicator';
import { VatReadinessSummary } from './VatReadinessSummary';
import { CorpTaxReadinessSummary } from './CorpTaxReadinessSummary';
import { AnimatedNumber } from './AnimatedNumber';

type ChipDef = {
  key: FilterKey;
  label: string;
  icon: typeof FilterIcon;
};

const CHIPS: ChipDef[] = [
  { key: 'needs-vat', label: 'Needs VAT', icon: BadgePercent },
  { key: 'missing-receipts', label: 'Missing receipts', icon: Receipt },
  { key: 'ai-unsure', label: 'AI wasn’t sure', icon: Sparkles },
  { key: 'personal', label: 'Personal expenses', icon: User },
  { key: 'from-rules', label: 'From rules', icon: BadgeCheck },
];

/** Extra chip surfaced only in the "All transactions" view. */
const REVIEWED_CHIP: ChipDef = {
  key: 'reviewed',
  label: 'Reviewed',
  icon: Check,
};

const DATE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'this-tax-year', label: 'This tax year' },
  { value: 'custom', label: 'Custom range…' },
];

const TAX_YEAR_OPTIONS: { value: TaxYearKey; label: string }[] = [
  { value: 'previous', label: taxYearLabel('previous') },
  { value: 'current', label: taxYearLabel('current') },
  { value: 'all', label: taxYearLabel('all') },
];

const ACCOUNT_OPTIONS: { value: AccountFilter; label: string }[] = [
  { value: 'all', label: 'All accounts' },
  { value: 'ANNA Business', label: 'ANNA Business' },
  { value: 'Connected Barclays', label: 'Connected Barclays' },
  { value: 'Connected Starling', label: 'Connected Starling' },
];

export function FilterBar() {
  const transactions = useStore((s) => s.transactions);
  const activeFilters = useStore((s) => s.activeFilters);
  const dateRange = useStore((s) => s.dateRange);
  const accountFilter = useStore((s) => s.accountFilter);
  const toggleFilter = useStore((s) => s.toggleFilter);
  const setDateRange = useStore((s) => s.setDateRange);
  const setAccountFilter = useStore((s) => s.setAccountFilter);
  const clearFilters = useStore((s) => s.clearFilters);
  const startBatch = useStore((s) => s.startBatch);
  const startYearEnd = useStore((s) => s.startYearEnd);
  const personalTaxYear = useStore((s) => s.personalTaxYear);
  const setPersonalTaxYear = useStore((s) => s.setPersonalTaxYear);
  const currentView = useStore((s) => s.currentView);

  // The "Reviewed" chip only makes sense in the broader ledger view; in
  // the "To review" inbox reviewed items are excluded entirely so the
  // count would always be 0 and the chip would be noise.
  const chips = useMemo(
    () => (currentView === 'all-transactions' ? [...CHIPS, REVIEWED_CHIP] : CHIPS),
    [currentView],
  );
  // Badge counts: in the inbox we exclude reviewed (items live elsewhere);
  // in "All transactions" we include them so the number on each chip
  // matches what the list would show if the chip were toggled on.
  const excludeReviewedForCounts = currentView === 'to-review';

  const needsVatIdsInScope = useMemo(() => {
    const list = applyFilters(transactions, {
      filters: new Set<FilterKey>(['needs-vat']),
      dateRange,
      account: accountFilter,
      excludeReviewed: true,
    });
    return defaultSort(list).map((t) => t.id);
  }, [transactions, dateRange, accountFilter]);

  const personalIdsInScope = useMemo(() => {
    const { start, end } = taxYearRange(personalTaxYear);
    const list = applyFilters(transactions, {
      filters: new Set<FilterKey>(['personal']),
      dateRange,
      account: accountFilter,
      excludeReviewed: true,
    }).filter((t) => t.date >= start && t.date <= end);
    return defaultSort(list).map((t) => t.id);
  }, [transactions, dateRange, accountFilter, personalTaxYear]);

  const counts = useMemo(() => {
    const base = Object.fromEntries(
      chips.map((c) => [
        c.key,
        countForFilter(transactions, c.key, {
          dateRange,
          account: accountFilter,
          excludeReviewed: excludeReviewedForCounts,
        }),
      ]),
    ) as Record<FilterKey, number>;
    // When personal is active, the count reflects the tax-year scope too,
    // so the chip and the "Review all (N)" button agree.
    if (activeFilters.has('personal')) {
      base.personal = personalIdsInScope.length;
    }
    return base;
  }, [
    transactions,
    dateRange,
    accountFilter,
    activeFilters,
    personalIdsInScope,
    chips,
    excludeReviewedForCounts,
  ]);

  const reviewedTotals = useMemo(
    () => computeReviewTotals(transactions),
    [transactions],
  );

  const hasActiveFilter =
    activeFilters.size > 0 || dateRange !== 'all' || accountFilter !== 'all';
  const setCurrentView = useStore((s) => s.setCurrentView);

  return (
    <div className="z-20 shrink-0 border-b border-ink-100 bg-paper">
      {/* Mobile-only primary view toggle. On tablet+ the same switch lives
          in the top bar; on mobile we surface it here as a tab strip so
          the 56px header can stay compact. The "To review" tab carries
          a count pill so users see at a glance how much work is waiting
          without having to switch views to check. */}
      <div className="flex items-center gap-1 border-b border-ink-100 px-4 pb-2 pt-2 sm:hidden">
        <button
          type="button"
          onClick={() => setCurrentView('to-review')}
          aria-pressed={currentView === 'to-review'}
          aria-label={`To review, ${reviewedTotals.total - reviewedTotals.reviewed} transactions`}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium transition ${
            currentView === 'to-review'
              ? 'bg-ink-900 text-white'
              : 'bg-ink-50 text-ink-700'
          }`}
        >
          <span>To review</span>
          <span
            className={`tabular rounded-full px-1.5 py-px text-[11px] font-semibold ${
              currentView === 'to-review'
                ? 'bg-white/20 text-white'
                : 'bg-white text-ink-700'
            }`}
          >
            <AnimatedNumber
              value={reviewedTotals.total - reviewedTotals.reviewed}
            />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setCurrentView('all-transactions')}
          aria-pressed={currentView === 'all-transactions'}
          className={`flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition ${
            currentView === 'all-transactions'
              ? 'bg-ink-900 text-white'
              : 'bg-ink-50 text-ink-700'
          }`}
        >
          All transactions
        </button>
      </div>

      {/* Mobile-only compact readiness strip. On desktop/tablet the two
          cards sit on the right of the chip row; on mobile there isn't
          room, so we collapse each into a single line of key info and
          stack them under the view toggle. */}
      <div className="flex items-stretch gap-2 px-4 py-2 sm:hidden">
        <ProgressIndicator
          reviewed={reviewedTotals.reviewed}
          total={reviewedTotals.total}
        />
        {activeFilters.has('personal') ? (
          <CorpTaxReadinessSummary taxYear={personalTaxYear} />
        ) : (
          <VatReadinessSummary />
        )}
      </div>

      <div className="mx-auto flex max-w-[1440px] flex-nowrap items-center gap-2 overflow-x-auto px-4 py-2 sm:flex-wrap sm:overflow-visible sm:px-6 sm:py-3 lg:px-8">
        <div
          className="flex flex-nowrap items-center gap-2 sm:flex-wrap"
          role="group"
          aria-label="Quick filters"
        >
          {chips.map((c) => {
            const active = activeFilters.has(c.key);
            const Icon = c.icon;
            const onChipKey = (e: React.KeyboardEvent) => {
              if (
                c.key === 'needs-vat' &&
                active &&
                e.key === 'Enter' &&
                needsVatIdsInScope.length > 0
              ) {
                e.preventDefault();
                startBatch(needsVatIdsInScope);
              }
              if (
                c.key === 'personal' &&
                active &&
                e.key === 'Enter' &&
                personalIdsInScope.length > 0
              ) {
                e.preventDefault();
                startYearEnd(personalIdsInScope);
              }
            };
            return (
              <div key={c.key} className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleFilter(c.key)}
                  onKeyDown={onChipKey}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-[13px] font-medium transition sm:py-1.5 sm:text-[12.5px] ${
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-ink-100 bg-paper text-ink-700 hover:border-ink-200 hover:bg-ink-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{c.label}</span>
                  <span
                    className={`tabular rounded-full px-1.5 py-px text-[11px] ${
                      active
                        ? 'bg-white/70 text-accent'
                        : 'bg-ink-50 text-ink-500'
                    }`}
                  >
                    <AnimatedNumber value={counts[c.key]} />
                  </span>
                </button>
                {c.key === 'needs-vat' &&
                  active &&
                  needsVatIdsInScope.length > 0 && (
                    <button
                      type="button"
                      onClick={() => startBatch(needsVatIdsInScope)}
                      className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-accent-hover"
                      title="Review all transactions that need VAT, one after another (Enter)"
                    >
                      <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                      Review all ({needsVatIdsInScope.length})
                    </button>
                  )}
                {c.key === 'personal' && active && (
                  <>
                    <Dropdown
                      compact
                      icon={
                        <Calendar
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      }
                      label={taxYearLabel(personalTaxYear)}
                      options={TAX_YEAR_OPTIONS}
                      value={personalTaxYear}
                      onChange={(v) => setPersonalTaxYear(v as TaxYearKey)}
                    />
                    {personalIdsInScope.length > 0 && (
                      <button
                        type="button"
                        onClick={() => startYearEnd(personalIdsInScope)}
                        className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-accent-hover"
                        title="Step through each personal item for corporation tax review (Enter)"
                      >
                        <ListChecks
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        Review all ({personalIdsInScope.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Secondary filters (date, account, advanced). Hidden on mobile
            where they'd break the single chip strip; a future "Filters"
            bottom sheet can reinstate them. */}
        <div
          className="hidden h-6 w-px bg-ink-100 mx-1 sm:block"
          aria-hidden="true"
        />

        <div className="hidden items-center gap-2 sm:flex">
          <Dropdown
            icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />}
            label={
              DATE_OPTIONS.find((o) => o.value === dateRange)?.label ??
              'All dates'
            }
            options={DATE_OPTIONS}
            value={dateRange}
            onChange={(v) => setDateRange(v as DateRangeKey)}
          />

          <Dropdown
            icon={<Landmark className="h-3.5 w-3.5" aria-hidden="true" />}
            label={
              ACCOUNT_OPTIONS.find((o) => o.value === accountFilter)?.label ??
              'All accounts'
            }
            options={ACCOUNT_OPTIONS}
            value={accountFilter}
            onChange={(v) => setAccountFilter(v as AccountFilter)}
          />

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink-700 hover:border-ink-200 hover:bg-ink-50"
          >
            <FilterIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Advanced filters
          </button>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-[12.5px] font-medium text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Desktop/tablet readiness cards. Hidden on mobile — the
            compact mobile strip at the top of this bar carries that
            information instead. */}
        <div className="ml-auto hidden items-stretch gap-4 sm:flex">
          <ProgressIndicator
            reviewed={reviewedTotals.reviewed}
            total={reviewedTotals.total}
          />
          {activeFilters.has('personal') ? (
            <CorpTaxReadinessSummary taxYear={personalTaxYear} />
          ) : (
            <VatReadinessSummary />
          )}
        </div>
      </div>
    </div>
  );
}

function computeReviewTotals(list: Transaction[]) {
  let reviewed = 0;
  for (const t of list) if (t.reviewed) reviewed++;
  return { reviewed, total: list.length };
}

type DropdownProps = {
  icon: ReactNode;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  /** Smaller padding; useful when nested beside an active chip. */
  compact?: boolean;
};

function Dropdown({
  icon,
  label,
  options,
  value,
  onChange,
  compact,
}: DropdownProps) {
  const pad = compact ? 'px-2.5 py-1' : 'px-3 py-1.5';
  return (
    <label
      className={`relative inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-paper ${pad} text-[12px] font-medium text-ink-700 hover:border-ink-200 hover:bg-ink-50 focus-within:ring-2 focus-within:ring-accent-ring focus-within:ring-offset-2`}
    >
      {icon}
      <span className="pr-5">{label}</span>
      <ChevronDown
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-ink-400"
        aria-hidden="true"
      />
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
