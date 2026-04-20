import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, CircleHelp, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { formatDateLong } from '../lib/format';

/**
 * Quiet modal that lists active merchant rules, explains what rules do,
 * and lets the user remove any of them with an inline confirmation.
 */
export function RulesModal() {
  const open = useStore((s) => s.rulesModalOpen);
  const setOpen = useStore((s) => s.setRulesModalOpen);
  const rules = useStore((s) => s.rules);
  const transactions = useStore((s) => s.transactions);
  const removeRule = useStore((s) => s.removeRule);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
      window.setTimeout(() => {
        const first = panelRef.current?.querySelector<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        first?.focus();
      }, 10);
    } else {
      setConfirmingId(null);
      lastFocusedRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'Tab') {
        trapFocus(e, panelRef.current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const countFor = (ruleId: string) =>
    transactions.filter((t) => t.ruleId === ruleId).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink-900/40 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={panelRef}
        className="flex h-full w-full flex-col overflow-hidden bg-paper shadow-[0_12px_48px_-8px_rgba(15,23,42,0.25)] sm:h-auto sm:max-h-[90vh] sm:max-w-[640px] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="rules-modal-title"
              className="text-[16px] font-semibold text-ink-900"
            >
              Your merchant rules
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-500">
              Rules automatically categorise new transactions from specific
              merchants. You can remove any rule at any time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:max-h-[60vh] sm:flex-none">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CircleHelp
                className="h-6 w-6 text-ink-300"
                aria-hidden="true"
              />
              <p className="text-[13.5px] font-medium text-ink-800">
                No rules yet.
              </p>
              <p className="max-w-[360px] text-[12.5px] text-ink-500">
                When you recategorise transactions from a merchant, we'll
                offer to set a rule.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
              {rules.map((rule) => {
                const attached = countFor(rule.id);
                const confirming = confirmingId === rule.id;
                return (
                  <li key={rule.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <BadgeCheck
                            className="h-4 w-4 shrink-0 text-emerald-700"
                            aria-hidden="true"
                          />
                          <span className="text-[13.5px] font-semibold text-ink-900">
                            {rule.merchant} → {rule.category}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-ink-400">
                          Created {formatDateLong(rule.createdAt.slice(0, 10))}{' '}
                          · applied to {rule.appliedToPastCount} past
                          transaction
                          {rule.appliedToPastCount === 1 ? '' : 's'} ·{' '}
                          {attached} active
                        </p>
                      </div>
                      {!confirming && (
                        <button
                          type="button"
                          onClick={() => setConfirmingId(rule.id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-100 bg-paper px-2.5 py-1 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Remove
                        </button>
                      )}
                    </div>
                    {confirming && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                        <p>
                          Remove the {rule.merchant} rule? Future{' '}
                          {rule.merchant} transactions will be categorised by
                          AI again. This won't change the {attached}{' '}
                          transaction{attached === 1 ? '' : 's'} you've
                          already categorised.
                        </p>
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            className="inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-medium text-amber-800 hover:bg-amber-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              removeRule(rule.id);
                              setConfirmingId(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-amber-800"
                          >
                            <Trash2
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            Remove rule
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-paper-muted px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-11 items-center rounded-md bg-accent px-4 text-[14px] font-semibold text-white hover:bg-accent-hover sm:h-auto sm:px-3 sm:py-2 sm:text-[12.5px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'button, [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
