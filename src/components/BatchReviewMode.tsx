import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Keyboard,
  SkipForward,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { formatAmount, formatDateLong, formatDateShort } from '../lib/format';
import { ConfidenceDot } from './ConfidenceDot';
import { VatEntryBlock } from './VatEntryBlock';
import type { Transaction } from '../types';

export function BatchReviewMode() {
  const batch = useStore((s) => s.batch);
  const transactions = useStore((s) => s.transactions);
  const exitBatch = useStore((s) => s.exitBatch);
  const advanceBatch = useStore((s) => s.advanceBatch);
  const markNotVatEligible = useStore((s) => s.markNotVatEligible);
  const openReceiptModal = useStore((s) => s.openReceiptModal);
  const toggleFilter = useStore((s) => s.toggleFilter);
  const activeFilters = useStore((s) => s.activeFilters);
  const receiptModalOpen = useStore((s) => s.receiptModal.open);

  const currentId = batch.ids[batch.currentIndex];
  const currentTxn = useMemo(
    () => (currentId ? transactions.find((t) => t.id === currentId) : null) ?? null,
    [currentId, transactions],
  );

  const done = batch.currentIndex >= batch.ids.length;

  // Keyboard shortcuts
  useEffect(() => {
    if (!batch.active) return;
    function onKey(e: KeyboardEvent) {
      if (receiptModalOpen) return;
      const active = document.activeElement;
      const inInput =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);
      if (e.key === 'Escape') {
        e.preventDefault();
        exitBatch();
        return;
      }
      if (done) return;
      const key = e.key.toLowerCase();
      // The VAT amount input auto-focuses when each row loads, so a naive
      // "if in input, bail" guard swallows the batch-mode shortcuts
      // (S, U, N) entirely. Whitelist those three past the input guard so
      // the keyboard flow still works even when focus is on the input.
      const batchShortcut = key === 's' || key === 'u' || key === 'n';
      if (inInput && e.key !== 'Escape' && !batchShortcut) return;
      if (key === 's') {
        e.preventDefault();
        advanceBatch();
      } else if (key === 'u' && currentId) {
        e.preventDefault();
        openReceiptModal(currentId, 'batch');
      } else if (key === 'n' && currentId) {
        e.preventDefault();
        markNotVatEligible(currentId);
        advanceBatch();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    batch.active,
    done,
    currentId,
    exitBatch,
    advanceBatch,
    markNotVatEligible,
    openReceiptModal,
    receiptModalOpen,
  ]);

  if (!batch.active) return null;

  return (
    <div className="flex h-screen flex-col bg-paper-subtle text-ink-800">
      <BatchHeader />
      {done ? (
        <BatchCompletion
          onExit={exitBatch}
          onReviewRemaining={() => {
            exitBatch();
            window.setTimeout(() => {
              if (!activeFilters.has('missing-receipts'))
                toggleFilter('missing-receipts');
            }, 0);
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <BatchSidebar />
          <BatchDetail txn={currentTxn} />
        </div>
      )}
      {!done && <ShortcutsLegend />}
    </div>
  );
}

function BatchHeader() {
  const batch = useStore((s) => s.batch);
  const exitBatch = useStore((s) => s.exitBatch);

  const completed = batch.completedIds.size;
  const total = batch.ids.length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const displayIndex = Math.min(batch.currentIndex + 1, total);

  return (
    <header className="z-30 flex h-14 shrink-0 items-center border-b border-ink-100 bg-paper px-4 sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:min-w-[260px]">
        <button
          type="button"
          onClick={exitBatch}
          aria-label="Exit batch review"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-semibold text-ink-900">
            Reviewing VAT
          </div>
          {/* Keyboard hint: desktop only. Below sm the bar's escape
              route is the ✕ button — no physical keyboard to lean on. */}
          <div className="hidden text-[11.5px] text-ink-400 sm:block">
            Press Escape to exit
          </div>
          {/* Mobile: use the subline for position instead of the
              centered block below, which is hidden on small widths. */}
          <div className="tabular text-[11.5px] text-ink-400 sm:hidden">
            {displayIndex} of {total}
          </div>
        </div>
      </div>

      <div className="hidden flex-1 items-center justify-center sm:flex">
        <div className="tabular text-[13px] font-medium text-ink-700">
          Transaction {displayIndex} of {total}
        </div>
      </div>

      <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:min-w-[260px] sm:gap-3">
        <div className="hidden flex-col items-end leading-tight sm:flex">
          <span className="tabular text-[12px] font-medium text-ink-700">
            {completed} of {total} done
          </span>
          <span className="tabular text-[11px] text-ink-400">{pct}%</span>
        </div>
        <div
          className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100 sm:w-40"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
          aria-label={`${completed} of ${total} transactions completed in batch`}
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

function BatchSidebar() {
  const batch = useStore((s) => s.batch);
  const transactions = useStore((s) => s.transactions);
  const jumpBatchTo = useStore((s) => s.jumpBatchTo);

  const currentId = batch.ids[batch.currentIndex];
  const currentRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  return (
    <aside
      aria-label="Batch queue"
      className="hidden w-[220px] shrink-0 flex-col border-r border-ink-100 bg-paper sm:flex lg:w-[280px]"
    >
      <div className="shrink-0 border-b border-ink-100 px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
        Queue
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {batch.ids.map((id, i) => {
          const txn = transactions.find((t) => t.id === id);
          if (!txn) return null;
          const isDone = batch.completedIds.has(id);
          const isCurrent = id === currentId;
          return (
            <button
              key={id}
              ref={isCurrent ? currentRef : undefined}
              type="button"
              onClick={() => jumpBatchTo(i)}
              aria-current={isCurrent ? 'true' : undefined}
              className={`relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                isCurrent
                  ? 'bg-accent-soft'
                  : isDone
                  ? 'bg-paper hover:bg-ink-50/50'
                  : 'bg-paper hover:bg-ink-50/50'
              }`}
            >
              {isCurrent && (
                <span
                  className="absolute inset-y-0 left-0 w-0.5 bg-accent"
                  aria-hidden="true"
                />
              )}
              <StatusDot done={isDone} current={isCurrent} />
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-[13px] ${
                    isCurrent
                      ? 'font-semibold text-ink-900'
                      : isDone
                      ? 'font-medium text-ink-500'
                      : 'font-medium text-ink-800'
                  }`}
                >
                  {txn.merchant}
                </div>
                <div className="truncate text-[11.5px] text-ink-400">
                  {formatDateShort(txn.date)}
                </div>
              </div>
              <div
                className={`tabular shrink-0 text-[12.5px] ${
                  isDone ? 'text-ink-400 line-through' : 'text-ink-700'
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

function StatusDot({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-white"
        aria-label="Done"
      >
        <Check className="h-3 w-3" aria-hidden="true" />
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

function BatchDetail({ txn }: { txn: Transaction | null }) {
  const advanceBatch = useStore((s) => s.advanceBatch);

  if (!txn) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <p className="text-[13px] text-ink-400">No transaction loaded</p>
      </div>
    );
  }

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

        <div className="mt-3 flex items-center gap-3 text-[12.5px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <ConfidenceDot level={txn.categoryConfidence} />
            {txn.category}
          </span>
        </div>

        <div className="mt-8">
          <VatEntryBlock
            key={txn.id}
            txn={txn}
            variant="expanded"
            onSaved={() => advanceBatch()}
          />
        </div>

        <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-400">
          <button
            type="button"
            onClick={() => advanceBatch()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-ink-50 hover:text-ink-700"
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
            Skip this one (S)
          </button>
        </div>
      </div>
    </main>
  );
}

function BatchCompletion({
  onExit,
  onReviewRemaining,
}: {
  onExit: () => void;
  onReviewRemaining: () => void;
}) {
  const batch = useStore((s) => s.batch);
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
          All VAT sorted for this batch
        </h2>
        <p className="mt-2 text-[13.5px] text-ink-500">
          You added VAT to {batch.vatAddedCount} transaction
          {batch.vatAddedCount === 1 ? '' : 's'}.{' '}
          {formatAmount(batch.vatAddedTotal)} total VAT recorded.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center rounded-md border border-ink-100 bg-paper px-3.5 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
          >
            Back to review
          </button>
          <button
            type="button"
            onClick={onReviewRemaining}
            className="inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover"
          >
            Review remaining flags
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutsLegend() {
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
          aria-controls="batch-shortcuts"
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
            id="batch-shortcuts"
            className="space-y-1 border-t border-ink-100 px-3 py-2.5 text-[12px]"
          >
            <ShortcutRow keys={['Enter']} label="Save and advance" />
            <ShortcutRow keys={['S']} label="Skip to next" />
            <ShortcutRow keys={['U']} label="Upload receipt" />
            <ShortcutRow keys={['N']} label="Mark not VAT-eligible" />
            <ShortcutRow keys={['Esc']} label="Exit batch" />
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
