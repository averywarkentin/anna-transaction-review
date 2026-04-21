import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  Receipt,
  Undo2,
  Upload,
} from 'lucide-react';
import { useStore } from '../store';
import { formatAmount, formatDateLong, formatUploadedAt } from '../lib/format';
import { useIsMobile } from '../hooks/useBreakpoint';
import {
  computeVisibleTransactions,
  useVisibleTransactions,
} from '../hooks/useVisibleTransactions';
import { CategoryBlock } from './CategoryBlock';
import { VatEntryBlock } from './VatEntryBlock';
import { AuditTrailPopover } from './AuditTrailPopover';
import { ReceiptLightbox } from './ReceiptLightbox';
import { ReceiptRequiredModal } from './ReceiptRequiredModal';
import type { Transaction } from '../types';

export function DetailPanel() {
  const transactions = useStore((s) => s.transactions);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const openReceiptModal = useStore((s) => s.openReceiptModal);
  const isMobile = useIsMobile();
  const visible = useVisibleTransactions();

  // Short-lived inline confirmation after "Mark as reviewed" on mobile.
  // Held for ~600ms, then we auto-advance (or show the caught-up state).
  const [confirming, setConfirming] = useState(false);
  // When we run out of unreviewed items post-advance, we swap the whole
  // panel for a dedicated "All caught up" screen with a back-to-list CTA.
  const [caughtUp, setCaughtUp] = useState(false);
  // Shown when the user hits "Mark as reviewed" on a receipt-required
  // transaction that has no receipt attached. Gates the commit until
  // they explicitly upload or override.
  const [receiptGateOpen, setReceiptGateOpen] = useState(false);

  // Any change to the current selection (navigation via prev/next, tapping
  // a different row on desktop, etc.) cancels a pending caught-up screen
  // so it can't linger across unrelated interactions.
  useEffect(() => {
    setCaughtUp(false);
    setConfirming(false);
  }, [selectedId]);

  const txn = selectedId
    ? transactions.find((t) => t.id === selectedId) ?? null
    : null;

  if (caughtUp) {
    return (
      <AllCaughtUpState
        onBack={() => {
          setCaughtUp(false);
          setSelected(null);
        }}
      />
    );
  }

  if (!txn) {
    return (
      <aside
        aria-label="Transaction details"
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-paper"
      >
        <Inbox className="h-6 w-6 text-ink-300" aria-hidden="true" />
        <p className="text-[13px] text-ink-400">
          Select a transaction to review it
        </p>
      </aside>
    );
  }

  // Auto-advance policy.
  //
  // Mobile + "Mark as reviewed" is the trigger we care about. The brief
  // is explicit: don't auto-advance on "Unmark as reviewed" (the user is
  // correcting a mistake and wants to stay put), and don't auto-advance
  // on desktop at all (the list is visible beside the detail, so the
  // user can pick the next item themselves).
  //
  // We look up the next target from the *fresh* store state inside the
  // timeout — the toggle we just dispatched has landed by then, and a
  // to-review view will have dropped this txn out of `visible`. The
  // prior `visible` snapshot (captured above) tells us where to resume
  // from: the same index in the refreshed list is the next item if our
  // txn is gone, or priorIdx+1 if it's still there (all-transactions
  // view). We skip any already-reviewed items after that so users never
  // land back on something they don't need to review.
  /**
   * Commit the "reviewed" state change and trigger mobile auto-advance.
   * Split out of `handlePrimaryAction` so the receipt-required gate can
   * fall through here after the user explicitly picks "Mark as reviewed
   * anyway" without duplicating the advance logic.
   */
  const commitReviewed = (withoutReceipt: boolean) => {
    const wasReviewed = txn.reviewed;
    if (withoutReceipt) {
      useStore.getState().markReviewedWithoutReceipt([txn.id]);
    } else {
      useStore.getState().toggleReviewed(txn.id);
    }
    if (!isMobile || wasReviewed) return;

    setConfirming(true);
    const priorIdx = visible.findIndex((t) => t.id === txn.id);

    window.setTimeout(() => {
      setConfirming(false);

      const state = useStore.getState();
      const fresh = computeVisibleTransactions({
        transactions: state.transactions,
        activeFilters: state.activeFilters,
        dateRange: state.dateRange,
        customDateRange: state.customDateRange,
        accountFilter: state.accountFilter,
        personalTaxYear: state.personalTaxYear,
        currentView: state.currentView,
      });

      if (fresh.length === 0) {
        setCaughtUp(true);
        return;
      }

      const stillPresent = fresh.some((t) => t.id === txn.id);
      let cursor = stillPresent ? priorIdx + 1 : priorIdx;
      while (cursor < fresh.length && fresh[cursor]!.reviewed) cursor++;

      if (cursor >= fresh.length) {
        setCaughtUp(true);
        return;
      }
      setSelected(fresh[cursor]!.id);
    }, 600);
  };

  const handlePrimaryAction = () => {
    // Unmarking ("Unmark as reviewed") never needs the receipt gate.
    if (!txn.reviewed && txn.receiptRequired && !txn.receiptAttached) {
      setReceiptGateOpen(true);
      return;
    }
    commitReviewed(false);
  };

  return (
    <aside
      aria-label={`Details for ${txn.merchant}`}
      className="flex h-full w-full flex-col bg-paper"
    >
      <DetailHeader txn={txn} />

      <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        <CategoryBlock txn={txn} />
        <VatEntryBlock txn={txn} />
        <ReceiptBlock txn={txn} />
        <PersonalBlock txn={txn} />
      </div>

      <DetailFooter
        txn={txn}
        confirming={confirming}
        onPrimary={handlePrimaryAction}
      />
      <ReceiptRequiredModal
        open={receiptGateOpen}
        total={1}
        missingCount={1}
        merchant={txn.merchant}
        onUploadReceipt={() => {
          setReceiptGateOpen(false);
          openReceiptModal(txn.id, 'detail');
        }}
        onMarkAnyway={() => {
          setReceiptGateOpen(false);
          commitReviewed(true);
        }}
        onCancel={() => setReceiptGateOpen(false)}
      />
    </aside>
  );
}

/**
 * Shown on mobile after "Mark as reviewed" clears the last unreviewed
 * transaction in the current filtered list. The CTA takes the user back
 * to the (now empty, in to-review mode) list so they can pick another
 * view or filter.
 */
function AllCaughtUpState({ onBack }: { onBack: () => void }) {
  return (
    <aside
      aria-label="All caught up"
      className="flex h-full w-full flex-col bg-paper"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[20px] font-semibold text-ink-900">
            All caught up
          </h2>
          <p className="text-[14px] text-ink-500">
            You've reviewed every transaction in this list.
          </p>
        </div>
      </div>
      <div className="border-t border-ink-100 bg-paper px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6 sm:py-4 sm:pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-3 text-[14px] font-semibold text-white shadow-sm hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 sm:py-2 sm:text-[13px]"
        >
          Back to list
        </button>
      </div>
    </aside>
  );
}

function DetailHeader({ txn }: { txn: Transaction }) {
  const setSelected = useStore((s) => s.setSelected);
  const visible = useVisibleTransactions();

  // Derive prev/next from the same filtered+sorted list the user sees on
  // the list screen. Index can be -1 if the selection has just filtered
  // out; in that edge case we hide the counter rather than show "0 of N".
  const idx = visible.findIndex((t) => t.id === txn.id);
  const total = visible.length;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < total - 1;
  const goPrev = () => {
    if (hasPrev) setSelected(visible[idx - 1]!.id);
  };
  const goNext = () => {
    if (hasNext) setSelected(visible[idx + 1]!.id);
  };

  return (
    <div className="border-b border-ink-100 px-4 py-3 sm:px-6 sm:py-4">
      {/* Mobile-only navigation row.
          Layout: Back (left) · "N of Y" (centre) · Prev/Next (right).
          Back is a 44×44 icon target separate from prev/next so it reads
          as "leave this view", not "step one transaction". On desktop
          and tablet the list is visible beside the detail, so none of
          this chrome is needed — the row is hidden above sm. */}
      <div className="-mx-2 mb-2 flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setSelected(null)}
          aria-label="Back to transactions"
          className="grid h-11 w-11 place-items-center rounded-md text-ink-700 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div
          className="text-[12.5px] font-medium tabular-nums text-ink-500"
          aria-live="polite"
        >
          {idx >= 0 && total > 0 ? `${idx + 1} of ${total}` : ''}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goPrev}
            disabled={!hasPrev}
            aria-label="Previous transaction"
            className="grid h-11 w-11 place-items-center rounded-md text-ink-700 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!hasNext}
            aria-label="Next transaction"
            className="grid h-11 w-11 place-items-center rounded-md text-ink-700 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-semibold leading-tight text-ink-900 sm:text-[20px]">
            {txn.merchant}
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-400">
            {formatDateLong(txn.date)} · {txn.account}
          </p>
        </div>
        <div
          className={`tabular text-[20px] font-semibold leading-tight sm:text-[22px] ${
            txn.amount > 0 ? 'text-emerald-700' : 'text-ink-900'
          }`}
        >
          {formatAmount(txn.amount, { signed: true })}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink-500">
          {txn.description || '\u00A0'}
        </p>
        <AuditTrailPopover txn={txn} />
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
      {children}
    </h3>
  );
}

function ReceiptBlock({ txn }: { txn: Transaction }) {
  const openReceiptModal = useStore((s) => s.openReceiptModal);
  const removeReceipt = useStore((s) => s.removeReceipt);
  const undoRemoveReceipt = useStore((s) => s.undoRemoveReceipt);
  const dismissReceiptUndo = useStore((s) => s.dismissReceiptUndo);
  const receiptUndo = useStore((s) => s.receiptUndo);

  const thumbRef = useRef<HTMLButtonElement | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Tick 300ms so the "Undo" affordance visibly expires at 8s.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (
      !receiptUndo ||
      receiptUndo.txnId !== txn.id ||
      receiptUndo.expiresAt <= Date.now()
    ) {
      return;
    }
    const remaining = Math.max(0, receiptUndo.expiresAt - Date.now());
    const t1 = window.setTimeout(() => dismissReceiptUndo(), remaining);
    const t2 = window.setInterval(
      () => forceTick((n) => (n + 1) % 1_000_000),
      300,
    );
    return () => {
      window.clearTimeout(t1);
      window.clearInterval(t2);
    };
  }, [
    receiptUndo?.id,
    receiptUndo?.txnId,
    receiptUndo?.expiresAt,
    txn.id,
    dismissReceiptUndo,
  ]);

  const undoActive =
    !!receiptUndo &&
    receiptUndo.txnId === txn.id &&
    receiptUndo.expiresAt > Date.now();

  // Nothing to render if no receipt, none required, and no undo pending.
  if (!txn.receiptRequired && !txn.receiptAttached && !undoActive) return null;

  const isImage =
    txn.receiptMimeType === 'image/jpeg' || txn.receiptMimeType === 'image/png';
  const isPdf = txn.receiptMimeType === 'application/pdf';
  const canLightbox = isImage && !!txn.receiptDataUrl;

  return (
    <section className="space-y-2.5">
      <SectionHeading>Receipt</SectionHeading>

      {txn.receiptAttached ? (
        <div className="space-y-2">
          {canLightbox ? (
            <button
              ref={thumbRef}
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Receipt for ${txn.merchant} from ${formatDateLong(
                txn.date,
              )} — click to view at larger size`}
              className="group block overflow-hidden rounded-lg border border-ink-100 bg-paper-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
            >
              <img
                src={txn.receiptDataUrl}
                alt={`Receipt for ${txn.merchant} from ${formatDateLong(txn.date)}`}
                className="block h-[120px] w-auto object-contain transition group-hover:opacity-90"
              />
            </button>
          ) : (
            <div
              className="flex h-[120px] w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-ink-100 bg-paper-muted text-ink-400"
              aria-label={
                isPdf
                  ? `PDF receipt: ${txn.receiptFilename ?? 'receipt.pdf'}`
                  : 'Receipt attached'
              }
            >
              <FileText className="h-7 w-7" aria-hidden="true" />
              <span className="text-[10.5px] font-medium uppercase tracking-wide">
                {isPdf ? 'PDF' : 'File'}
              </span>
            </div>
          )}

          <div className="text-[11.5px] text-ink-500">
            <span className="font-medium text-ink-700">
              {txn.receiptFilename ?? 'receipt'}
            </span>
            {txn.receiptUploadedAt && (
              <>, uploaded {formatUploadedAt(txn.receiptUploadedAt)}</>
            )}
          </div>

          <div className="flex items-center gap-3 text-[12.5px]">
            <button
              type="button"
              onClick={() =>
                openReceiptModal(txn.id, 'detail', { replace: true })
              }
              className="font-medium text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline focus:outline-none focus-visible:text-ink-800 focus-visible:underline"
            >
              Replace
            </button>
            <span className="h-3 w-px bg-ink-100" aria-hidden="true" />
            <button
              type="button"
              onClick={() => removeReceipt(txn.id)}
              className="font-medium text-ink-500 underline-offset-2 hover:text-red-700 hover:underline focus:outline-none focus-visible:text-red-700 focus-visible:underline"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <ReceiptDropZone
          onOpenPicker={() => openReceiptModal(txn.id, 'detail')}
          onDropFile={(file) =>
            openReceiptModal(txn.id, 'detail', { pendingFile: file })
          }
        />
      )}

      {txn.receiptRequired && !txn.receiptAttached && !undoActive && (
        <p className="flex items-center gap-1.5 text-[12px] text-amber-700">
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
          Receipt required for HMRC
          {txn.reviewedWithoutReceipt && (
            <span className="ml-1 text-ink-500">
              · marked reviewed without receipt
            </span>
          )}
        </p>
      )}

      {undoActive && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-md bg-ink-50 px-2.5 py-1.5 text-[12px] text-ink-600"
        >
          <span className="truncate">{receiptUndo!.message}</span>
          <button
            type="button"
            onClick={undoRemoveReceipt}
            className="inline-flex shrink-0 items-center gap-1 rounded text-[12px] font-medium text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-1"
          >
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            Undo
          </button>
        </div>
      )}

      {lightboxOpen && canLightbox && (
        <ReceiptLightbox
          src={txn.receiptDataUrl!}
          alt={`Receipt for ${txn.merchant} from ${formatDateLong(txn.date)}`}
          caption={`${txn.receiptFilename ?? 'receipt'}${
            txn.receiptUploadedAt
              ? ` · uploaded ${formatUploadedAt(txn.receiptUploadedAt)}`
              : ''
          }`}
          onClose={() => setLightboxOpen(false)}
          returnFocusTo={thumbRef.current}
        />
      )}
    </section>
  );
}

/**
 * Inline receipt drop zone with direct drag-and-drop support. Dropping a
 * file hands it straight to the upload modal via `pendingFile`, skipping
 * the dropzone stage. Clicking opens the modal empty. Invalid file types
 * surface a 4s inline error and do not open the modal.
 */
function ReceiptDropZone({
  onOpenPicker,
  onDropFile,
}: {
  onOpenPicker: () => void;
  onDropFile: (file: File) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  const showError = (msg: string) => {
    setError(msg);
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setError(null), 4000);
  };

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  const isValid = (file: File) => {
    const t = file.type;
    if (t === 'image/jpeg' || t === 'image/png' || t === 'application/pdf')
      return true;
    const lower = file.name.toLowerCase();
    return (
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.pdf')
    );
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onOpenPicker}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          // Only clear when leaving the button itself, not a child.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (!file) return;
          if (!isValid(file)) {
            showError('Unsupported file type. Use JPG, PNG, or PDF.');
            return;
          }
          onDropFile(file);
        }}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition ${
          isDragging
            ? 'border-accent bg-accent-soft'
            : 'border-ink-200 bg-paper-muted hover:border-ink-300 hover:bg-ink-50'
        }`}
      >
        <Upload
          className={`h-5 w-5 ${isDragging ? 'text-accent' : 'text-ink-400'}`}
          aria-hidden="true"
        />
        <span>
          <span className="block text-[13px] font-medium text-ink-700">
            {isDragging ? 'Drop to upload' : 'Drop a receipt here'}
          </span>
          <span className="block text-[12px] text-ink-400">
            or click to upload · PDF, JPG, PNG
          </span>
        </span>
      </button>
      {error && (
        <p
          role="alert"
          className="text-[12px] text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function PersonalBlock({ txn }: { txn: Transaction }) {
  const markPersonal = useStore((s) => s.markPersonal);
  const markBusiness = useStore((s) => s.markBusiness);
  const setPersonalReason = useStore((s) => s.setPersonalReason);
  const setReviewedForCorpTax = useStore((s) => s.setReviewedForCorpTax);

  const existingReason = txn.personalExpenseNote?.reason ?? '';
  const [reasonDraft, setReasonDraft] = useState(existingReason);

  // Re-sync reason draft when switching transactions or when another
  // code path (year-end decision) rewrites the note.
  useEffect(() => {
    setReasonDraft(existingReason);
  }, [txn.id, existingReason]);

  const reviewed = txn.personalExpenseNote?.reviewedForCorpTax ?? false;

  const handleSelect = (next: 'business' | 'personal') => {
    if (next === 'personal' && !txn.isPersonal) markPersonal(txn.id);
    else if (next === 'business' && txn.isPersonal) markBusiness(txn.id);
  };

  const handleReasonBlur = () => {
    if (reasonDraft !== existingReason) {
      setPersonalReason(txn.id, reasonDraft);
    }
  };

  const selected: 'business' | 'personal' = txn.isPersonal ? 'personal' : 'business';

  return (
    <section className="space-y-2.5">
      <SectionHeading>Expense type</SectionHeading>
      <div
        role="radiogroup"
        aria-label="Expense type"
        className="inline-flex items-center rounded-md border border-ink-100 bg-paper-muted p-0.5"
      >
        {(['business', 'personal'] as const).map((opt) => {
          const active = selected === opt;
          const label = opt === 'business' ? 'Business' : 'Personal';
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleSelect(opt)}
              className={`min-w-[84px] rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition ${
                active
                  ? 'bg-paper text-ink-900 shadow-sm ring-1 ring-ink-100'
                  : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {txn.isPersonal && (
        <div className="space-y-3 rounded-lg border border-ink-100 bg-paper px-3.5 py-3">
          <p className="text-[12px] leading-snug text-ink-500">
            Personal expenses are excluded from your corporation tax calculations.
          </p>

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
              Helps at year-end so you don't have to re-decide.
            </span>
          </label>

          <label className="flex items-start gap-2 text-[13px] text-ink-700">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) =>
                setReviewedForCorpTax(txn.id, e.target.checked)
              }
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-accent focus:ring-accent-ring"
            />
            <span className="leading-snug">
              Reviewed for corporation tax
              {txn.personalExpenseNote?.reviewedAt && reviewed && (
                <span className="ml-1 text-[11.5px] text-ink-400">
                  · {formatDateLong(txn.personalExpenseNote.reviewedAt)}
                </span>
              )}
            </span>
          </label>
        </div>
      )}
    </section>
  );
}

function DetailFooter({
  txn,
  confirming,
  onPrimary,
}: {
  txn: Transaction;
  confirming: boolean;
  onPrimary: () => void;
}) {
  // `confirming` holds for ~600ms after "Mark as reviewed" on mobile and
  // briefly swaps the button label for an inline confirmation. Desktop
  // never enters this state (the parent only arms it on mobile), so the
  // button reads as it always has for keyboard users.
  return (
    <div className="border-t border-ink-100 bg-paper px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6 sm:py-4 sm:pb-4">
      <button
        type="button"
        data-detail-primary
        onClick={onPrimary}
        disabled={confirming}
        aria-pressed={txn.reviewed}
        aria-live="polite"
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-3 text-[14px] font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-default sm:py-2 sm:text-[13px] ${
          confirming
            ? 'bg-emerald-600 text-white'
            : txn.reviewed
              ? 'border border-ink-100 bg-paper text-ink-700 hover:bg-ink-50'
              : 'bg-accent text-white hover:bg-accent-hover'
        }`}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {confirming
          ? 'Marked as reviewed'
          : txn.reviewed
            ? 'Unmark as reviewed'
            : 'Mark as reviewed'}
      </button>
      {/* Keyboard hints are only meaningful with a physical keyboard.
          Hide them on mobile where there's no up/down/space to press. */}
      <p className="mt-2 hidden text-center text-[11.5px] text-ink-400 sm:block">
        Press <kbd className="rounded bg-ink-50 px-1 py-0.5 text-[10.5px] text-ink-500">↑</kbd>{' '}
        <kbd className="rounded bg-ink-50 px-1 py-0.5 text-[10.5px] text-ink-500">↓</kbd> to
        navigate,{' '}
        <kbd className="rounded bg-ink-50 px-1 py-0.5 text-[10.5px] text-ink-500">space</kbd>{' '}
        to select
      </p>
    </div>
  );
}
