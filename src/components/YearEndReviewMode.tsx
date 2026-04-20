import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Home,
  Keyboard,
  SkipForward,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { YearEndDecision } from '../store';
import { formatAmount, formatDateLong, formatDateShort } from '../lib/format';
import type { Transaction } from '../types';

/**
 * Year-end corporation tax review: a focused queue mirroring the batch VAT
 * shape, but each item takes an explicit personal/business/skip decision.
 * Crucially NO auto-advance: the user chooses, then presses "Mark reviewed
 * and next" (or Enter) to move on. This keeps the user feeling in control
 * rather than railroaded through their own books.
 */
export function YearEndReviewMode() {
  const yearEnd = useStore((s) => s.yearEnd);
  const transactions = useStore((s) => s.transactions);
  const exitYearEnd = useStore((s) => s.exitYearEnd);
  const yearEndAdvance = useStore((s) => s.yearEndAdvance);
  const yearEndDecide = useStore((s) => s.yearEndDecide);

  const currentId = yearEnd.ids[yearEnd.currentIndex];
  const currentTxn = useMemo(
    () =>
      (currentId ? transactions.find((t) => t.id === currentId) : null) ?? null,
    [currentId, transactions],
  );

  const done = yearEnd.currentIndex >= yearEnd.ids.length;

  useEffect(() => {
    if (!yearEnd.active) return;
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      const inInput =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);
      if (e.key === 'Escape') {
        e.preventDefault();
        exitYearEnd();
        return;
      }
      if (done) return;
      if (inInput && e.key !== 'Enter') return;
      const key = e.key.toLowerCase();
      if (!currentId) return;
      if (key === 'p') {
        e.preventDefault();
        yearEndDecide(currentId, 'personal');
      } else if (key === 'b') {
        e.preventDefault();
        yearEndDecide(currentId, 'business');
      } else if (key === 's') {
        e.preventDefault();
        yearEndDecide(currentId, 'skip');
        yearEndAdvance();
      } else if (e.key === 'Enter' && !inInput) {
        e.preventDefault();
        // Enter = confirm current decision and advance. If no decision has
        // been taken yet, default to 'personal' — it's already flagged as
        // personal, so Enter = "yes, that was right".
        if (!yearEnd.decisions.has(currentId)) {
          yearEndDecide(currentId, 'personal');
        }
        yearEndAdvance();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        yearEndAdvance();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    yearEnd.active,
    yearEnd.decisions,
    done,
    currentId,
    exitYearEnd,
    yearEndAdvance,
    yearEndDecide,
  ]);

  if (!yearEnd.active) return null;

  return (
    <div className="flex h-screen flex-col bg-paper-subtle text-ink-800">
      <YearEndHeader />
      {done ? (
        <YearEndCompletion onExit={exitYearEnd} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <YearEndSidebar />
          <YearEndDetail txn={currentTxn} />
        </div>
      )}
      {!done && <YearEndShortcuts />}
    </div>
  );
}

function YearEndHeader() {
  const yearEnd = useStore((s) => s.yearEnd);
  const exitYearEnd = useStore((s) => s.exitYearEnd);

  const decided = yearEnd.decisions.size;
  const total = yearEnd.ids.length;
  const pct = total === 0 ? 0 : Math.round((decided / total) * 100);
  const displayIndex = Math.min(yearEnd.currentIndex + 1, total);

  return (
    <header className="z-30 flex h-14 shrink-0 items-center border-b border-ink-100 bg-paper px-4 sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:min-w-[260px]">
        <button
          type="button"
          onClick={exitYearEnd}
          aria-label="Exit year-end review"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-semibold text-ink-900">
            Year-end review
          </div>
          <div className="hidden text-[11.5px] text-ink-400 sm:block">
            Press Escape to exit
          </div>
          <div className="tabular text-[11.5px] text-ink-400 sm:hidden">
            {displayIndex} of {total}
          </div>
        </div>
      </div>

      <div className="hidden flex-1 items-center justify-center sm:flex">
        <div className="tabular text-[13px] font-medium text-ink-700">
          Item {displayIndex} of {total}
        </div>
      </div>

      <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:min-w-[260px] sm:gap-3">
        <div className="hidden flex-col items-end leading-tight sm:flex">
          <span className="tabular text-[12px] font-medium text-ink-700">
            {decided} of {total} reviewed
          </span>
          <span className="tabular text-[11px] text-ink-400">{pct}%</span>
        </div>
        <div
          className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100 sm:w-40"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={decided}
          aria-label={`${decided} of ${total} items reviewed`}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </header>
  );
}

function YearEndSidebar() {
  const yearEnd = useStore((s) => s.yearEnd);
  const transactions = useStore((s) => s.transactions);
  const yearEndJumpTo = useStore((s) => s.yearEndJumpTo);

  const currentId = yearEnd.ids[yearEnd.currentIndex];
  const currentRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  return (
    <aside
      aria-label="Year-end queue"
      className="hidden w-[220px] shrink-0 flex-col border-r border-ink-100 bg-paper sm:flex lg:w-[280px]"
    >
      <div className="shrink-0 border-b border-ink-100 px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
        Queue
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {yearEnd.ids.map((id, i) => {
          const txn = transactions.find((t) => t.id === id);
          if (!txn) return null;
          const decision = yearEnd.decisions.get(id);
          const isCurrent = id === currentId;
          const movedToBusiness = yearEnd.movedToBusiness.has(id);
          return (
            <button
              key={id}
              ref={isCurrent ? currentRef : undefined}
              type="button"
              onClick={() => yearEndJumpTo(i)}
              aria-current={isCurrent ? 'true' : undefined}
              className={`relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                isCurrent ? 'bg-accent-soft' : 'bg-paper hover:bg-ink-50/50'
              }`}
            >
              {isCurrent && (
                <span
                  className="absolute inset-y-0 left-0 w-0.5 bg-accent"
                  aria-hidden="true"
                />
              )}
              <QueueDot decision={decision} current={isCurrent} />
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-[13px] ${
                    isCurrent
                      ? 'font-semibold text-ink-900'
                      : decision
                      ? 'font-medium text-ink-500'
                      : 'font-medium text-ink-800'
                  }`}
                >
                  {txn.merchant}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[11.5px] text-ink-400">
                    {formatDateShort(txn.date)}
                  </span>
                  {movedToBusiness && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full bg-ink-100 px-1.5 py-px text-[10.5px] font-medium text-ink-600"
                      title="Moved back to business this session"
                    >
                      <ArrowLeftRight
                        className="h-2.5 w-2.5"
                        aria-hidden="true"
                      />
                      business
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`tabular shrink-0 text-[12.5px] ${
                  decision ? 'text-ink-400' : 'text-ink-700'
                }`}
              >
                {formatAmount(txn.amount, { signed: true })}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function QueueDot({
  decision,
  current,
}: {
  decision: YearEndDecision | undefined;
  current: boolean;
}) {
  if (decision === 'personal') {
    return (
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-white"
        aria-label="Confirmed personal"
      >
        <Check className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  if (decision === 'business') {
    return (
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-600"
        aria-label="Moved to business"
      >
        <Briefcase className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  if (decision === 'skip') {
    return (
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-ink-200 bg-paper text-ink-400"
        aria-label="Skipped"
      >
        <SkipForward className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  if (current) {
    return (
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
        aria-label="Current"
      />
    );
  }
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full border border-ink-200 bg-paper"
      aria-label="Pending"
    />
  );
}

function YearEndDetail({ txn }: { txn: Transaction | null }) {
  const yearEnd = useStore((s) => s.yearEnd);
  const yearEndDecide = useStore((s) => s.yearEndDecide);
  const yearEndAdvance = useStore((s) => s.yearEndAdvance);
  const setPersonalReason = useStore((s) => s.setPersonalReason);

  const existingReason = txn?.personalExpenseNote?.reason ?? '';
  const [reasonDraft, setReasonDraft] = useState(existingReason);

  useEffect(() => {
    setReasonDraft(existingReason);
  }, [txn?.id, existingReason]);

  if (!txn) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <p className="text-[13px] text-ink-400">No item loaded</p>
      </div>
    );
  }

  const decision = yearEnd.decisions.get(txn.id);

  const handleReasonBlur = () => {
    if (reasonDraft !== existingReason) {
      setPersonalReason(txn.id, reasonDraft);
    }
  };

  const advance = () => {
    // Commit the typed reason before leaving.
    if (reasonDraft !== existingReason) {
      setPersonalReason(txn.id, reasonDraft);
    }
    if (!yearEnd.decisions.has(txn.id)) {
      // No button pressed; treat Enter as "yes, personal was right".
      yearEndDecide(txn.id, 'personal');
    }
    yearEndAdvance();
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[640px] px-10 py-10">
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
          {txn.account}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-semibold leading-tight text-ink-900">
              {txn.merchant}
            </h1>
            <p className="mt-1 text-[13px] text-ink-400">
              {formatDateLong(txn.date)} · {txn.description}
            </p>
          </div>
          <div
            className={`tabular shrink-0 text-[28px] font-semibold leading-tight ${
              txn.amount > 0 ? 'text-emerald-700' : 'text-ink-900'
            }`}
          >
            {formatAmount(txn.amount, { signed: true })}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-ink-100 bg-paper-muted px-4 py-3">
          <div className="text-[12px] font-medium uppercase tracking-wide text-ink-400">
            Currently
          </div>
          <div className="mt-1 text-[14px] font-medium text-ink-800">
            Flagged as personal
          </div>
          {existingReason && (
            <div className="mt-1 text-[12.5px] text-ink-500">
              "{existingReason}"
            </div>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-[14px] font-semibold text-ink-900">
            Is this a personal expense?
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Personal items are excluded from corporation tax. Moving something
            back to business doesn't lose any history.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <DecisionButton
              label="Yes, personal"
              description="Keep as personal"
              hotkey="P"
              selected={decision === 'personal'}
              onClick={() => yearEndDecide(txn.id, 'personal')}
              icon={<Home className="h-4 w-4" aria-hidden="true" />}
              tone="accent"
            />
            <DecisionButton
              label="No, business"
              description="Move back to business"
              hotkey="B"
              selected={decision === 'business'}
              onClick={() => yearEndDecide(txn.id, 'business')}
              icon={<Briefcase className="h-4 w-4" aria-hidden="true" />}
              tone="neutral"
            />
            <DecisionButton
              label="Skip"
              description="Come back later"
              hotkey="S"
              selected={decision === 'skip'}
              onClick={() => {
                yearEndDecide(txn.id, 'skip');
                yearEndAdvance();
              }}
              icon={<SkipForward className="h-4 w-4" aria-hidden="true" />}
              tone="neutral"
            />
          </div>
        </div>

        {decision !== 'business' && decision !== 'skip' && (
          <div className="mt-6">
            <label className="block">
              <span className="block text-[12px] text-ink-500">
                Reason (optional)
              </span>
              <input
                type="text"
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                onBlur={handleReasonBlur}
                placeholder="e.g. weekend Uber, not client"
                className="mt-1 block w-full rounded-md border border-ink-200 bg-paper px-2.5 py-1.5 text-[13px] text-ink-800 placeholder:text-ink-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
              />
              <span className="mt-1 block text-[11.5px] text-ink-400">
                Helps if an accountant asks later.
              </span>
            </label>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-2">
          <p className="text-[11.5px] text-ink-400">
            Your decision is saved as soon as you choose.
          </p>
          <button
            type="button"
            onClick={advance}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
          >
            Mark reviewed and next
            <kbd className="rounded bg-white/20 px-1 py-0.5 text-[10.5px]">
              Enter
            </kbd>
          </button>
        </div>
      </div>
    </main>
  );
}

function DecisionButton({
  label,
  description,
  hotkey,
  selected,
  onClick,
  icon,
  tone,
}: {
  label: string;
  description: string;
  hotkey: string;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tone: 'accent' | 'neutral';
}) {
  const base =
    'flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2';
  const selectedCls =
    tone === 'accent'
      ? 'border-accent bg-accent-soft text-accent shadow-sm'
      : 'border-ink-300 bg-ink-50 text-ink-900 shadow-sm';
  const idle =
    'border-ink-100 bg-paper text-ink-700 hover:border-ink-200 hover:bg-ink-50';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${base} ${selected ? selectedCls : idle}`}
    >
      <div className="flex items-center justify-between w-full gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          {icon}
          {label}
        </span>
        <kbd className="rounded bg-ink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600 ring-1 ring-inset ring-ink-100">
          {hotkey}
        </kbd>
      </div>
      <span className="text-[11.5px] text-ink-500">{description}</span>
    </button>
  );
}

function YearEndCompletion({ onExit }: { onExit: () => void }) {
  const yearEnd = useStore((s) => s.yearEnd);

  const counts = useMemo(() => {
    let personal = 0;
    let business = 0;
    let skipped = 0;
    for (const [, d] of yearEnd.decisions) {
      if (d === 'personal') personal++;
      else if (d === 'business') business++;
      else skipped++;
    }
    return { personal, business, skipped };
  }, [yearEnd.decisions]);

  const anyDecisions = counts.personal + counts.business + counts.skipped > 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8">
      <div className="w-full max-w-[520px] rounded-2xl border border-ink-100 bg-paper p-10 text-center shadow-panel">
        <div
          className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <Check className="h-5 w-5" />
        </div>
        <h2 className="mt-5 text-[20px] font-semibold text-ink-900">
          {anyDecisions
            ? 'Year-end review complete'
            : "Nothing left to review"}
        </h2>
        <p className="mt-2 text-[13.5px] text-ink-500">
          {anyDecisions ? (
            <>
              {counts.personal > 0 && (
                <>
                  {counts.personal} kept as personal
                  {counts.business + counts.skipped > 0 && ', '}
                </>
              )}
              {counts.business > 0 && (
                <>
                  {counts.business} moved back to business
                  {counts.skipped > 0 && ', '}
                </>
              )}
              {counts.skipped > 0 && <>{counts.skipped} skipped for now</>}.
            </>
          ) : (
            <>All personal items were already reviewed.</>
          )}
        </p>
        <p className="mt-3 text-[12.5px] text-ink-400">
          Every change is in the audit trail. You can revisit any transaction
          from the main list.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover"
          >
            Back to review
          </button>
        </div>
      </div>
    </div>
  );
}

function YearEndShortcuts() {
  const [open, setOpen] = useState(true);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-20 hidden sm:block">
      <div
        className={`pointer-events-auto rounded-xl border border-ink-100 bg-paper/95 shadow-panel backdrop-blur transition-all ${
          open ? 'w-[260px]' : 'w-auto'
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
          aria-expanded={open}
          aria-controls="year-end-shortcuts"
        >
          <span className="inline-flex items-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            Keyboard shortcuts
          </span>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
          )}
        </button>
        {open && (
          <div
            id="year-end-shortcuts"
            className="space-y-1 border-t border-ink-100 px-3 py-2.5 text-[12px]"
          >
            <ShortcutRow keys={['P']} label="Yes, personal" />
            <ShortcutRow keys={['B']} label="No, business" />
            <ShortcutRow keys={['S']} label="Skip" />
            <ShortcutRow keys={['Enter']} label="Confirm and next" />
            <ShortcutRow keys={['Esc']} label="Exit review" />
            <p className="mt-1 flex items-center gap-1 text-[10.5px] text-ink-400">
              <CircleDashed className="h-3 w-3" aria-hidden="true" />
              Shortcuts pause while you type
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-600">{label}</span>
      <div className="flex items-center gap-0.5">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded bg-ink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600 ring-1 ring-inset ring-ink-100"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
