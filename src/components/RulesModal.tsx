import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Check,
  ChevronDown,
  CircleHelp,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { formatDateLong } from '../lib/format';
import type { Category } from '../types';

const ALL_CATEGORIES: Category[] = [
  'Software subscriptions',
  'Travel',
  'Meals and entertainment',
  'Office supplies',
  'Marketing',
  'Professional services',
  'Equipment',
  'Utilities',
  'Tax and government',
  'Income',
  'Personal',
];

/**
 * Quiet modal that lists active merchant rules, explains what rules do,
 * lets the user create a new rule from scratch, and lets them remove any
 * of the existing rules with an inline confirmation.
 */
export function RulesModal() {
  const open = useStore((s) => s.rulesModalOpen);
  const setOpen = useStore((s) => s.setRulesModalOpen);
  const rules = useStore((s) => s.rules);
  const transactions = useStore((s) => s.transactions);
  const removeRule = useStore((s) => s.removeRule);
  const createMerchantRule = useStore((s) => s.createMerchantRule);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
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
      setFormOpen(false);
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
          <div className="flex shrink-0 items-center gap-2">
            {!formOpen && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-hover"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New rule
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:max-h-[60vh] sm:flex-none">
          {formOpen && (
            <NewRuleForm
              existingMerchants={new Set(
                rules.map((r) => r.merchant.toLowerCase()),
              )}
              onCancel={() => setFormOpen(false)}
              onCreate={(merchant, category, applyToExisting) => {
                createMerchantRule(merchant, category, { applyToExisting });
                setFormOpen(false);
              }}
            />
          )}

          {rules.length === 0 && !formOpen ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CircleHelp
                className="h-6 w-6 text-ink-300"
                aria-hidden="true"
              />
              <p className="text-[13.5px] font-medium text-ink-800">
                No rules yet.
              </p>
              <p className="max-w-[360px] text-[12.5px] text-ink-500">
                Use "New rule" above, or recategorise a transaction and
                we'll offer to set one.
              </p>
            </div>
          ) : rules.length === 0 ? null : (
            <ul
              className={`${formOpen ? 'mt-5 ' : ''}divide-y divide-ink-100 rounded-lg border border-ink-100`}
            >
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

/**
 * Inline "Create a rule from scratch" form inside the RulesModal. Offers
 * a searchable merchant dropdown (with transaction counts), a category
 * dropdown, and an optional apply-to-existing toggle. Blocks creation
 * when a rule already exists for the chosen merchant.
 */
function NewRuleForm({
  existingMerchants,
  onCancel,
  onCreate,
}: {
  existingMerchants: Set<string>;
  onCancel: () => void;
  onCreate: (
    merchant: string,
    category: Category,
    applyToExisting: boolean,
  ) => void;
}) {
  const transactions = useStore((s) => s.transactions);

  // Pre-compute merchant → transaction count map from the ledger, sorted
  // descending by count so the user's most-used merchants rise to the top.
  const merchantOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      if (t.isPersonal) continue;
      counts.set(t.merchant, (counts.get(t.merchant) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([merchant, count]) => ({ merchant, count }))
      .sort((a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant));
  }, [transactions]);

  const [query, setQuery] = useState('');
  const [merchant, setMerchant] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merchantOptions.slice(0, 20);
    return merchantOptions
      .filter((m) => m.merchant.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, merchantOptions]);

  const existingCount = merchant
    ? (merchantOptions.find((m) => m.merchant === merchant)?.count ?? 0)
    : 0;

  const duplicate =
    merchant !== null && existingMerchants.has(merchant.toLowerCase());

  const canCreate = merchant !== null && category !== null && !duplicate;

  return (
    <section
      aria-labelledby="new-rule-heading"
      className="mb-1 rounded-lg border border-accent/40 bg-accent-soft/40 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          id="new-rule-heading"
          className="text-[13.5px] font-semibold text-ink-900"
        >
          Create a new rule
        </h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel new rule"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-paper hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-500">
        Pick a merchant and the category future transactions should land in.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label
            htmlFor="new-rule-merchant"
            className="mb-1 block text-[11.5px] font-medium uppercase tracking-wide text-ink-500"
          >
            Merchant
          </label>
          <div className="relative">
            <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-paper px-3 py-2 focus-within:ring-2 focus-within:ring-accent-ring">
              <Search
                className="h-3.5 w-3.5 shrink-0 text-ink-400"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                id="new-rule-merchant"
                type="text"
                value={merchant ?? query}
                onChange={(e) => {
                  setMerchant(null);
                  setQuery(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() =>
                  // Delay so a click on a dropdown option registers before
                  // we close the list.
                  window.setTimeout(() => setDropdownOpen(false), 120)
                }
                placeholder="Search merchants…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
                autoComplete="off"
              />
              {merchant && (
                <button
                  type="button"
                  onClick={() => {
                    setMerchant(null);
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear merchant"
                  className="grid h-5 w-5 place-items-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>

            {dropdownOpen && matches.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-ink-100 bg-paper shadow-[0_8px_24px_-8px_rgba(15,23,42,0.15)]"
              >
                {matches.map((m) => {
                  const isDupe = existingMerchants.has(m.merchant.toLowerCase());
                  return (
                    <li key={m.merchant}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={merchant === m.merchant}
                        disabled={isDupe}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setMerchant(m.merchant);
                          setQuery('');
                          setDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] ${
                          isDupe
                            ? 'cursor-not-allowed text-ink-300'
                            : 'text-ink-800 hover:bg-ink-50'
                        }`}
                      >
                        <span className="truncate">{m.merchant}</span>
                        <span className="shrink-0 text-[11.5px] text-ink-400">
                          {m.count} txn{m.count === 1 ? '' : 's'}
                          {isDupe ? ' · has rule' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {duplicate && (
            <p
              role="alert"
              className="mt-1.5 text-[12px] text-red-700"
            >
              A rule already exists for {merchant}. Remove it first, or pick
              a different merchant.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="new-rule-category"
            className="mb-1 block text-[11.5px] font-medium uppercase tracking-wide text-ink-500"
          >
            Category
          </label>
          <div className="relative">
            <select
              id="new-rule-category"
              value={category ?? ''}
              onChange={(e) =>
                setCategory(
                  e.target.value ? (e.target.value as Category) : null,
                )
              }
              className="w-full appearance-none rounded-md border border-ink-200 bg-paper px-3 py-2 pr-8 text-[13px] text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-ring"
            >
              <option value="" disabled>
                Pick a category…
              </option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
          </div>
        </div>

        {merchant && existingCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-ink-100 bg-paper px-3 py-2">
            <input
              type="checkbox"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
            />
            <span className="min-w-0 text-[12.5px] text-ink-700">
              Also apply to{' '}
              <span className="font-semibold text-ink-900">
                {existingCount} existing {merchant} transaction
                {existingCount === 1 ? '' : 's'}
              </span>
              .
              <span className="mt-0.5 block text-[11.5px] text-ink-500">
                Off by default so past records aren't rewritten without a
                deliberate choice.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center rounded-md px-3 py-2 text-[12.5px] font-medium text-ink-600 hover:bg-paper"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => {
            if (!merchant || !category) return;
            onCreate(merchant, category, applyToExisting);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Create rule
        </button>
      </div>
    </section>
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
