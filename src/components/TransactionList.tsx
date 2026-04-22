import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Inbox,
  List as ListIcon,
  Search,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { ListView } from '../store';
import { formatAmount } from '../lib/format';
import { useIsMobile } from '../hooks/useBreakpoint';
import { useVisibleTransactions } from '../hooks/useVisibleTransactions';
import { TransactionRow } from './TransactionRow';
import { ReceiptRequiredModal } from './ReceiptRequiredModal';
import type { Category, MerchantRule, Transaction } from '../types';

// Row columns. Merchant, Date, and Amount anchor the row at fixed
// proportions; the space between Date and Amount is split evenly
// between Category and Flags so the two middle columns read as a
// balanced pair. Proportions: Merchant 22 / Date 10 / Category 23 /
// Flags 23 / Amount 22. The checkbox gutter sits outside these.
export const ROW_GRID =
  'grid-cols-[28px_minmax(0,22fr)_minmax(0,10fr)_minmax(0,23fr)_minmax(0,23fr)_minmax(0,22fr)]';

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

type MerchantGroup = {
  merchant: string;
  txns: Transaction[];
  count: number;
  total: number;
  categories: Set<Category>;
  dominantCategory: Category;
  rule?: MerchantRule;
};

export function TransactionList() {
  const rules = useStore((s) => s.rules);
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const checkedIds = useStore((s) => s.checkedIds);
  const toggleChecked = useStore((s) => s.toggleChecked);
  const setAllChecked = useStore((s) => s.setAllChecked);
  const clearChecked = useStore((s) => s.clearChecked);
  const listView = useStore((s) => s.listView);
  const setListView = useStore((s) => s.setListView);
  const expandedMerchants = useStore((s) => s.expandedMerchants);
  const toggleMerchantExpanded = useStore((s) => s.toggleMerchantExpanded);
  const setMerchantExpanded = useStore((s) => s.setMerchantExpanded);
  const focusMerchant = useStore((s) => s.focusMerchant);
  const bulkRecategorise = useStore((s) => s.bulkRecategorise);
  const currentView = useStore((s) => s.currentView);
  const setCurrentView = useStore((s) => s.setCurrentView);
  const activeFilters = useStore((s) => s.activeFilters);
  const dateRange = useStore((s) => s.dateRange);
  const accountFilter = useStore((s) => s.accountFilter);
  const isMobile = useIsMobile();

  // A truly "caught up" state only applies when the user has no
  // narrowing filters active — otherwise an empty result means their
  // filter excluded everything, not that the inbox is clear, and
  // showing the green check + "See all transactions" would be
  // misleading. With filters active we fall back to the generic
  // "Nothing matches" copy.
  const categoryFilter = useStore((s) => s.categoryFilter);
  const searchQuery = useStore((s) => s.searchQuery);
  const hasNarrowingFilter =
    activeFilters.size > 0 ||
    dateRange !== 'all' ||
    accountFilter !== 'all' ||
    categoryFilter.size > 0 ||
    searchQuery.trim().length > 0;

  const visible = useVisibleTransactions();

  // Keep the selection in step with the visible list.
  //
  // Desktop/tablet: the detail panel lives beside the list, so there's
  // always meant to be one selected row — auto-pick the first available.
  //
  // Mobile: the detail is a takeover view. Auto-selecting on mount
  // would hijack the list on page load, and re-selecting after the
  // user taps Back would defeat the back button entirely. So on mobile
  // we only intervene when the current selection has filtered out, and
  // we clear it rather than advance — that drops the user back to the
  // list cleanly instead of shoving a random transaction in their face.
  useEffect(() => {
    if (isMobile) {
      if (selectedId && !visible.some((t) => t.id === selectedId)) {
        setSelected(null);
      }
      return;
    }
    if (!selectedId && visible.length > 0) {
      setSelected(visible[0]!.id);
    } else if (
      selectedId &&
      !visible.some((t) => t.id === selectedId) &&
      visible.length > 0
    ) {
      setSelected(visible[0]!.id);
    }
  }, [visible, selectedId, setSelected, isMobile]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (visible.length === 0) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      ) {
        return;
      }
      const idx = visible.findIndex((t) => t.id === selectedId);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(visible.length - 1, idx < 0 ? 0 : idx + 1);
        setSelected(visible[next]!.id);
        scrollRowIntoView(visible[next]!.id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.max(0, idx < 0 ? 0 : idx - 1);
        setSelected(visible[next]!.id);
        scrollRowIntoView(visible[next]!.id);
      } else if (e.key === ' ') {
        if (selectedId) {
          e.preventDefault();
          toggleChecked(selectedId);
        }
      } else if (e.key === 'Enter') {
        const btn = document.querySelector<HTMLButtonElement>(
          '[data-detail-primary]',
        );
        if (btn) {
          e.preventDefault();
          btn.focus();
        }
      } else if (e.key === 'Escape' && checkedIds.size > 0) {
        clearChecked();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selectedId, setSelected, toggleChecked, checkedIds, clearChecked]);

  const groups = useMemo(() => buildGroups(visible, rules), [visible, rules]);

  const visibleIds = useMemo(() => visible.map((v) => v.id), [visible]);
  const allChecked =
    visibleIds.length > 0 && visibleIds.every((id) => checkedIds.has(id));
  const someChecked = visibleIds.some((id) => checkedIds.has(id));

  const checkedCount = checkedIds.size;

  return (
    <section
      ref={containerRef}
      aria-label="Transactions to review"
      className="flex min-h-0 flex-1 flex-col"
    >
      <ListTopBar
        total={visible.length}
        listView={listView}
        onChangeView={setListView}
      />
      {checkedCount > 0 ? (
        <BulkActionBar
          count={checkedCount}
          checkedIds={[...checkedIds]}
          onClear={clearChecked}
          onRecategorise={(cat) => bulkRecategorise([...checkedIds], cat)}
        />
      ) : (
        <ListHeader
          allChecked={allChecked}
          someChecked={someChecked}
          onToggleAll={() => setAllChecked(visibleIds)}
          groupedMode={listView === 'merchant'}
        />
      )}

      {visible.length === 0 ? (
        <EmptyListState
          variant={
            currentView === 'to-review' && !hasNarrowingFilter
              ? 'caught-up'
              : 'no-matches'
          }
          onSeeAll={() => setCurrentView('all-transactions')}
        />
      ) : listView === 'merchant' ? (
        <MerchantGroupedList
          groups={groups}
          selectedId={selectedId}
          checkedIds={checkedIds}
          expandedMerchants={expandedMerchants}
          onToggleExpanded={toggleMerchantExpanded}
          onSetExpanded={setMerchantExpanded}
          onSelect={setSelected}
          onToggleCheck={toggleChecked}
          onFocusMerchant={focusMerchant}
        />
      ) : (
        <div
          role="listbox"
          aria-label="Transactions"
          tabIndex={0}
          className={`flex-1 overflow-y-auto scrollbar-thin ${
            // When the mobile batch CTA is floating over the list, pad
            // the bottom so the last row scrolls clear of the button.
            currentView === 'to-review' && activeFilters.has('needs-vat')
              ? 'pb-[96px] sm:pb-0'
              : ''
          }`}
        >
          {visible.map((t) => (
            <TransactionRow
              key={t.id}
              txn={t}
              selected={t.id === selectedId}
              checked={checkedIds.has(t.id)}
              onSelect={() => setSelected(t.id)}
              onToggleCheck={() => toggleChecked(t.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function buildGroups(
  list: Transaction[],
  rules: MerchantRule[],
): MerchantGroup[] {
  const map = new Map<string, MerchantGroup>();
  for (const t of list) {
    let g = map.get(t.merchant);
    if (!g) {
      g = {
        merchant: t.merchant,
        txns: [],
        count: 0,
        total: 0,
        categories: new Set<Category>(),
        dominantCategory: t.category,
        rule: rules.find((r) => r.merchant === t.merchant),
      };
      map.set(t.merchant, g);
    }
    g.txns.push(t);
    g.count++;
    g.total += t.amount < 0 ? -t.amount : 0;
    g.categories.add(t.category);
  }
  for (const g of map.values()) {
    // Pick most common category as dominant.
    const counts = new Map<Category, number>();
    for (const t of g.txns) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    let best: Category = g.txns[0]!.category;
    let bestN = 0;
    for (const [c, n] of counts) {
      if (n > bestN) {
        best = c;
        bestN = n;
      }
    }
    g.dominantCategory = best;
    g.txns.sort((a, b) => b.date.localeCompare(a.date));
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function MerchantGroupedList({
  groups,
  selectedId,
  checkedIds,
  expandedMerchants,
  onToggleExpanded,
  onSetExpanded,
  onSelect,
  onToggleCheck,
  onFocusMerchant,
}: {
  groups: MerchantGroup[];
  selectedId: string | null;
  checkedIds: Set<string>;
  expandedMerchants: Set<string>;
  onToggleExpanded: (m: string) => void;
  onSetExpanded: (m: string, expanded: boolean) => void;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onFocusMerchant: (m: string | null) => void;
}) {
  const setAllChecked = useStore((s) => s.setAllChecked);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {groups.map((g) => {
        const expanded = expandedMerchants.has(g.merchant);
        const ids = g.txns.map((t) => t.id);
        const allGroupChecked =
          ids.length > 0 && ids.every((id) => checkedIds.has(id));
        const someGroupChecked = ids.some((id) => checkedIds.has(id));
        const mixed = g.categories.size > 1;

        return (
          <div
            key={g.merchant}
            className="border-b border-ink-100 last:border-b-0"
          >
            <div className="flex items-center gap-3 bg-paper-muted px-6 py-2.5">
              {/* Checkbox column pinned to the same 28px width as the ROW_GRID
                  first column on the list header and the desktop rows inside
                  each expanded group, so checkboxes line up vertically across
                  all three rows. */}
              <div
                className="flex w-7 shrink-0 items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={allGroupChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allGroupChecked && someGroupChecked;
                  }}
                  onChange={() => setAllChecked(ids)}
                  aria-label={`Select all ${g.merchant} transactions`}
                  className="h-4 w-4 cursor-pointer rounded border-ink-200 text-accent focus:ring-accent-ring"
                />
              </div>

              <button
                type="button"
                onClick={() => onToggleExpanded(g.merchant)}
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${g.merchant}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-800"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onFocusMerchant(g.merchant)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-ink-900">
                    {g.merchant}
                  </span>
                  {g.rule && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800"
                      title={`Rule: ${g.merchant} → ${g.rule.category}`}
                    >
                      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                      Rule
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-ink-400">
                  {g.count} transaction{g.count === 1 ? '' : 's'}
                </div>
              </button>

              <div className="shrink-0 text-[12.5px] text-ink-600">
                {/* When merchants have mixed categories we leave the slot
                    blank rather than flagging it — the per-row categories
                    in the expanded group already tell that story without
                    the amber pill shouting about it. */}
                {mixed ? null : <span>{g.dominantCategory}</span>}
              </div>

              <div className="tabular w-[110px] shrink-0 text-right text-[13px] font-semibold text-ink-900">
                {formatAmount(-g.total)}
              </div>
            </div>

            {expanded && (
              <div role="list" aria-label={`${g.merchant} transactions`}>
                {g.txns.map((t) => (
                  <TransactionRow
                    key={t.id}
                    txn={t}
                    selected={t.id === selectedId}
                    checked={checkedIds.has(t.id)}
                    onSelect={() => onSelect(t.id)}
                    onToggleCheck={() => onToggleCheck(t.id)}
                  />
                ))}
              </div>
            )}

            {!expanded && (
              <button
                type="button"
                onClick={() => onSetExpanded(g.merchant, true)}
                className="block w-full border-t border-ink-100 bg-paper px-6 py-1.5 text-left text-[11.5px] text-ink-400 hover:bg-ink-50/50 hover:text-ink-700"
              >
                Show all {g.count} transaction{g.count === 1 ? '' : 's'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ListTopBar({
  total,
  listView,
  onChangeView,
}: {
  total: number;
  listView: ListView;
  onChangeView: (v: ListView) => void;
}) {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);

  return (
    <div className="flex flex-col gap-2 border-b border-ink-100 bg-paper px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
      <div className="flex items-center justify-between gap-3 sm:flex-1">
        <span className="shrink-0 text-[12px] font-medium text-ink-500">
          {total} transaction{total === 1 ? '' : 's'}
        </span>
        <ListSearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>
      <ViewToggle value={listView} onChange={onChangeView} />
    </div>
  );
}

/**
 * Free-text search over the visible list. Stacks with the chip filters
 * and secondary dropdowns — it narrows whatever the user has already
 * chosen rather than replacing it. Debouncing is left to the store;
 * the set is already O(n) over a ledger, so every keystroke is fine.
 */
function ListSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center sm:max-w-[360px]">
      <Search
        className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-400"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search merchant, description, amount"
        aria-label="Search transactions"
        className="w-full rounded-md border border-ink-100 bg-paper py-1.5 pl-8 pr-7 text-[13px] text-ink-800 placeholder:text-ink-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 grid h-5 w-5 place-items-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

function ListHeader({
  allChecked,
  someChecked,
  onToggleAll,
  groupedMode,
}: {
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  groupedMode: boolean;
}) {
  // Hidden on mobile — the card layout below has no fixed column model
  // so a header row would be meaningless. Visible from sm up where the
  // grid row aligns under these labels.
  return (
    <div
      className={`sticky top-0 z-10 hidden ${ROW_GRID} items-center gap-3 border-b border-ink-100 bg-paper-muted px-6 py-2.5 text-[11.5px] uppercase tracking-wide text-ink-400 sm:grid`}
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = !allChecked && someChecked;
          }}
          onChange={onToggleAll}
          aria-label="Select all visible transactions"
          className="h-4 w-4 cursor-pointer rounded border-ink-200 text-accent focus:ring-accent-ring"
        />
      </div>
      <div />
      <div>{groupedMode ? '' : 'Date'}</div>
      <div className="flex items-center gap-1">
        <span>Category</span>
        <ConfidenceLegend />
      </div>
      <div>Flags</div>
      <div className="text-right">Amount</div>
    </div>
  );
}

/**
 * Tiny hover/click popover that explains what the green / amber dots
 * next to each category mean. Positioned inline with the Category column
 * header so the legend is discoverable where users actually see the
 * dots. Keyboard-accessible, Esc-dismiss, outside-click-dismiss.
 */
function ConfidenceLegend() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        aria-label="Category confidence legend"
        aria-expanded={open}
        className="-m-1 grid h-6 w-6 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popRef}
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 w-[260px] rounded-lg border border-ink-100 bg-paper p-3 text-[12.5px] normal-case tracking-normal text-ink-700 shadow-panel"
        >
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
            Category confidence
          </p>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>
                <span className="font-medium text-ink-800">High.</span>{' '}
                Set by a rule or confirmed by you.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <span className="font-medium text-ink-800">Medium.</span>{' '}
                AI's best guess. Probably right, worth a glance.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-2 w-2 shrink-0 animate-pulse-soft rounded-full bg-red-500" aria-hidden="true" />
              <span>
                <span className="font-medium text-ink-800">Low.</span>{' '}
                AI isn't sure — please pick one.
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ListView;
  onChange: (v: ListView) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="List view"
      className="inline-flex items-center rounded-full border border-ink-100 bg-paper p-0.5"
    >
      <ToggleBtn
        active={value === 'flat'}
        onClick={() => onChange('flat')}
        icon={<ListIcon className="h-3 w-3" aria-hidden="true" />}
        label="List"
      />
      <ToggleBtn
        active={value === 'merchant'}
        onClick={() => onChange('merchant')}
        icon={<StoreIcon className="h-3 w-3" aria-hidden="true" />}
        label="By merchant"
      />
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11.5px] font-medium transition ${
        active
          ? 'bg-ink-900 text-paper shadow-sm'
          : 'text-ink-500 hover:text-ink-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function BulkActionBar({
  count,
  checkedIds,
  onClear,
  onRecategorise,
}: {
  count: number;
  checkedIds: string[];
  onClear: () => void;
  onRecategorise: (c: Category) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'recategorise' | 'personal'>(
    'idle',
  );
  const [receiptGateOpen, setReceiptGateOpen] = useState(false);
  const bulkMarkPersonal = useStore((s) => s.bulkMarkPersonal);
  const bulkSetReviewed = useStore((s) => s.bulkSetReviewed);
  const markReviewedWithoutReceipt = useStore(
    (s) => s.markReviewedWithoutReceipt,
  );
  const transactions = useStore((s) => s.transactions);

  // Only count non-personal targets for the confirmation copy, since
  // already-personal items would be a no-op.
  const eligibleForPersonal = useMemo(
    () =>
      transactions.filter((t) => checkedIds.includes(t.id) && !t.isPersonal)
        .length,
    [transactions, checkedIds],
  );

  // Derive review tallies from the selection. If the selection is mixed,
  // both "Mark reviewed" and "Unmark reviewed" show so the user can
  // resolve it in one click either way.
  const { reviewedCount, unreviewedCount } = useMemo(() => {
    const ids = new Set(checkedIds);
    let r = 0;
    let u = 0;
    for (const t of transactions) {
      if (!ids.has(t.id)) continue;
      if (t.reviewed) r++;
      else u++;
    }
    return { reviewedCount: r, unreviewedCount: u };
  }, [transactions, checkedIds]);

  // How many of the currently-selected rows are receipt-required but
  // have no receipt attached. Used to decide whether "Mark as reviewed"
  // needs the confirmation gate.
  const missingReceiptCount = useMemo(() => {
    const ids = new Set(checkedIds);
    let n = 0;
    for (const t of transactions) {
      if (!ids.has(t.id)) continue;
      if (t.reviewed) continue;
      if (t.receiptRequired && !t.receiptAttached) n++;
    }
    return n;
  }, [transactions, checkedIds]);

  const handleMarkReviewed = () => {
    if (missingReceiptCount > 0) {
      setReceiptGateOpen(true);
      return;
    }
    bulkSetReviewed(checkedIds, true);
  };

  return (
    <div className="sticky top-0 z-10 border-b border-ink-100 bg-accent-soft">
      <div className="flex items-center justify-between gap-3 px-6 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClear}
            className="text-[12.5px] font-medium text-accent underline-offset-2 hover:underline"
          >
            {count} selected · Clear
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === 'recategorise' ? 'idle' : 'recategorise'))
            }
            aria-expanded={mode === 'recategorise'}
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[12px] font-medium shadow-sm transition ${
              mode === 'recategorise'
                ? 'border-accent bg-accent text-white'
                : 'border-ink-100 bg-paper text-ink-700 hover:border-ink-200 hover:text-ink-900'
            }`}
          >
            Recategorise
          </button>
          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === 'personal' ? 'idle' : 'personal'))
            }
            aria-expanded={mode === 'personal'}
            disabled={eligibleForPersonal === 0}
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[12px] font-medium shadow-sm transition ${
              mode === 'personal'
                ? 'border-accent bg-accent text-white'
                : 'border-ink-100 bg-paper text-ink-700 hover:border-ink-200 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:border-ink-100 disabled:hover:text-ink-300'
            }`}
          >
            Mark personal
          </button>
          {unreviewedCount > 0 && (
            <button
              type="button"
              onClick={handleMarkReviewed}
              className="inline-flex items-center rounded-md border border-ink-100 bg-paper px-2.5 py-1 text-[12px] font-medium text-ink-700 shadow-sm hover:border-ink-200 hover:text-ink-900"
              title={
                reviewedCount > 0
                  ? `Mark ${unreviewedCount} unreviewed as reviewed (${reviewedCount} already reviewed will be skipped)`
                  : undefined
              }
            >
              Mark as reviewed
            </button>
          )}
          {reviewedCount > 0 && (
            <button
              type="button"
              onClick={() => bulkSetReviewed(checkedIds, false)}
              className="inline-flex items-center rounded-md border border-ink-100 bg-paper px-2.5 py-1 text-[12px] font-medium text-ink-700 shadow-sm hover:border-ink-200 hover:text-ink-900"
              title={
                unreviewedCount > 0
                  ? `Unmark ${reviewedCount} reviewed (${unreviewedCount} already unreviewed will be skipped)`
                  : undefined
              }
            >
              Unmark as reviewed
            </button>
          )}
        </div>
      </div>

      {mode === 'recategorise' && (
        <BulkRecategoriseRow
          count={count}
          onCancel={() => setMode('idle')}
          onConfirm={(cat) => {
            onRecategorise(cat);
            setMode('idle');
          }}
        />
      )}

      {mode === 'personal' && (
        <BulkMarkPersonalRow
          eligible={eligibleForPersonal}
          total={count}
          onCancel={() => setMode('idle')}
          onConfirm={(reason) => {
            bulkMarkPersonal(checkedIds, reason);
            setMode('idle');
          }}
        />
      )}

      <ReceiptRequiredModal
        open={receiptGateOpen}
        total={unreviewedCount}
        missingCount={missingReceiptCount}
        onUploadReceipt={() => {
          // The bulk flow can't resolve a batch of missing receipts by
          // opening a single uploader, so for now we just bail the user
          // back to the list with the gate closed. The "Missing receipts"
          // filter chip + per-row uploader is the intended path here; the
          // override button still works from inside the modal.
          setReceiptGateOpen(false);
        }}
        onMarkAnyway={() => {
          // Only flag the rows that actually needed a receipt; the rest
          // go through the ordinary reviewed path so they don't inherit
          // the override caveat unnecessarily.
          const missingIds = transactions
            .filter(
              (t) =>
                checkedIds.includes(t.id) &&
                !t.reviewed &&
                t.receiptRequired &&
                !t.receiptAttached,
            )
            .map((t) => t.id);
          const remainingIds = checkedIds.filter(
            (id) => !missingIds.includes(id),
          );
          if (remainingIds.length > 0) {
            bulkSetReviewed(remainingIds, true);
          }
          if (missingIds.length > 0) {
            markReviewedWithoutReceipt(missingIds);
          }
          setReceiptGateOpen(false);
        }}
        onCancel={() => setReceiptGateOpen(false)}
      />
    </div>
  );
}

function BulkMarkPersonalRow({
  eligible,
  total,
  onCancel,
  onConfirm,
}: {
  eligible: number;
  total: number;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const alreadyPersonal = total - eligible;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(reason);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="border-t border-accent/20 bg-paper px-6 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-800">
            Mark {eligible} transaction{eligible === 1 ? '' : 's'} as personal?
          </p>
          <p className="mt-0.5 text-[12px] text-ink-500">
            These will be excluded from your corporation tax calculation.
            {alreadyPersonal > 0 &&
              ` ${alreadyPersonal} already personal will be skipped.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <label className="mt-3 block">
        <span className="block text-[12px] text-ink-500">
          Reason (applies to all, optional)
        </span>
        <input
          ref={inputRef}
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. personal groceries, not office"
          className="mt-1 block w-full rounded-md border border-ink-200 bg-paper px-2.5 py-1.5 text-[13px] text-ink-800 placeholder:text-ink-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring"
        />
      </label>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11.5px] text-ink-400">
          You can undo within 15 seconds.
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-md border border-ink-100 bg-paper px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:border-ink-200 hover:text-ink-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            className="inline-flex items-center rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm hover:bg-accent-hover"
          >
            Mark as personal
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkRecategoriseRow({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: (c: Category) => void;
}) {
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState<Category>(ALL_CATEGORIES[0]!);
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
    <div className="border-t border-accent/20 bg-paper px-6 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-600">
          Set {count} transaction{count === 1 ? '' : 's'} to:
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="grid h-6 w-6 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
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
        className="mt-2 max-h-[220px] overflow-y-auto scrollbar-thin rounded-md border border-ink-100"
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
      <p className="mt-2 text-[11.5px] text-ink-400">
        Bulk changes don't create rules. You can undo within 15 seconds.
      </p>
    </div>
  );
}

function scrollIntoView(container: HTMLElement | null, cat: Category) {
  const el = container?.querySelector<HTMLElement>(`[data-cat="${cat}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}

function EmptyListState({
  variant,
  onSeeAll,
}: {
  variant: 'caught-up' | 'no-matches';
  onSeeAll: () => void;
}) {
  if (variant === 'caught-up') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <CheckCircle2
          className="h-8 w-8 text-emerald-500"
          aria-hidden="true"
        />
        <p className="text-[15px] font-semibold text-ink-900">
          You&rsquo;re all caught up
        </p>
        <p className="max-w-[320px] text-[13px] text-ink-500">
          No transactions waiting for review.
        </p>
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-1 inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink-200 bg-paper px-4 py-2 text-[13.5px] font-semibold text-ink-800 hover:border-ink-300 hover:bg-ink-50"
        >
          See all transactions
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <Inbox className="h-7 w-7 text-ink-300" aria-hidden="true" />
      <p className="text-[13.5px] font-medium text-ink-700">
        Nothing matches these filters
      </p>
      <p className="max-w-[320px] text-[12.5px] text-ink-400">
        Try removing a filter or widening the date range.
      </p>
    </div>
  );
}

function scrollRowIntoView(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-txn-id="${id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}
