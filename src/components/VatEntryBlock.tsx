import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgePercent,
  Check,
  CircleDot,
  Edit2,
  ExternalLink,
  Info,
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
      // Batch mode wants to auto-advance quickly (600ms feels snappy in a
      // rhythm). Inline detail on desktop wants a beat longer so the user
      // definitely clocks the Saved state before it reverts.
      const delay = onSaved ? 600 : 1200;
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

      {txn.vatStatus === 'not-applicable' && !editing && (
        <NotApplicableView
          txn={txn}
          variant={variant}
          onToggleEligible={() => {
            removeVat(txn.id);
            setEditing(true);
          }}
          onSaveAndNext={onSaved}
        />
      )}

      {txn.vatStatus === 'recorded' && !editing && (
        <RecordedView
          txn={txn}
          justSaved={confirm}
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
  justSaved,
  onEdit,
  onRemove,
}: {
  txn: Transaction;
  /** ~1.2s dwell immediately after Save. Adds a green tint + Saved badge. */
  justSaved?: boolean;
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
      <div
        role={justSaved ? 'status' : undefined}
        aria-live={justSaved ? 'polite' : undefined}
        className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
          justSaved
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-ink-100 bg-paper'
        }`}
      >
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
              {justSaved && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-800">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Saved
                </span>
              )}
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
  variant,
  onToggleEligible,
  onSaveAndNext,
}: {
  txn: Transaction;
  variant: 'inline' | 'expanded';
  /** Flip back to VAT-eligible: clears the not-applicable status and
      drops into the entry form so the user can add VAT. */
  onToggleEligible: () => void;
  /** Batch mode only: commits this (already-saved) not-applicable state
      as the user's answer and moves to the next transaction. The status
      is persisted the moment the toggle flipped, so the CTA is really a
      "move on" — but the label reads as Save so the rhythm with the
      Save VAT amount button in the entry view is consistent. */
  onSaveAndNext?: () => void;
}) {
  const showSaveCta = variant === 'expanded' && Boolean(onSaveAndNext);
  return (
    <div className="space-y-2.5 rounded-lg border border-ink-100 bg-paper-muted px-3.5 py-3">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
        <CircleDot className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
        Not VAT-eligible
      </div>
      <NotEligibleToggle checked onChange={() => onToggleEligible()} />
      {showSaveCta && (
        <div className="flex justify-end border-t border-ink-100 pt-2.5">
          <button
            type="button"
            onClick={onSaveAndNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Save and next
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Little segmented switch shared between the entry view and the
 * not-applicable view. On = status is `not-applicable`. Off = normal
 * entry form. Keeps the two code paths from drifting.
 */
function NotEligibleToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-600">
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 ${
          checked ? 'bg-accent' : 'bg-ink-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span>This isn't VAT-eligible</span>
    </label>
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
            <div className="mb-1 flex items-center gap-1">
              <label
                id={`vat-rate-${txn.id}`}
                className="block text-[12px] font-medium text-ink-500"
              >
                Rate
              </label>
              <VatRateTooltip />
            </div>
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
            <ImpliedRateHelper
              gross={gross}
              amountStr={amountStr}
              amountDirty={amountDirty}
              selectedRate={rate}
              hasError={error !== null}
            />
          </div>
        </div>

        <p className="text-[11.5px] text-ink-400">
          {rate === 0
            ? 'Zero rate means no VAT to reclaim on this transaction.'
            : <>Calculated from {rate}% of {formatAmount(-Math.abs(gross))}. Equals {helperAmount}. Edit if your receipt shows a different amount.</>}
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-ink-100 pt-3">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
        <div>
          {/* Toggle replaces the old tertiary button. Immediate effect:
              flips the status to not-applicable without needing Save. */}
          <NotEligibleToggle
            checked={false}
            onChange={(next) => {
              if (next) onMarkNotEligible();
            }}
          />
        </div>
      </div>
    </form>
  );
}

/**
 * Small helper that calls out the implied VAT rate when the typed amount
 * doesn't match the selected preset within 1% tolerance. Informational
 * only — does not block save. Stays out of the way when amount is
 * pristine, invalid, or matches the selected rate.
 */
function ImpliedRateHelper({
  gross,
  amountStr,
  amountDirty,
  selectedRate,
  hasError,
}: {
  gross: number;
  amountStr: string;
  amountDirty: boolean;
  selectedRate: VatRate;
  hasError: boolean;
}) {
  if (!amountDirty || hasError) return null;
  const parsed = parseFloat(amountStr);
  if (!Number.isFinite(parsed) || parsed < 0 || gross <= 0) return null;
  // Implied percentage on the *net* price: net = gross - VAT, rate = VAT/net.
  // Matches how most UK VAT calculators report it.
  const net = gross - parsed;
  if (net <= 0) return null;
  const implied = (parsed / net) * 100;
  const diff = Math.abs(implied - selectedRate);
  if (diff < 1) return null;
  const suggestedPreset: VatRate =
    implied <= 2.5 ? 0 : implied <= 12.5 ? 5 : 20;
  if (suggestedPreset === selectedRate) return null;
  const suggestedAmount = calcVatFromGross(gross, suggestedPreset);
  return (
    <p className="mt-1 text-[11.5px] text-ink-500" role="note">
      That's about {implied.toFixed(1)}% VAT. If you meant {suggestedPreset}%,
      the amount would be {formatAmount(suggestedAmount)}.
    </p>
  );
}

/**
 * Small info icon next to the Rate label. Keeps plain-language guidance
 * out of the way until the user reaches for it. Click toggles open on
 * touch where hover isn't available. Esc or outside click closes it.
 */
function VatRateTooltip() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        aria-label="About VAT rates"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-400 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="tooltip"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute left-1/2 top-full z-30 mt-2 w-[280px] -translate-x-1/2 rounded-lg border border-ink-100 bg-paper p-3 text-[12px] leading-snug text-ink-700 shadow-panel"
        >
          <p>
            20% is the standard UK VAT rate and applies to most business
            purchases. Reduced rate (5%) covers items like energy and
            children's car seats. Zero rate (0%) covers food, books, and some
            transport. If you're unsure, check your receipt or HMRC's
            guidance.
          </p>
          <a
            href="https://www.gov.uk/guidance/rates-of-vat-on-different-goods-and-services"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent underline-offset-2 hover:underline"
          >
            See HMRC rates
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      )}
    </span>
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
