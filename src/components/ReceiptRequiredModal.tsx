import { useEffect, useRef } from 'react';
import { AlertTriangle, Receipt, X } from 'lucide-react';

type Props = {
  open: boolean;
  /**
   * Total transactions the user asked to mark as reviewed; for a single
   * detail-panel action this is 1. For the bulk flow it's the size of the
   * selection.
   */
  total: number;
  /**
   * How many of `total` are receipt-required but have no receipt attached.
   * This is the figure the modal is trying to protect against.
   */
  missingCount: number;
  /**
   * Display label for the single-row case (e.g. merchant name). Omitted
   * in the bulk flow, where the modal uses `total`/`missingCount` instead.
   */
  merchant?: string;
  onUploadReceipt: () => void;
  onMarkAnyway: () => void;
  onCancel: () => void;
};

/**
 * Protective confirmation shown before marking a receipt-required
 * transaction (or bulk selection) as reviewed without a receipt attached.
 * Nudges the user toward the upload path first; the "Mark as reviewed
 * anyway" secondary exists for when the user genuinely can't produce a
 * receipt, and sets `reviewedWithoutReceipt` on the relevant rows.
 */
export function ReceiptRequiredModal({
  open,
  total,
  missingCount,
  merchant,
  onUploadReceipt,
  onMarkAnyway,
  onCancel,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
      window.setTimeout(() => {
        const primary = panelRef.current?.querySelector<HTMLElement>(
          'button[data-primary="true"]',
        );
        primary?.focus();
      }, 10);
    } else {
      lastFocusedRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Tab') {
        trapFocus(e, panelRef.current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isBulk = total > 1;
  const title = isBulk
    ? `${missingCount} of ${total} selected transactions need a receipt`
    : merchant
      ? `${merchant} needs a receipt`
      : 'Receipt required';
  const body = isBulk
    ? `HMRC requires receipts for ${missingCount} of the ${total} selected transactions. Upload them before marking the batch as reviewed, or confirm you want to proceed without.`
    : `HMRC requires a receipt for this transaction. Upload one now, or confirm you want to mark it as reviewed anyway — we'll flag it so you can revisit later.`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-900/40 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-required-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="flex h-full w-full flex-col overflow-hidden bg-paper shadow-[0_12px_48px_-8px_rgba(15,23,42,0.25)] sm:h-auto sm:max-w-[480px] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-700">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="receipt-required-title"
                className="text-[15px] font-semibold text-ink-900"
              >
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-[13px] text-ink-700 sm:flex-none">
          <p>{body}</p>
        </div>

        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-ink-100 bg-paper-muted px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:flex-row sm:items-center sm:justify-end sm:gap-2 sm:pb-3">
          <button
            type="button"
            onClick={onMarkAnyway}
            className="inline-flex h-11 items-center justify-center rounded-md border border-ink-100 bg-paper px-4 text-[13px] font-medium text-ink-700 hover:bg-ink-50 sm:h-auto sm:px-3 sm:py-2 sm:text-[12.5px]"
          >
            {isBulk
              ? `Mark ${total} as reviewed anyway`
              : 'Mark as reviewed anyway'}
          </button>
          <button
            type="button"
            data-primary="true"
            onClick={onUploadReceipt}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-[14px] font-semibold text-white hover:bg-accent-hover sm:h-auto sm:px-3 sm:py-2 sm:text-[12.5px]"
          >
            <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
            {isBulk ? 'Upload receipts' : 'Upload receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'button, [href], input, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
