import { memo, useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { Confidence, Transaction } from '../types';
import { formatAmount, formatDateShort } from '../lib/format';
import { useStore } from '../store';
import { ConfidenceDot } from './ConfidenceDot';
import { StatePill } from './StatePill';
import { ROW_GRID } from './TransactionList';

type Props = {
  txn: Transaction;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
};

/**
 * Dwell (ms) the soft green highlight sits solid after a
 * recategorisation before it starts fading out.
 */
const HIGHLIGHT_DWELL_MS = 1200;
/** Fade-out duration in ms. Must match the Tailwind `duration-*` below. */
const HIGHLIGHT_FADE_MS = 450;

function Row({ txn, selected, checked, onSelect, onToggleCheck }: Props) {
  const needsVat = txn.vatStatus === 'needs-vat';
  const missingReceipt = txn.receiptRequired && !txn.receiptAttached;
  const aiUnsure = txn.categoryConfidence === 'low';

  // Soft green "just changed" flash. Picks up the store entry written by
  // changeCategory, dwells ~1.2s, fades, then clears the entry so the
  // row returns to its baseline. Using store state means bulk
  // recategorisation elsewhere could trigger the same animation by
  // pushing entries.
  const entry = useStore((s) =>
    s.recentlyChangedIds.find((e) => e.id === txn.id),
  );
  const clearRecentlyChanged = useStore((s) => s.clearRecentlyChanged);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!entry) {
      setFading(false);
      return;
    }
    setFading(false);
    const t1 = window.setTimeout(() => setFading(true), HIGHLIGHT_DWELL_MS);
    const t2 = window.setTimeout(
      () => clearRecentlyChanged(txn.id),
      HIGHLIGHT_DWELL_MS + HIGHLIGHT_FADE_MS + 30,
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [entry?.at, txn.id, clearRecentlyChanged]);

  const highlight = Boolean(entry);
  const highlightClass = highlight
    ? `transition-colors duration-[450ms] ${
        fading ? '' : 'bg-emerald-50'
      }`
    : '';

  // StatePills shared between mobile and desktop renderings. Hoisted
  // out of the JSX so the two layouts can't drift.
  const flagPills = (
    <>
      {needsVat && <StatePill tone="warn">Needs VAT</StatePill>}
      {missingReceipt && <StatePill tone="warn">No receipt</StatePill>}
      {aiUnsure && <StatePill tone="warn">AI unsure</StatePill>}
      {txn.isPersonal && <StatePill tone="neutral">Personal</StatePill>}
      {txn.reviewed && (
        <StatePill
          tone="success"
          icon={<Check className="h-3 w-3" aria-hidden="true" />}
        >
          Reviewed
        </StatePill>
      )}
    </>
  );

  return (
    <>
      {/* Mobile card layout — up to sm. A full-width tappable card with
          merchant + amount on the first line, category + date on the
          second, and flag pills wrapping below. 44px min height via
          the generous vertical padding. Hidden on sm+. */}
      <div
        role="option"
        aria-selected={selected}
        data-txn-id={txn.id}
        onClick={onSelect}
        className={`relative flex cursor-pointer items-stretch gap-2 border-b border-ink-100 px-4 py-3 transition sm:hidden ${
          selected
            ? 'bg-accent-soft/70'
            : highlight
              ? highlightClass
              : 'bg-paper active:bg-ink-50'
        }`}
      >
        {selected && (
          <span
            className="absolute inset-y-0 left-0 w-0.5 bg-accent"
            aria-hidden="true"
          />
        )}
        {/* Per-card checkbox: mirrors the desktop grid's first column so
            mobile users can multi-select and, crucially, deselect
            individual rows once bulk mode is active. Tapping the checkbox
            doesn't open the detail panel. Target size kept comfortable
            for thumb use (44×44). */}
        <div
          className="flex shrink-0 items-center pr-1"
          onClick={(e) => e.stopPropagation()}
        >
          <label
            className="grid h-11 w-7 cursor-pointer place-items-center"
            aria-label={`Select ${txn.merchant} ${formatAmount(txn.amount)}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggleCheck}
              className="h-5 w-5 cursor-pointer rounded border-ink-200 text-accent focus:ring-accent-ring"
            />
          </label>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-900">
              {txn.merchant}
            </span>
            <span
              className={`tabular shrink-0 text-[15px] font-semibold ${
                txn.amount > 0 ? 'text-emerald-700' : 'text-ink-900'
              }`}
            >
              {formatAmount(txn.amount, { signed: true })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <CategoryLabel
              category={txn.category}
              confidence={txn.categoryConfidence}
              className="min-w-0 flex-1 text-[13px] text-ink-600"
            />
            <span className="tabular shrink-0 text-[12.5px] text-ink-400">
              {formatDateShort(txn.date)}
            </span>
          </div>
          {(needsVat ||
            missingReceipt ||
            aiUnsure ||
            txn.isPersonal ||
            txn.reviewed) && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {flagPills}
            </div>
          )}
        </div>
        {/* Affordance that the card opens a detail view. Sits centred
            on the right edge outside the content column so merchant /
            amount / category stay on their own baselines. */}
        <div
          className="flex shrink-0 items-center pl-1 text-ink-300"
          aria-hidden="true"
        >
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      {/* Desktop / tablet grid row — sm+. Keeps the existing six-column
          layout (checkbox, merchant, date, category, flags, amount). */}
      <div
        role="option"
        aria-selected={selected}
        data-txn-id={txn.id}
        onClick={onSelect}
        className={`group relative hidden cursor-pointer ${ROW_GRID} items-center gap-3 border-b border-ink-100 px-6 py-3 transition sm:grid ${
          selected
            ? 'bg-accent-soft/70'
            : highlight
              ? highlightClass
              : 'bg-paper hover:bg-ink-50/50'
        }`}
      >
        {selected && (
          <span
            className="absolute inset-y-0 left-0 w-0.5 bg-accent"
            aria-hidden="true"
          />
        )}

        <div
          className="flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            aria-label={`Select ${txn.merchant} ${formatAmount(txn.amount)}`}
            className="h-4 w-4 cursor-pointer rounded border-ink-200 text-accent focus:ring-accent-ring"
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink-900">
              {txn.merchant}
            </span>
          </div>
          <div className="truncate text-[12.5px] text-ink-400">
            {txn.description}
          </div>
        </div>

        <div className="tabular text-[12.5px] text-ink-500">
          {formatDateShort(txn.date)}
        </div>

        <CategoryLabel
          category={txn.category}
          confidence={txn.categoryConfidence}
          className="min-w-0 text-[12.5px] text-ink-700"
          gap="gap-2"
        />

        {/* Flags lay out horizontally for one or two pills, and
            flex-wrap kicks in once a third pill is present — the
            column width is tuned so two pills fit but three generally
            don't. Left-aligned so they sit under the "Flags" header at
            a consistent x. */}
        <div className="flex flex-wrap items-center justify-start gap-1">
          {flagPills}
        </div>

        <div
          className={`tabular text-right text-[13.5px] font-semibold ${
            txn.amount > 0 ? 'text-emerald-700' : 'text-ink-900'
          }`}
        >
          {formatAmount(txn.amount, { signed: true })}
        </div>
      </div>
    </>
  );
}

export const TransactionRow = memo(Row);

const CONFIDENCE_COPY: Record<Confidence, { title: string; body: string }> = {
  high: {
    title: 'High confidence',
    body: 'Set by a rule or confirmed by you.',
  },
  medium: {
    title: 'Medium confidence',
    body: "AI's best guess. Probably right, worth a glance.",
  },
  low: {
    title: 'Low confidence',
    body: "AI isn't sure. Please pick a category.",
  },
};

/**
 * Renders the confidence dot + category text as a single hover target.
 *
 * The in-line popover fires on pause over the whole label (dot *and*
 * text) rather than just the 8px coloured dot — users asked for this
 * because the dot alone is too small to reliably pause on. Keyboard
 * focus also opens it, and outside clicks / Escape close it.
 */
function CategoryLabel({
  category,
  confidence,
  className = '',
  gap = 'gap-1.5',
}: {
  category: string;
  confidence: Confidence;
  className?: string;
  gap?: string;
}) {
  const [open, setOpen] = useState(false);
  const copy = CONFIDENCE_COPY[confidence];

  return (
    <div
      className={`relative inline-flex items-center ${gap} ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      // Stop the tooltip opening from selecting the row — the dot + text
      // still carries the row's click via the ancestor onClick handler,
      // but a pause/hover shouldn't commit to anything.
      onClick={(e) => {
        // Let the row click through; we only guard against the tooltip
        // body being clicked by the popover below.
        void e;
      }}
    >
      <ConfidenceDot level={confidence} />
      <span
        tabIndex={0}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={open ? `conf-${confidence}-tip` : undefined}
        className="truncate outline-none focus-visible:underline"
      >
        {category}
      </span>
      {open && (
        <div
          id={`conf-${confidence}-tip`}
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 w-[240px] rounded-lg border border-ink-100 bg-paper p-2.5 text-[12.5px] font-normal normal-case tracking-normal text-ink-700 shadow-panel"
        >
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-900">
            <ConfidenceDot level={confidence} />
            {copy.title}
          </div>
          <p className="mt-1 leading-snug text-ink-600">{copy.body}</p>
        </div>
      )}
    </div>
  );
}
