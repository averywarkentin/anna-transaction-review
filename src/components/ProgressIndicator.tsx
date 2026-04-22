import { ListChecks } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { useStore } from '../store';

type Props = {
  reviewed: number;
  total: number;
};

/**
 * "All transactions" readiness card. Visually paired with the VAT return
 * readiness card so the filter bar ends with two cards of matching weight:
 * a denominator (this one) and a scoped figure (VAT / corp tax).
 *
 * Clicking the card switches to the "All transactions" top-level view —
 * the card acts as a shortcut into the ledger so the user doesn't have to
 * hunt for the nav link when they're looking at a number and want to see
 * what it's counting.
 */
export function ProgressIndicator({ reviewed, total }: Props) {
  const pct = total === 0 ? 0 : Math.round((reviewed / total) * 100);
  const currentView = useStore((s) => s.currentView);
  const setCurrentView = useStore((s) => s.setCurrentView);
  const clearFilters = useStore((s) => s.clearFilters);
  const isActive = currentView === 'all-transactions';

  return (
    <button
      type="button"
      onClick={() => {
        // Card reads as "look at the whole ledger" — any chip/date/account
        // filter would contradict that, so reset them before switching.
        clearFilters();
        setCurrentView('all-transactions');
      }}
      aria-pressed={isActive}
      aria-label="Open all transactions"
      className={`relative flex h-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${
        isActive
          ? 'border-accent bg-accent-soft/60'
          : 'border-ink-100 bg-paper-muted hover:border-ink-200 hover:bg-ink-50/60'
      }`}
    >
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"
        aria-hidden="true"
      >
        <ListChecks className="h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 flex-col leading-tight">
        <div className="text-[12px] font-medium text-ink-800">
          All transactions
        </div>
        <div className="tabular text-[11.5px] text-ink-500">
          <AnimatedNumber value={reviewed} /> of {total} reviewed
        </div>
        <div
          className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-ink-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={reviewed}
          aria-label={`${reviewed} of ${total} transactions reviewed`}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </button>
  );
}
