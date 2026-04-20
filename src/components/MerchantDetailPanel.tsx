import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { formatAmount } from '../lib/format';
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

/**
 * Replaces the transaction DetailPanel when a merchant header is activated
 * from the By-merchant view. Shows merchant totals, category breakdown, any
 * active rule, and a "Set category rule" entry point that opens the bulk
 * recategorise flow for every transaction from that merchant.
 */
export function MerchantDetailPanel() {
  const transactions = useStore((s) => s.transactions);
  const rules = useStore((s) => s.rules);
  const merchant = useStore((s) => s.focusedMerchant);
  const focusMerchant = useStore((s) => s.focusMerchant);
  const removeRule = useStore((s) => s.removeRule);
  const setSelected = useStore((s) => s.setSelected);
  const setRuleForMerchant = useStore((s) => s.setRuleForMerchant);

  const [rulePickerOpen, setRulePickerOpen] = useState(false);

  const merchantTxns = useMemo(
    () =>
      merchant ? transactions.filter((t) => t.merchant === merchant) : [],
    [transactions, merchant],
  );

  const rule = useMemo(
    () => (merchant ? rules.find((r) => r.merchant === merchant) : undefined),
    [rules, merchant],
  );

  if (!merchant) return null;

  const total = merchantTxns.reduce(
    (sum, t) => sum + (t.amount < 0 ? -t.amount : 0),
    0,
  );

  const breakdown = categoryBreakdown(merchantTxns);
  const isMixed = breakdown.length > 1;
  const isAmbiguous = AMBIGUOUS_MERCHANTS.some(
    (m) => m.toLowerCase() === merchant.toLowerCase(),
  );
  const dominantCategory = breakdown[0]?.category ?? merchantTxns[0]?.category;

  return (
    <aside
      aria-label={`${merchant} overview`}
      className="flex h-full w-full flex-col bg-paper"
    >
      <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
        <button
          type="button"
          onClick={() => focusMerchant(null)}
          aria-label="Back to transactions"
          className="grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-semibold leading-tight text-ink-900">
            {merchant}
          </h2>
          <p className="text-[12.5px] text-ink-400">
            {merchantTxns.length} transaction
            {merchantTxns.length === 1 ? '' : 's'} ·{' '}
            {formatAmount(-total)} spent
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto scrollbar-thin px-5 py-5">
        <section className="space-y-2.5">
          <SectionHeading>Category breakdown</SectionHeading>
          <div className="space-y-1.5">
            {breakdown.map((row) => (
              <div
                key={row.category}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-100 bg-paper px-3 py-2"
              >
                <div className="text-[13px] text-ink-800">{row.category}</div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-[12.5px] text-ink-500">
                    {row.count} txn{row.count === 1 ? '' : 's'}
                  </span>
                  <span className="tabular text-[12.5px] font-medium text-ink-700">
                    {formatAmount(-row.total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {isMixed && (
            <p className="text-[11.5px] text-ink-400">
              This merchant spans more than one category. A single rule may
              not fit.
            </p>
          )}
        </section>

        <section className="space-y-2.5">
          <SectionHeading>Rule</SectionHeading>
          {rule ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-paper px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <BadgeCheck
                  className="h-4 w-4 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <div>
                  <div className="text-[13px] font-medium text-ink-900">
                    {rule.merchant} → {rule.category}
                  </div>
                  <div className="text-[11.5px] text-ink-400">
                    Active rule
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeRule(rule.id)}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Remove
              </button>
            </div>
          ) : rulePickerOpen ? (
            <SetRulePicker
              merchant={merchant}
              defaultCategory={dominantCategory}
              isAmbiguous={isAmbiguous}
              count={merchantTxns.length}
              onCancel={() => setRulePickerOpen(false)}
              onConfirm={(cat) => {
                setRuleForMerchant(merchant, cat);
                setRulePickerOpen(false);
              }}
            />
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed border-ink-200 bg-paper-muted px-3.5 py-3">
              <p className="text-[12.5px] text-ink-500">
                No rule set. Rules automatically categorise future
                transactions from this merchant.
              </p>
              {isAmbiguous ? (
                <p className="flex items-start gap-1.5 text-[11.5px] text-ink-400">
                  <Sparkles
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  {merchant} transactions often span different categories, so
                  a rule may not fit well.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setRulePickerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-2.5 py-1.5 text-[12.5px] font-medium text-paper hover:bg-ink-800"
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Set category rule
              </button>
            </div>
          )}
        </section>

        <section className="space-y-2.5">
          <SectionHeading>Transactions</SectionHeading>
          <div className="divide-y divide-ink-100 rounded-md border border-ink-100 bg-paper">
            {merchantTxns
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 50)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelected(t.id);
                    focusMerchant(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-ink-50/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink-800">
                      {t.description}
                    </div>
                    <div className="text-[11.5px] text-ink-400">
                      {t.date} · {t.category}
                    </div>
                  </div>
                  <div
                    className={`tabular shrink-0 text-[13px] ${
                      t.amount > 0 ? 'text-emerald-700' : 'text-ink-900'
                    }`}
                  >
                    {formatAmount(t.amount, { signed: true })}
                  </div>
                </button>
              ))}
          </div>
          {merchantTxns.length > 50 && (
            <p className="text-[11.5px] text-ink-400">
              Showing 50 most recent of {merchantTxns.length}.
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
      {children}
    </h3>
  );
}

function SetRulePicker({
  merchant,
  defaultCategory,
  isAmbiguous,
  count,
  onCancel,
  onConfirm,
}: {
  merchant: string;
  defaultCategory: Category | undefined;
  isAmbiguous: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: (c: Category) => void;
}) {
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState<Category>(
    defaultCategory ?? ALL_CATEGORIES[0]!,
  );
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
    if (filtered.length > 0 && !filtered.includes(highlight)) {
      setHighlight(filtered[0]!);
    }
  }, [filtered, highlight]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = filtered.indexOf(highlight);
      const next = filtered[Math.min(filtered.length - 1, idx + 1)] ?? highlight;
      setHighlight(next);
      scrollIntoView(listRef.current, next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = filtered.indexOf(highlight);
      const next = filtered[Math.max(0, idx - 1)] ?? highlight;
      setHighlight(next);
      scrollIntoView(listRef.current, next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(highlight);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="rounded-lg border border-ink-100 bg-paper p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-ink-900">
            Set a rule for {merchant}
          </h4>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Future {merchant} transactions will automatically use this
            category. Existing transactions will be updated too.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="relative mt-2">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
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
          className="w-full rounded-md border border-ink-100 bg-paper py-2 pl-8 pr-3 text-[13px] text-ink-900 outline-none focus:border-ink-200 focus:ring-2 focus:ring-accent-ring"
        />
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label="Categories"
        className="mt-2 max-h-[200px] overflow-y-auto scrollbar-thin rounded-md border border-ink-100"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12.5px] text-ink-400">
            No matching category
          </div>
        ) : (
          filtered.map((c) => {
            const active = c === highlight;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={active}
                data-cat={c}
                onMouseEnter={() => setHighlight(c)}
                onClick={() => onConfirm(c)}
                className={`flex w-full items-center justify-between gap-2 border-b border-ink-50 px-3 py-2 text-left text-[13px] last:border-b-0 ${
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-800 hover:bg-ink-50'
                }`}
              >
                <span>{c}</span>
                {active && (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            );
          })
        )}
      </div>
      {isAmbiguous && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-ink-500">
          <Sparkles
            className="mt-0.5 h-3 w-3 shrink-0"
            aria-hidden="true"
          />
          {merchant} transactions often span different categories. A rule may
          not fit well here.
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-ink-400">
          Will update {count} existing transaction{count === 1 ? '' : 's'}.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(highlight)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-accent-hover"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Set rule
          </button>
        </div>
      </div>
    </div>
  );
}

function scrollIntoView(container: HTMLElement | null, cat: Category) {
  const el = container?.querySelector<HTMLElement>(`[data-cat="${cat}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}

function categoryBreakdown(list: Transaction[]) {
  const m = new Map<Category, { count: number; total: number }>();
  for (const t of list) {
    const cur = m.get(t.category) ?? { count: 0, total: 0 };
    cur.count++;
    cur.total += t.amount < 0 ? -t.amount : 0;
    m.set(t.category, cur);
  }
  return Array.from(m.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.count - a.count);
}
