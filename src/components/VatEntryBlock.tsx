import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgePercent,
  Check,
  CircleDot,
  Edit2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { formatAmount } from '../lib/format';
import { DEFAULT_VAT_RATES, calcVatFromGross } from '../data/transactions';
import type {
  Transaction,
  VatEntryMethod,
  VatRate,
} from '../types';

const RATES: VatRate[] = [0, 5, 20];

type Props = {
  txn: Transaction;
  /** Called ~800ms after a save completes (for batch auto-advance) */
  onSaved?: () => void;
  /** Variant: 'inline' for the standard right-hand detail panel, 'expanded' for batch mode */
  variant?: 'inline' | 'expanded';
};

export function VatEntryBlock({ txn, onSaved, variant = 'inline' }: Props) {
  const saveVat = useStore((s) => s.saveVat);
  const removeVat = useStore((s) => s.removeVat);
  const markNotVatEligible = useStore((s) => s.markNotVatEligible);
  const openReceiptModal = useStore((s) => s.openReceiptModal);

  // If vatStatus is 'recorded' and user clicks Edit, we drop into entry mode
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const timerRef = useRef<number | null>(null);
  const lastSeenEnteredAt = useRef<string | undefined>(txn.vatEnteredAt);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // Watch for VAT being recorded (either via inline save or external receipt flow).
  // Fires the brief "VAT added" confirmation and the onSaved callback uniformly.
  useEffect(() => {
    if (
      txn.vatEnteredAt &&
      txn.vatEnteredAt !== lastSeenEnteredAt.current &&
      txn.vatStatus === 'recorded'
    ) {
      setEditing(false);
      setConfirm(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const delay = onSaved ? 600 : 800;
      timerRef.current = window.setTimeout(() => {
        setConfirm(false);
        onSaved?.();
      }, delay);
    }
    lastSeenEnteredAt.current = txn.vatEnteredAt;
  }, [txn.vatEnteredAt, txn.vatStatus, onSaved]);

  const shouldShowEntry = txn.vatStatus === 'needs-vat' || editing;

  return (
    <section className="space-y-2.5">
      <SectionHeading>VAT</SectionHeading>

      {confirm && (
        <div
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] font-medium text-emerald-800"
          role="status"
          aria-live="polite"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          VAT added
        </div>
      )}

      {txn.vatStatus === 'not-applicable' && !editing && (
        <NotApplicableView
          txn={txn}
          onReopen={() => {
            removeVat(txn.id);
            setEditing(true);
          }}
        />
      )}

      {txn.vatStatus === 'recorded' && !editing && !confirm && (
        <RecordedView
          txn={txn}
          onEdit={() => setEditing(true)}
          onRemove={() => removeVat(txn.id)}
        />
      )}

      {shouldShowEntry && txn.vatStatus !== 'not-applicable' && (
        <EntryView
          key={txn.id}
          txn={txn}
          variant={variant}
          onCancel={editing ? () => setEditing(false) : undefined}
          onSave={(input) => {
            // The effect on vatEnteredAt handles the "VAT added" confirmation
            // and onSaved advance, so both inline and receipt-modal saves
            // behave identically. We only need to close the entry form here.
            saveVat(txn.id, input);
            setEditing(false);
          }}
          onRequestUpload={() => openReceiptModal(txn.id, variant === 'expanded' ? 'batch' : 'detail')}
          onMarkNotEligible={() => {
            markNotVatEligible(txn.id);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
      {children}
    </h3>
  );
}

function RecordedView({
  txn,
  onEdit,
  onRemove,
}: {
  txn: Transaction;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const methodLabel = methodToLabel(txn.vatEntryMethod);
  const receiptSourceMissing =
    txn.vatEntryMethod === 'receipt' && !txn.receiptAttached;
  return (
    <div className="space-y-1.5">
      {receiptSourceMissing && (
        <p className="text-[11.5px] text-ink-400">
          VAT amount was detected from the removed receipt. Edit VAT if needed.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-paper px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BadgePercent
            className="h-4 w-4 shrink-0 text-emerald-700"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="tabular text-[14px] font-semibold text-ink-900">
                {txn.vatAmount != null ? formatAmount(txn.vatAmount) : '–'}
              </span>
              <span className="text-[11.5px] font-medium text-ink-400">
                at {txn.vatRate ?? 20}%
              </span>
            </div>
            {methodLabel && (
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-ink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-500">
                {txn.vatEntryMethod === 'ai-suggested' && (
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                )}
                {methodLabel}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-500 hover:text-ink-800 underline-offset-2 hover:underline"
          >
            <Edit2 className="h-3 w-3" aria-hidden="true" />
            Edit
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1 text-[11.5px] text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        Remove VAT
      </button>
    </div>
  );
}

function NotApplicableView({
  txn: _txn,
  onReopen,
}: {
  txn: Transaction;
  onReopen: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-paper-muted px-3.5 py-3">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
        <CircleDot className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
        Not VAT-eligible
      </div>
      <button
        type="button"
        onClick={onReopen}
        className="text-[12.5px] font-medium text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
      >
        Add VAT instead
      </button>
    </div>
  );
}

type EntryInput = { rate: VatRate; amount: number; method: VatEntryMethod };

function EntryView({
  txn,
  variant,
  onCancel,
  onSave,
  onRequestUpload,
  onMarkNotEligible,
}: {
  txn: Transaction;
  variant: 'inline' | 'expanded';
  onCancel?: () => void;
  onSave: (input: EntryInput) => void;
  onRequestUpload: () => void;
  onMarkNotEligible: () => void;
}) {
  const gross = Math.abs(txn.amount);
  const defaultRate: VatRate =
    txn.vatRate ?? DEFAULT_VAT_RATES[txn.category] ?? 20;

  const [rate, setRate] = useState<VatRate>(defaultRate);
  const [amountStr, setAmountStr] = useState<string>(() =>
    txn.vatAmount != null
      ? txn.vatAmount.toFixed(2)
      : calcVatFromGross(gross, defaultRate).toFixed(2),
  );
  const [amountDirty, setAmountDirty] = useState(false);
  const amountRef = useRef<HTMLInputElement | null>(null);

  // Auto-recalc when rate changes, unless user has manually edited
  useEffect(() => {
    if (!amountDirty) {
      setAmountStr(calcVatFromGross(gross, rate).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, gross]);

  // In batch mode, focus the amount input when a new txn mounts
  useEffect(() => {
    if (variant === 'expanded') {
      amountRef.current?.focus();
      amountRef.current?.select();
    }
  }, [variant]);

  const parsed = parseFloat(amountStr);
  const amountNum = Number.isFinite(parsed) ? parsed : 0;

  const error = useMemo(() => validate(amountStr, gross), [amountStr, gross]);

  const helperAmount = formatAmount(-Math.abs(calcVatFromGross(gross, rate)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (error) return;
        onSave({ rate, amount: amountNum, method: 'manual' });
      }}
      className={`space-y-3 rounded-lg border border-ink-100 bg-paper p-3.5 ${
        variant === 'expanded' ? 'md:p-5' : ''
      }`}
    >
      <div className={variant === 'expanded' ? 'space-y-3' : 'space-y-2.5'}>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label
              id={`vat-rate-${txn.id}`}
              className="mb-1 block text-[12px] font-medium text-ink-500"
            >
              Rate
            </label>
            <div
              role="radiogroup"
              aria-labelledby={`vat-rate-${txn.id}`}
              className="inline-flex items-center rounded-md border border-ink-100 bg-paper-muted p-0.5"
            >
              {RATES.map((r) => {
                const active = r === rate;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setRate(r);
                      setAmountDirty(false);
                    }}
                    className={`tabular min-w-[52px] rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition ${
                      active
                        ? 'bg-paper text-ink-900 shadow-sm ring-1 ring-ink-100'
                        : 'text-ink-500 hover:text-ink-800'
                    }`}
                  >
                    {r}%
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-medium text-ink-500">
              VAT amount
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400"
                aria-hidden="true"
              >
                £
              </span>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setAmountDirty(true);
                }}
                aria-label="VAT amount"
                aria-invalid={error ? 'true' : 'false'}
                /* 16px on mobile dodges the automatic iOS zoom-on-focus;
                   back to the reference 13px from sm up. */
                className={`block w-full rounded-md border bg-paper py-2 pl-6 pr-3 text-[16px] tabular text-ink-900 outline-none transition focus:ring-2 focus:ring-accent-ring focus:ring-offset-0 sm:text-[13px] ${
                  error
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-ink-100 focus:border-ink-200'
                }`}
              />
            </div>
            {error && (
              <p className="mt-1 text-[11.5px] text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>

        <p className="text-[11.5px] text-ink-400">
          {rate === 0
            ? 'Zero rate means no VAT to reclaim on this transaction.'
            : <>Calculated from {rate}% of {formatAmount(-Math.abs(gross))}. Equals {helperAmount}. Edit if your receipt shows a different amount.</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 pt-1">
        {/* Tertiary, bottom-left: a quiet escape hatch for a rare case. */}
        <button
          type="button"
          onClick={onMarkNotEligible}
          className="order-2 inline-flex items-center text-[11.5px] font-medium text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline focus:outline-none focus-visible:text-ink-700 focus-visible:underline sm:order-1"
        >
          This isn’t VAT-eligible
        </button>
        <div className="order-1 flex flex-wrap items-center gap-1.5 sm:order-2 sm:ml-auto">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center rounded-md px-2 py-2 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onRequestUpload}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-100 bg-paper px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload receipt instead
          </button>
          <button
            type="submit"
            disabled={error !== null}
            data-detail-primary
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Save VAT amount
          </button>
        </div>
      </div>
    </form>
  );
}

function validate(amountStr: string, gross: number): string | null {
  if (amountStr.trim() === '') return null;
  const n = parseFloat(amountStr);
  if (!Number.isFinite(n)) return 'Enter a number';
  if (n < 0) return 'VAT amount can’t be negative';
  if (n > gross) return `VAT amount can’t exceed the gross (${gross.toFixed(2)})`;
  return null;
}

function methodToLabel(method?: VatEntryMethod): string | null {
  if (!method) return null;
  if (method === 'manual') return 'Added manually';
  if (method === 'receipt') return 'From receipt';
  return 'AI suggested';
}
