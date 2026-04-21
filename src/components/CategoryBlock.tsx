import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Check,
  Edit2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { ConfidenceDot } from './ConfidenceDot';
import { AMBIGUOUS_MERCHANTS } from '../data/transactions';
import type { Category, Transaction } from '../types';

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

type PendingApply = {
  pivotId: string;
  merchant: string;
  fromCategory: Category;
  toCategory: Category;
  otherCount: number;
};

/**
 * Combined inline category editor + "Apply to other transactions?" panel.
 * Drops into the detail panel in place of the old read-only CategoryBlock.
 */
export function CategoryBlock({ txn }: { txn: Transaction }) {
  const rules = useStore((s) => s.rules);
  const transactions = useStore((s) => s.transactions);
  const changeCategory = useStore((s) => s.changeCategory);
  const setRulesModalOpen = useStore((s) => s.setRulesModalOpen);
  const offerRule = useStore((s) => s.offerRule);

  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    // If the selected transaction changes, close any in-progress edit/panel.
    setEditing(false);
    setPending(null);
    setConfirm(null);
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
  }, [txn.id]);

  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  const rule = useMemo(
    () => (txn.ruleId ? rules.find((r) => r.id === txn.ruleId) : undefined),
    [txn.ruleId, rules],
  );

  const sameMerchantOldCategory = (oldCategory: Category) =>
    transactions.filter(
      (t) =>
        t.id !== txn.id &&
        t.merchant === txn.merchant &&
        t.category === oldCategory &&
        !t.isPersonal,
    ).length;

  const handleSave = (toCategory: Category) => {
    const from = txn.category;
    if (from === toCategory) {
      setEditing(false);
      return;
    }
    changeCategory(txn.id, toCategory);
    setEditing(false);
    const otherCount = sameMerchantOldCategory(from);

    if (otherCount === 0) {
      // No same-old-category siblings to sweep, but the merchant might
      // still have siblings under the NEW (or other) category — offer to
      // lock it in as a rule when the merchant has history and no rule.
      const pastCount = transactions.filter(
        (t) =>
          t.id !== txn.id && t.merchant === txn.merchant && !t.isPersonal,
      ).length;
      const isAmbiguous = AMBIGUOUS_MERCHANTS.some(
        (m) => m.toLowerCase() === txn.merchant.toLowerCase(),
      );
      const hasExistingRule = rules.some(
        (r) => r.merchant.toLowerCase() === txn.merchant.toLowerCase(),
      );
      if (pastCount >= 2 && !isAmbiguous && !hasExistingRule) {
        offerRule({
          merchant: txn.merchant,
          fromCategory: from,
          toCategory,
        });
      }
      showConfirm('Category updated.');
      return;
    }

    setPending({
      pivotId: txn.id,
      merchant: txn.merchant,
      fromCategory: from,
      toCategory,
      otherCount,
    });
  };

  const showConfirm = (msg: string) => {
    setConfirm(msg);
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirm(null), 2500);
  };

  return (
    <section className="space-y-2.5" aria-labelledby={`category-heading-${txn.id}`}>
      <h3
        id={`category-heading-${txn.id}`}
        className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400"
      >
        Category
      </h3>

      {confirm && (
        <div
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] font-medium text-emerald-800"
          role="status"
          aria-live="polite"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {confirm}
        </div>
      )}

      {editing ? (
        <CategoryEditor
          txn={txn}
          rule={rule}
          onCancel={() => setEditing(false)}
          onSave={handleSave}
        />
      ) : (
        <CategoryDisplay
          txn={txn}
          rule={rule}
          onEdit={() => setEditing(true)}
          onOpenRules={() => setRulesModalOpen(true)}
        />
      )}

      {pending && (
        <ApplyToMerchantPanel
          pending={pending}
          onClose={(msg) => {
            setPending(null);
            if (msg) showConfirm(msg);
          }}
        />
      )}

      {txn.categoryConfidence === 'low' &&
        txn.aiSuggestedCategory &&
        !editing &&
        !pending && (
          <AiSuggestionCard
            suggested={txn.aiSuggestedCategory}
            reasoning={txn.aiReasoning}
            onAccept={() => handleSave(txn.aiSuggestedCategory!)}
            onEdit={() => setEditing(true)}
          />
        )}
    </section>
  );
}

function CategoryDisplay({
  txn,
  rule,
  onEdit,
  onOpenRules,
}: {
  txn: Transaction;
  rule: { merchant: string; category: Category } | undefined;
  onEdit: () => void;
  onOpenRules: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-paper px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <ConfidenceDot level={txn.categoryConfidence} />
          <span className="text-[13.5px] font-medium text-ink-800">
            {txn.category}
          </span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
        >
          <Edit2 className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
      </div>

      {txn.categorySource === 'rule' && rule && (
        <button
          type="button"
          onClick={onOpenRules}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2 py-0.5 text-[11.5px] text-ink-500 hover:bg-ink-100 hover:text-ink-700"
          title="Open rules"
        >
          <BadgeCheck className="h-3 w-3" aria-hidden="true" />
          From your {rule.merchant} rule
        </button>
      )}

      {txn.categorySource === 'manual' && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2 py-0.5 text-[11.5px] text-ink-500">
          Set manually
        </span>
      )}
    </div>
  );
}

function CategoryEditor({
  txn,
  rule,
  onCancel,
  onSave,
}: {
  txn: Transaction;
  rule: { merchant: string; category: Category } | undefined;
  onCancel: () => void;
  onSave: (c: Category) => void;
}) {
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState<Category>(txn.category);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ALL_CATEGORIES;
    return ALL_CATEGORIES.filter((c) => c.toLowerCase().includes(q));
  }, [filter]);

  useEffect(() => {
    // Keep highlight valid within filtered list.
    if (filtered.length > 0 && !filtered.includes(highlight)) {
      setHighlight(filtered[0]!);
    }
  }, [filtered, highlight]);

  const sourceLine =
    txn.categorySource === 'rule' && rule
      ? `Currently set by your ${rule.merchant} rule.`
      : txn.categorySource === 'manual'
      ? 'Currently set manually.'
      : 'Currently suggested by AI.';

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = filtered.indexOf(highlight);
      const next = filtered[Math.min(filtered.length - 1, idx + 1)] ?? highlight;
      setHighlight(next);
      scrollHighlightIntoView(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = filtered.indexOf(highlight);
      const next = filtered[Math.max(0, idx - 1)] ?? highlight;
      setHighlight(next);
      scrollHighlightIntoView(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSave(highlight);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const scrollHighlightIntoView = (c: Category) => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cat="${c}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <div className="rounded-lg border border-ink-100 bg-paper p-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type to filter categories"
          aria-label="Filter categories"
          aria-controls={`category-list-${txn.id}`}
          className="w-full rounded-md border border-ink-100 bg-paper py-2 pl-8 pr-3 text-[13px] text-ink-900 outline-none focus:border-ink-200 focus:ring-2 focus:ring-accent-ring"
        />
      </div>

      <div
        id={`category-list-${txn.id}`}
        ref={listRef}
        role="listbox"
        aria-label="Categories"
        className="mt-2 max-h-[180px] overflow-y-auto scrollbar-thin rounded-md border border-ink-100"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12.5px] text-ink-400">
            No matching category
          </div>
        ) : (
          filtered.map((c) => {
            const active = c === highlight;
            const current = c === txn.category;
            return (
              <button
                key={c}
                type="button"
                role="option"
                data-cat={c}
                aria-selected={current}
                onMouseEnter={() => setHighlight(c)}
                onClick={() => onSave(c)}
                className={`flex w-full items-center justify-between gap-2 border-b border-ink-50 px-3 py-2 text-left text-[13px] last:border-b-0 ${
                  active ? 'bg-accent-soft text-accent' : 'text-ink-800 hover:bg-ink-50'
                }`}
              >
                <span>{c}</span>
                {current && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            );
          })
        )}
      </div>

      <p className="mt-2 text-[11.5px] text-ink-400">{sourceLine}</p>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(highlight)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-accent-hover"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Save
        </button>
      </div>
    </div>
  );
}

type ApplyMode = 'this-only' | 'past' | 'past-and-future';

function ApplyToMerchantPanel({
  pending,
  onClose,
}: {
  pending: PendingApply;
  onClose: (confirmMsg?: string) => void;
}) {
  const applyToPast = useStore((s) => s.applyToPastForMerchant);
  const offerRule = useStore((s) => s.offerRule);
  const rules = useStore((s) => s.rules);
  const transactions = useStore((s) => s.transactions);

  const isAmbiguous = AMBIGUOUS_MERCHANTS.some(
    (m) => m.toLowerCase() === pending.merchant.toLowerCase(),
  );

  /**
   * Fire a soft "Always categorise X as Y?" nudge when a single-row
   * recategorisation looks like it could reasonably be a rule: enough
   * prior history, no existing rule, merchant isn't a category chameleon.
   * Fires for both the "Just this one" radio path and the X-dismiss path.
   */
  const maybeOfferRule = () => {
    if (isAmbiguous) return;
    const hasExistingRule = rules.some(
      (r) => r.merchant.toLowerCase() === pending.merchant.toLowerCase(),
    );
    if (hasExistingRule) return;
    const pastCount = transactions.filter(
      (t) =>
        t.id !== pending.pivotId &&
        t.merchant === pending.merchant &&
        !t.isPersonal,
    ).length;
    if (pastCount < 2) return;
    offerRule({
      merchant: pending.merchant,
      fromCategory: pending.fromCategory,
      toCategory: pending.toCategory,
    });
  };

  const defaultMode: ApplyMode =
    isAmbiguous
      ? 'this-only'
      : pending.otherCount >= 3
      ? 'past-and-future'
      : 'past';

  const [mode, setMode] = useState<ApplyMode>(defaultMode);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Slide the panel into view so the user doesn't miss it.
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const firstRadio = panelRef.current?.querySelector<HTMLElement>(
      'input[type="radio"]:checked',
    );
    firstRadio?.focus();
  }, []);

  const onConfirm = () => {
    if (mode === 'this-only') {
      maybeOfferRule();
      onClose('Category updated.');
      return;
    }
    const createRule = mode === 'past-and-future';
    applyToPast({
      pivotId: pending.pivotId,
      merchant: pending.merchant,
      fromCategory: pending.fromCategory,
      toCategory: pending.toCategory,
      createRule,
    });
    // Snackbar carries the per-action message; clear any inline confirm.
    onClose();
  };

  const n = pending.otherCount;

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={`Apply category change to other ${pending.merchant} transactions`}
      className="rounded-lg border border-accent/40 bg-accent-soft/40 p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[13.5px] font-semibold text-ink-900">
            Apply this change to other {pending.merchant} transactions?
          </h4>
          <p className="mt-1 text-[12.5px] text-ink-500">
            You have {n} other transaction{n === 1 ? '' : 's'} from{' '}
            {pending.merchant} categorised as {pending.fromCategory}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            maybeOfferRule();
            onClose('Category updated.');
          }}
          aria-label="Keep just this one"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-paper hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <fieldset className="mt-3 space-y-1.5">
        <legend className="sr-only">
          How far should this change apply?
        </legend>
        <RadioOption
          name={`apply-mode-${pending.pivotId}`}
          value="this-only"
          checked={mode === 'this-only'}
          onChange={() => setMode('this-only')}
          label="Just this one."
          hint={`Leave the other ${n} as ${pending.fromCategory}.`}
        />
        <RadioOption
          name={`apply-mode-${pending.pivotId}`}
          value="past"
          checked={mode === 'past'}
          onChange={() => setMode('past')}
          label="Past transactions too."
          hint={`Update all ${n} past transactions to ${pending.toCategory}.`}
        />
        <RadioOption
          name={`apply-mode-${pending.pivotId}`}
          value="past-and-future"
          checked={mode === 'past-and-future'}
          onChange={() => setMode('past-and-future')}
          label="Past and future."
          hint={`Update all ${n} past transactions and automatically categorise future ${pending.merchant} transactions as ${pending.toCategory}.`}
        />
      </fieldset>

      {isAmbiguous && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-ink-500">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          We don't suggest a rule because {pending.merchant} transactions
          often span different categories.
        </p>
      )}

      {/* No secondary "Keep just this one" button here — it was redundant
          with the "Just this one" radio + Confirm path, and users were
          hitting it when they actually meant to pick a different radio.
          The X in the top-right still dismisses the panel without any
          further change. */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-accent-hover sm:h-auto sm:px-3 sm:py-1.5 sm:text-[12.5px]"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function RadioOption({
  name,
  value,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition ${
        checked
          ? 'border-accent bg-paper'
          : 'border-transparent bg-paper/60 hover:bg-paper'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink-900">
          {label}
        </span>
        <span className="mt-0.5 block text-[12px] text-ink-500">{hint}</span>
      </span>
    </label>
  );
}

function AiSuggestionCard({
  suggested,
  reasoning,
  onAccept,
  onEdit,
}: {
  suggested: Category;
  reasoning: string | undefined;
  onAccept: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
      <div className="flex items-start gap-2">
        <Sparkles
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-amber-800">
            AI suggested: {suggested}
          </div>
          {reasoning && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800/90">
              {reasoning}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-amber-800"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Accept suggestion
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center rounded-md border border-amber-300 bg-paper px-2.5 py-1 text-[12px] font-medium text-amber-800 hover:bg-amber-100"
            >
              Choose different
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
