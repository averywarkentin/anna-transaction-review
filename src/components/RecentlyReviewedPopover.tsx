import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Check, Clock3 } from 'lucide-react';
import { useStore } from '../store';
import { formatAmount } from '../lib/format';

/**
 * Session-scoped "Recently reviewed" list. Lives in the detail panel
 * header and the batch header so the user can pop back to a just-marked
 * transaction without having to unwind filters or hunt for it.
 *
 * Context:
 * - Only rows reviewed this browser session appear (the store keeps a
 *   capped list, newest first). A cold reload clears it.
 * - On click the selection jumps to the target row. If the caller is
 *   currently in batch mode we preserve batch mode and jump within the
 *   batch queue when possible; otherwise we just setSelected.
 */
export function RecentlyReviewedPopover({
  source = 'detail',
}: {
  /** Which surface is hosting the popover (affects navigation rules). */
  source?: 'detail' | 'batch';
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const transactions = useStore((s) => s.transactions);
  const reviewedSession = useStore((s) => s.reviewedSession);
  const setSelected = useStore((s) => s.setSelected);
  const batch = useStore((s) => s.batch);
  const jumpBatchTo = useStore((s) => s.jumpBatchTo);
  const setCurrentView = useStore((s) => s.setCurrentView);
  const currentView = useStore((s) => s.currentView);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Resolve session ids → live transaction objects, skipping any the
  // user deleted or filtered off the ledger. Preserves the session order
  // (newest first) rather than any downstream sort.
  const entries = useMemo(() => {
    const byId = new Map(transactions.map((t) => [t.id, t] as const));
    return reviewedSession
      .map((e) => {
        const t = byId.get(e.id);
        return t ? { at: e.at, txn: t } : null;
      })
      .filter((x): x is { at: number; txn: (typeof transactions)[number] } =>
        Boolean(x),
      );
  }, [reviewedSession, transactions]);

  const handleSelect = (id: string) => {
    setOpen(false);
    if (source === 'batch' && batch.active) {
      const idx = batch.ids.indexOf(id);
      if (idx >= 0) {
        jumpBatchTo(idx);
        return;
      }
    }
    // Navigating from the detail panel always puts the user back on the
    // target row. If the current view is hiding reviewed items we need
    // to switch into "All transactions" first so the selection actually
    // lands on a visible row.
    if (currentView === 'to-review') {
      setCurrentView('all-transactions');
    }
    setSelected(id);
  };

  const handleViewAll = () => {
    setOpen(false);
    if (source === 'batch' && batch.active) {
      // Leave the batch to surface the "Reviewed" filter on the list.
      useStore.getState().exitBatch();
    }
    if (currentView !== 'all-transactions') {
      setCurrentView('all-transactions');
    }
    const s = useStore.getState();
    const next = new Set(s.activeFilters);
    next.add('reviewed');
    useStore.setState({ activeFilters: next });
  };

  const empty = entries.length === 0;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-100 bg-paper px-2 py-1 text-[12px] font-medium text-ink-600 hover:border-ink-200 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
      >
        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        Recently reviewed
        {entries.length > 0 && (
          <span className="tabular rounded-full bg-ink-100 px-1.5 text-[10.5px] font-semibold text-ink-600">
            {entries.length}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={popRef}
          role="menu"
          className="absolute right-0 z-40 mt-1 w-[320px] rounded-lg border border-ink-100 bg-paper shadow-panel"
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Recently reviewed
            </span>
            <span className="font-medium normal-case tracking-normal text-ink-400">
              this session
            </span>
          </div>
          {empty ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-ink-400">
              Nothing reviewed yet this session.
            </div>
          ) : (
            <ul className="max-h-[280px] overflow-y-auto scrollbar-thin py-1">
              {entries.map((e) => (
                <li key={e.txn.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(e.txn.id)}
                    className="group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-50 focus:outline-none focus-visible:bg-ink-50"
                  >
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink-800">
                        {e.txn.merchant}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-400">
                        {e.txn.category}
                      </div>
                    </div>
                    <div
                      className={`tabular shrink-0 text-[12.5px] font-semibold ${
                        e.txn.amount > 0 ? 'text-emerald-700' : 'text-ink-900'
                      }`}
                    >
                      {formatAmount(e.txn.amount, { signed: true })}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-ink-100 px-3 py-2">
            <button
              type="button"
              onClick={handleViewAll}
              className="w-full rounded-md px-2 py-1 text-left text-[12.5px] font-medium text-accent hover:bg-accent-soft focus:outline-none focus-visible:bg-accent-soft"
            >
              View all reviewed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
