import { useMemo } from 'react';
import { CalendarClock, ShieldCheck } from 'lucide-react';
import {
  selectPersonalForTaxYear,
  taxYearLabel,
  taxYearRange,
  useStore,
} from '../store';
import type { TaxYearKey } from '../types';
import { AnimatedNumber } from './AnimatedNumber';

const TODAY = new Date('2026-04-19T12:00:00Z');
const DAY_MS = 86_400_000;

/**
 * Mirror of VatReadinessSummary for the personal-expenses flow. Shows
 * corporation-tax review completion, a click-through to unfinished items,
 * and a calm deadline line only when the tax year has recently ended.
 */
export function CorpTaxReadinessSummary({
  taxYear,
}: {
  taxYear: TaxYearKey;
}) {
  const transactions = useStore((s) => s.transactions);
  const startYearEnd = useStore((s) => s.startYearEnd);

  const { reviewed, total, pending, daysSinceYearEnd } = useMemo(() => {
    const scope = selectPersonalForTaxYear(transactions, taxYear);
    const total = scope.length;
    const reviewed = scope.filter(
      (t) => t.personalExpenseNote?.reviewedForCorpTax === true,
    ).length;
    const pending = total - reviewed;
    const { end } = taxYearRange(taxYear);
    const endMs = new Date(end + 'T00:00:00Z').getTime();
    const daysSince = Math.floor((TODAY.getTime() - endMs) / DAY_MS);
    return { reviewed, total, pending, daysSinceYearEnd: daysSince };
  }, [transactions, taxYear]);

  const pct = total === 0 ? 100 : Math.round((reviewed / total) * 100);

  // Only show the deadline hint for the previous tax year, and only when
  // it's recent enough that it's useful context. We never shout — this is
  // meant to feel like a friendly nudge, not a countdown clock.
  const showDeadline =
    taxYear === 'previous' && daysSinceYearEnd >= 0 && daysSinceYearEnd <= 60;
  const gentleAmber =
    taxYear === 'previous' && pending > 0 && daysSinceYearEnd >= 30;

  const handleReviewAll = () => {
    const ids = selectPersonalForTaxYear(transactions, taxYear)
      .filter((t) => !t.personalExpenseNote?.reviewedForCorpTax)
      .map((t) => t.id);
    if (ids.length > 0) startYearEnd(ids);
  };

  return (
    <div
      className={`relative flex h-full items-center gap-2.5 rounded-lg border px-3 py-1.5 transition ${
        gentleAmber
          ? 'border-amber-200 bg-amber-50'
          : 'border-ink-100 bg-paper-muted'
      }`}
      role="group"
      aria-label="Corporation tax review readiness"
    >
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
          gentleAmber
            ? 'bg-amber-100 text-amber-700'
            : 'bg-accent-soft text-accent'
        }`}
        aria-hidden="true"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 flex-col leading-tight">
        <div className="flex items-baseline gap-1.5 text-[12px] font-medium text-ink-800">
          <span>Corp tax</span>
          <span className="tabular text-[13px] font-semibold text-ink-900">
            <AnimatedNumber value={pct} />%
          </span>
          <span>reviewed</span>
        </div>
        {pending > 0 ? (
          <button
            type="button"
            onClick={handleReviewAll}
            className="truncate text-left text-[11.5px] text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
            title="Open a focused queue of the items still to review"
          >
            <AnimatedNumber value={pending} /> item
            {pending === 1 ? '' : 's'} still to review
          </button>
        ) : (
          <div className="truncate text-[11.5px] text-ink-500">
            All {taxYearLabel(taxYear).toLowerCase()} items reviewed
          </div>
        )}
        {showDeadline && (
          <div
            className={`flex items-center gap-1 text-[11px] ${
              gentleAmber ? 'font-medium text-amber-800' : 'text-ink-400'
            }`}
          >
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {daysSinceYearEnd === 0
              ? 'Tax year ended today'
              : `Tax year ended ${daysSinceYearEnd} day${
                  daysSinceYearEnd === 1 ? '' : 's'
                } ago`}
          </div>
        )}
      </div>
    </div>
  );
}
