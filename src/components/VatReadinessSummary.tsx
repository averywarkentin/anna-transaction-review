import { useMemo } from 'react';
import { CalendarClock, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { currentVatQuarterBounds, isInVatReturnScope } from '../lib/filters';
import { AnimatedNumber } from './AnimatedNumber';

const TODAY = new Date('2026-04-18T12:00:00Z');

export function VatReadinessSummary() {
  const transactions = useStore((s) => s.transactions);
  const startBatch = useStore((s) => s.startBatch);

  const { ready, total, needsVat, needsVatIds, daysToEnd } = useMemo(() => {
    // "Eligible" = VAT-eligible category, debit, current VAT quarter.
    // The "Needs VAT" chip filter uses the exact same scope, so the
    // chip count and "N transactions still need VAT" always match.
    const eligible = transactions.filter(isInVatReturnScope);
    const ready = eligible.filter((t) => t.vatStatus === 'recorded').length;
    const needsVatList = eligible.filter((t) => t.vatStatus === 'needs-vat');
    const needsVat = needsVatList.length;
    const needsVatIds = needsVatList
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map((t) => t.id);
    const total = ready + needsVat;
    const { end } = currentVatQuarterBounds();
    const daysToEnd = Math.max(
      0,
      Math.ceil((end.getTime() - TODAY.getTime()) / 86_400_000),
    );
    return { ready, total, needsVat, needsVatIds, daysToEnd };
  }, [transactions]);

  // ready % = recorded / (recorded + needs-vat) × 100. "Not applicable" is
  // out of scope (non-VAT-eligible categories never reach this count).
  const pct = total === 0 ? 100 : Math.round((ready / total) * 100);
  const showDeadline = daysToEnd <= 30;
  const urgent = daysToEnd <= 7;

  return (
    <div
      className={`relative flex h-full items-center gap-2.5 rounded-lg border px-3 py-1.5 transition ${
        urgent
          ? 'border-amber-200 bg-amber-50'
          : 'border-ink-100 bg-paper-muted'
      }`}
      role="group"
      aria-label="VAT return readiness"
    >
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
          urgent ? 'bg-amber-100 text-amber-700' : 'bg-accent-soft text-accent'
        }`}
        aria-hidden="true"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 flex-col leading-tight">
        <div className="flex items-baseline gap-1.5 text-[12px] font-medium text-ink-800">
          <span>VAT return</span>
          <span className="tabular text-[13px] font-semibold text-ink-900">
            <AnimatedNumber value={pct} />%
          </span>
          <span>ready</span>
        </div>
        <button
          type="button"
          onClick={() => {
            // Drop straight into the Reviewing VAT batch flow so a
            // single click takes the user from "12% ready" to the first
            // transaction that still needs a number on it. No batch
            // starts if nothing is outstanding.
            if (needsVatIds.length === 0) return;
            startBatch(needsVatIds);
          }}
          disabled={needsVat === 0}
          aria-label={
            needsVat === 0
              ? 'No transactions still need VAT'
              : `Review ${needsVat} transaction${needsVat === 1 ? '' : 's'} still needing VAT`
          }
          className="truncate text-left text-[11.5px] text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline disabled:cursor-default disabled:no-underline disabled:hover:text-ink-500"
        >
          <AnimatedNumber value={needsVat} /> transaction
          {needsVat === 1 ? '' : 's'} still need VAT
        </button>
        {showDeadline ? (
          <div
            className={`flex items-center gap-1 text-[11px] ${
              urgent ? 'font-medium text-amber-800' : 'text-ink-400'
            }`}
          >
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            Quarter ends in {daysToEnd} day{daysToEnd === 1 ? '' : 's'}
          </div>
        ) : (
          // When the deadline isn't urgent enough to shout about, we show
          // a small progress bar instead. Keeps this card the same height
          // as the "All transactions" card beside it, so the filter bar
          // reads as a pair of matched tiles instead of two unevenly
          // sized blocks.
          <div
            className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-ink-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${pct}% of eligible VAT transactions recorded`}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
