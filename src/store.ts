import { create } from 'zustand';
import {
  INITIAL_RULES,
  transactions as seed,
  UK_TAX_YEAR_CURRENT_END,
  UK_TAX_YEAR_CURRENT_START,
  UK_TAX_YEAR_PREVIOUS_END,
  UK_TAX_YEAR_PREVIOUS_START,
} from './data/transactions';
import type {
  AccountFilter,
  Category,
  CategoryHistoryEntry,
  DateRangeKey,
  FilterKey,
  MerchantRule,
  PersonalExpenseNote,
  PersonalHistoryEntry,
  TaxYearKey,
  Transaction,
  VatEntryMethod,
  VatRate,
} from './types';

export type BatchState = {
  active: boolean;
  ids: string[];
  currentIndex: number;
  completedIds: Set<string>;
  /**
   * Ids the user deliberately skipped this batch. Tracked separately from
   * `completedIds` so the sidebar can render a distinct dashed-outline
   * marker and so we never auto-return to them on advance.
   */
  skippedIds: Set<string>;
  /**
   * Progress milestones (25, 50, 75) already shown this batch. Used to
   * ensure each calm milestone banner fires exactly once per session.
   */
  milestonesShown: Set<number>;
  /**
   * The most recent milestone triggered, for the inline banner to render
   * and auto-dismiss. Cleared by the banner after its dwell window.
   */
  activeMilestone: number | null;
  vatAddedTotal: number;
  vatAddedCount: number;
};

/** An entry in the session-scoped "Recently reviewed" list. */
export type ReviewedSessionEntry = {
  id: string;
  at: number;
};

/**
 * Ephemeral highlight entry for a just-recategorised row. The soft green
 * dwell lasts ~1.2s, then fades out over ~400ms before the entry is
 * cleared from state.
 */
export type RecentlyChangedEntry = {
  id: string;
  at: number;
};

export type YearEndDecision = 'personal' | 'business' | 'skip';

/**
 * Year-end corporation tax review mode. Like batch VAT in shape, but
 * without auto-advance — every item takes an explicit decision.
 */
export type YearEndState = {
  active: boolean;
  ids: string[];
  currentIndex: number;
  /** Decision recorded per txn id this session. */
  decisions: Map<string, YearEndDecision>;
  /** Ids whose decision was 'business' this session (shown in queue pill). */
  movedToBusiness: Set<string>;
};

/**
 * Undo snapshot for personal/business toggles and reason/review changes.
 * `inline` undo sits under the toggle for 8s; `snackbar` appears after a
 * bulk mark-as-personal.
 */
export type UndoablePersonalAction = {
  id: string;
  kind: 'inline' | 'snackbar';
  message: string;
  /** For inline undo, the specific txn the toggle happened on. */
  txnId?: string;
  snapshot: Array<{
    id: string;
    isPersonal: boolean;
    category: Category;
    reviewed: boolean;
    personalExpenseNote: PersonalExpenseNote | undefined;
    personalHistoryLength: number;
    categoryHistoryLength: number;
  }>;
  expiresAt: number;
};

export type ReceiptModalSource = 'detail' | 'batch';

export type ReceiptModalState = {
  open: boolean;
  txnId: string | null;
  source: ReceiptModalSource;
  /** True when the flow is replacing an existing receipt on the transaction. */
  replace: boolean;
  /**
   * Optional file supplied by the caller, e.g. from a drag-and-drop on the
   * detail panel receipt zone. When present, the modal skips the dropzone
   * stage and processes the file immediately on open. Cleared after
   * consumption so re-opens don't re-process.
   */
  pendingFile: File | null;
};

/**
 * Inline undo snapshot for a receipt removal. Lives under the (now empty)
 * receipt block for 8s, then clears. Reverting restores every cleared
 * field exactly as it was.
 */
export type UndoableReceiptRemoval = {
  id: string;
  txnId: string;
  message: string;
  snapshot: {
    receiptAttached: boolean;
    receiptFilename: string | undefined;
    receiptUploadedAt: string | undefined;
    receiptDataUrl: string | undefined;
    receiptMimeType: Transaction['receiptMimeType'];
  };
  expiresAt: number;
};

/** View mode for the main transaction list. */
export type ListView = 'flat' | 'merchant';

/**
 * Top-level view the app is scoped to. "To review" is the default inbox
 * (hides reviewed items). "All transactions" is the broader ledger with
 * reviewed items visible and an extra "Reviewed" filter chip.
 */
export type TopView = 'to-review' | 'all-transactions';

/**
 * Staged VAT answer for the inline detail-panel flow. Either captures a
 * rate + amount the user entered, or records a not-applicable choice. No
 * receipt-attachment path: that one still commits straight away because
 * the upload flow itself is the "Save" action.
 */
export type PendingVat =
  | { kind: 'record'; rate: VatRate; amount: number; method: VatEntryMethod }
  | { kind: 'not-applicable' };

/**
 * A snapshot for undoing the most recent recategorisation action.
 * We snapshot each touched transaction's pre-change state and, if the
 * action created a rule, the rule itself so we can roll it back cleanly.
 */
export type UndoableBulkAction = {
  id: string;
  /** User-facing message shown in the snackbar. */
  message: string;
  /** Previous values, keyed by txn id, for restoring on undo. */
  snapshot: Array<{
    id: string;
    category: Category;
    categorySource: Transaction['categorySource'];
    ruleId: string | undefined;
    categoryConfidence: Transaction['categoryConfidence'];
    aiSuggestedCategory: Transaction['aiSuggestedCategory'];
    aiReasoning: Transaction['aiReasoning'];
    categoryHistoryLength: number;
  }>;
  /** Rule created by this action; removed on undo. */
  createdRuleId?: string;
  /** Wall-clock time snackbar should auto-dismiss. */
  expiresAt: number;
};

/**
 * A soft prompt surfaced after a user recategorises a single transaction
 * from a merchant they've seen many times. Offers to promote the decision
 * into a rule so future transactions from that merchant land in the right
 * place automatically. Auto-dismisses; explicit accept creates the rule.
 */
export type RuleOffer = {
  id: string;
  merchant: string;
  fromCategory: Category;
  toCategory: Category;
  /** Wall-clock time the snackbar should auto-dismiss. */
  expiresAt: number;
};

type Store = {
  transactions: Transaction[];
  rules: MerchantRule[];

  activeFilters: Set<FilterKey>;
  /**
   * Secondary category-narrowing filter. Stacks with the primary chip
   * filters — so "Needs VAT" + {Travel, Meals} means "needs-VAT rows in
   * those two categories". Empty set = not narrowed.
   */
  categoryFilter: Set<Category>;
  /**
   * Free-text query matched against merchant, description, category and
   * amount. Trim-and-lowercase comparison; empty = no filter.
   */
  searchQuery: string;
  dateRange: DateRangeKey;
  /**
   * Inclusive start/end for the custom date range picker. Only consulted
   * when `dateRange === 'custom'`. Stored as ISO date-only strings
   * (yyyy-mm-dd) to match the native `<input type="date">` value format.
   */
  customDateRange: { start: string; end: string } | null;
  accountFilter: AccountFilter;

  selectedId: string | null;
  checkedIds: Set<string>;

  listView: ListView;
  /**
   * Top-level view: "To review" is the default inbox (hides reviewed items);
   * "All transactions" is the broader ledger with reviewed items visible
   * and an extra "Reviewed" filter chip.
   */
  currentView: TopView;
  /** Merchants whose groups are currently expanded in "By merchant" view. */
  expandedMerchants: Set<string>;
  /** If set, a merchant detail overlay replaces the transaction detail. */
  focusedMerchant: string | null;

  batch: BatchState;
  receiptModal: ReceiptModalState;

  /** Most recent bulk action available for undo, or null. */
  undoable: UndoableBulkAction | null;
  /** Most recent personal-flow undo (inline or snackbar). */
  personalUndo: UndoablePersonalAction | null;
  /** Inline undo for the most recent receipt removal (8s). */
  receiptUndo: UndoableReceiptRemoval | null;
  /**
   * Transient offer to promote a single-transaction recategorisation into
   * a merchant rule. Null when no offer is currently pending.
   */
  ruleOffer: RuleOffer | null;
  /** True when the Rules management modal is visible. */
  rulesModalOpen: boolean;

  /** Which tax year the personal filter is scoped to. Defaults to previous. */
  personalTaxYear: TaxYearKey;

  yearEnd: YearEndState;

  /**
   * Session-scoped list of transactions the user has marked reviewed
   * during this browser session (newest first, capped at a small limit).
   * Powers the "Recently reviewed" popover in the detail header and
   * batch header. Cleared on reload.
   */
  reviewedSession: ReviewedSessionEntry[];
  /**
   * Ephemeral post-recategorisation highlights. Rows render a soft green
   * tint for ~1.2s dwell then fade over ~400ms before the entry is
   * cleared. Keyed on txn id + timestamp so a rapid re-change refreshes
   * the pulse.
   */
  recentlyChangedIds: RecentlyChangedEntry[];
  /**
   * Staged-but-not-committed VAT answers for the detail panel (inline
   * flow). The user clicks "Save VAT amount" to capture their input, but
   * we hold it here rather than mutating the transaction, so the txn stays
   * in the "To review" inbox until the user explicitly clicks "Mark as
   * reviewed". Commit runs via `commitPendingVat` (or transparently
   * through `toggleReviewed`) and flushes the pending record into the
   * transaction.
   *
   * Not used by the batch Reviewing VAT flow — that one commits straight
   * away because advance-on-save is the whole point of batch mode.
   */
  pendingVat: Record<string, PendingVat>;

  toggleFilter: (f: FilterKey) => void;
  toggleCategoryFilter: (c: Category) => void;
  clearCategoryFilter: () => void;
  setSearchQuery: (q: string) => void;
  clearFilters: () => void;
  setDateRange: (d: DateRangeKey) => void;
  /** Update the custom start/end (also forces dateRange to 'custom'). */
  setCustomDateRange: (start: string, end: string) => void;
  setAccountFilter: (a: AccountFilter) => void;

  setSelected: (id: string | null) => void;
  setListView: (v: ListView) => void;
  /**
   * Switch the top-level view. Also clears selection + checked set + any
   * focused merchant overlay so the new view starts clean.
   */
  setCurrentView: (v: TopView) => void;
  toggleMerchantExpanded: (merchant: string) => void;
  setMerchantExpanded: (merchant: string, expanded: boolean) => void;
  focusMerchant: (merchant: string | null) => void;

  toggleChecked: (id: string) => void;
  clearChecked: () => void;
  setAllChecked: (ids: string[]) => void;

  togglePersonal: (id: string) => void;

  setPersonalTaxYear: (key: TaxYearKey) => void;

  /**
   * Flip a transaction to personal. Appends personalHistory, clears any
   * AI suggestion (the user has asserted intent), and stages an inline undo.
   */
  markPersonal: (
    id: string,
    opts?: {
      source?: PersonalHistoryEntry['source'];
      reason?: string;
    },
  ) => void;

  /**
   * Flip a transaction back to business. Restores a sensible default
   * category (last non-personal category from history, else a fallback).
   * Appends personalHistory.
   */
  markBusiness: (
    id: string,
    opts?: {
      source?: PersonalHistoryEntry['source'];
      toCategory?: Category;
    },
  ) => void;

  /** Bulk mark a set of txns as personal. Shows a snackbar undo. */
  bulkMarkPersonal: (ids: string[], reason?: string) => void;

  /** Write or clear a personal-expense reason. */
  setPersonalReason: (id: string, reason: string) => void;

  /** Check or uncheck "Reviewed for corp tax" on a personal txn. */
  setReviewedForCorpTax: (id: string, reviewed: boolean) => void;

  undoLastPersonal: () => void;
  dismissPersonalUndo: () => void;

  startYearEnd: (ids: string[]) => void;
  exitYearEnd: () => void;
  yearEndDecide: (id: string, decision: YearEndDecision) => void;
  yearEndAdvance: () => void;
  yearEndJumpTo: (index: number) => void;

  saveVat: (
    id: string,
    input: { rate: VatRate; amount: number; method: VatEntryMethod },
  ) => void;
  removeVat: (id: string) => void;
  markNotVatEligible: (id: string) => void;
  /**
   * Stage a VAT answer (either recorded amount or not-applicable) for the
   * detail panel flow. Holds the input in `pendingVat` without touching
   * the transaction — flushed by `commitPendingVat` or implicitly on
   * `toggleReviewed`.
   */
  setPendingVat: (id: string, pending: PendingVat) => void;
  /** Discard a staged VAT answer and return the detail panel to entry mode. */
  clearPendingVat: (id: string) => void;
  /**
   * Flush any staged VAT answer for `id` into the transaction and drop
   * the pending record. No-op when nothing is staged. Used by
   * `toggleReviewed` and by any explicit commit path.
   */
  commitPendingVat: (id: string) => void;
  attachReceipt: (
    id: string,
    args: {
      filename: string;
      mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
      dataUrl?: string;
    },
  ) => void;
  /**
   * Remove an attached receipt. Clears receipt fields but keeps VAT. Pushes
   * a snapshot so the inline "Undo" in the detail panel can restore it.
   */
  removeReceipt: (id: string) => void;
  /** Restore the receipt fields cleared by the most recent removeReceipt. */
  undoRemoveReceipt: () => void;
  /** Dismiss the receipt-removal undo without reverting. */
  dismissReceiptUndo: () => void;

  startBatch: (ids: string[]) => void;
  exitBatch: () => void;
  advanceBatch: () => void;
  /**
   * Deliberately skip the current batch item. Marks its id in
   * `skippedIds` so the sidebar renders a distinct dashed-outline marker,
   * and advances to the next unfinished item.
   */
  skipCurrentBatch: () => void;
  jumpBatchTo: (index: number) => void;
  /** Clear the just-triggered milestone so the banner dismisses. */
  dismissBatchMilestone: () => void;

  openReceiptModal: (
    txnId: string,
    source: ReceiptModalSource,
    opts?: { replace?: boolean; pendingFile?: File | null },
  ) => void;
  closeReceiptModal: () => void;
  /**
   * Clear a consumed `pendingFile` after the modal has handed it off to the
   * processing stage, so subsequent re-opens start at the dropzone.
   */
  consumeReceiptPendingFile: () => void;

  /**
   * Change a single transaction's category. Does NOT show the "Apply to other?"
   * panel; the caller decides whether to show it (based on the old vs new
   * category and how many other transactions share the merchant).
   */
  changeCategory: (id: string, to: Category) => void;

  /**
   * Apply a category change to every other past transaction from `merchant`
   * currently categorised as `fromCategory`. Creates a rule if `createRule`
   * is true. Does not touch the already-changed pivot transaction.
   */
  applyToPastForMerchant: (args: {
    pivotId: string;
    merchant: string;
    fromCategory: Category;
    toCategory: Category;
    createRule: boolean;
  }) => void;

  /** Bulk recategorise an explicit set of transactions (no rule). */
  bulkRecategorise: (ids: string[], toCategory: Category) => void;

  /**
   * Create a rule for `merchant` and apply `toCategory` to every non-personal
   * transaction from that merchant (regardless of current category).
   */
  setRuleForMerchant: (merchant: string, toCategory: Category) => void;
  /**
   * Create a merchant rule from the RulesModal "New rule" form. When
   * `applyToExisting` is true this funnels through the same retro-apply
   * path as recategorising from a transaction; when false, we only push
   * the rule so future transactions land in the chosen category.
   */
  createMerchantRule: (
    merchant: string,
    toCategory: Category,
    opts: { applyToExisting: boolean },
  ) => void;
  /**
   * Surface a soft "Always categorise X as Y?" snackbar after a single-row
   * recategorisation. Callers decide eligibility (past txn count, missing
   * rule, non-ambiguous merchant). Auto-expires after 8s.
   */
  offerRule: (args: {
    merchant: string;
    fromCategory: Category;
    toCategory: Category;
  }) => void;
  /** Dismiss a pending rule offer without creating the rule. */
  dismissRuleOffer: () => void;
  /**
   * Accept the pending rule offer: create a new merchant rule pointing at
   * the new category, without retroactively rewriting existing
   * transactions (the user explicitly picked "Just this one").
   */
  acceptRuleOffer: () => void;

  /** Undo the most recent bulk action. */
  undoLastBulk: () => void;
  /** Dismiss the undo snackbar without reverting. */
  dismissUndo: () => void;

  /** Remove a rule; does not change existing transactions but clears their ruleId. */
  removeRule: (ruleId: string) => void;

  setRulesModalOpen: (open: boolean) => void;

  /**
   * Mark a transaction as reviewed (or unmark it). Reviewed transactions
   * are hidden from the "To review" view and counted only in the
   * "All transactions" denominator.
   */
  toggleReviewed: (id: string, reviewed?: boolean) => void;

  /**
   * Bulk-apply a reviewed state to a set of transactions. Clears the
   * checked set on completion so the next selection is a fresh one.
   */
  bulkSetReviewed: (ids: string[], reviewed: boolean) => void;
  /**
   * Mark one or more transactions as reviewed while explicitly skipping
   * the receipt-required check. Sets `reviewedWithoutReceipt` on each so
   * the deliberate override is discoverable after the fact (and the flag
   * clears automatically if a receipt is attached later).
   */
  markReviewedWithoutReceipt: (ids: string[]) => void;

  /** Clear the "recently changed" pulse for a given txn id. */
  clearRecentlyChanged: (id: string) => void;
};

const emptyBatch: BatchState = {
  active: false,
  ids: [],
  currentIndex: 0,
  completedIds: new Set<string>(),
  skippedIds: new Set<string>(),
  milestonesShown: new Set<number>(),
  activeMilestone: null,
  vatAddedTotal: 0,
  vatAddedCount: 0,
};

/** Maximum entries in the session-scoped reviewed list. */
const REVIEWED_SESSION_CAP = 10;

/**
 * Prepend entries for `ids` to the session list, newest first, dedup'd
 * against the existing list, capped.
 */
function pushReviewedSession(
  current: ReviewedSessionEntry[],
  ids: string[],
): ReviewedSessionEntry[] {
  if (ids.length === 0) return current;
  const now = Date.now();
  const seen = new Set(ids);
  const remainder = current.filter((e) => !seen.has(e.id));
  const fresh = ids.map((id) => ({ id, at: now }));
  return [...fresh, ...remainder].slice(0, REVIEWED_SESSION_CAP);
}

/**
 * Detect the first milestone (25/50/75) crossed by `nextDone` given the
 * previous completion count and total, excluding milestones already
 * shown this batch. Returns null if no new crossing.
 */
function nextMilestone(
  prevDone: number,
  nextDone: number,
  total: number,
  shown: ReadonlySet<number>,
): number | null {
  if (total === 0) return null;
  const prevPct = (prevDone / total) * 100;
  const nextPct = (nextDone / total) * 100;
  for (const m of [25, 50, 75]) {
    if (shown.has(m)) continue;
    if (prevPct < m && nextPct >= m && nextPct < 100) return m;
  }
  return null;
}

const emptyYearEnd: YearEndState = {
  active: false,
  ids: [],
  currentIndex: 0,
  decisions: new Map<string, YearEndDecision>(),
  movedToBusiness: new Set<string>(),
};

const PERSONAL_SNACKBAR_UNDO_MS = 15_000;

/**
 * Sensible fallback when returning a transaction to business. Try the
 * recorded history first; then look at other non-personal transactions
 * from the same merchant (if the user's Figma charges are all Software
 * subscriptions, a personal-flagged Figma moving back to business should
 * also be Software subscriptions). Otherwise fall back to a generic
 * category the user is guaranteed to see in their list.
 */
function inferBusinessCategory(
  t: Transaction,
  all: Transaction[],
): Category {
  const history = t.categoryHistory ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]!;
    if (entry.from !== 'Personal') return entry.from;
    if (entry.to !== 'Personal') return entry.to;
  }
  const sibling = all.find((x) => x.merchant === t.merchant && !x.isPersonal);
  if (sibling) return sibling.category;
  return 'Office supplies';
}

function snapshotPersonal(
  t: Transaction,
): UndoablePersonalAction['snapshot'][number] {
  return {
    id: t.id,
    isPersonal: t.isPersonal,
    category: t.category,
    reviewed: t.reviewed,
    personalExpenseNote: t.personalExpenseNote,
    personalHistoryLength: t.personalHistory?.length ?? 0,
    categoryHistoryLength: t.categoryHistory?.length ?? 0,
  };
}

function updateTxn(
  list: Transaction[],
  id: string,
  patch: Partial<Transaction>,
): Transaction[] {
  return list.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

function makeHistoryEntry(
  from: Category,
  to: Category,
  source: CategoryHistoryEntry['source'],
): CategoryHistoryEntry {
  return {
    from,
    to,
    changedAt: new Date().toISOString(),
    source,
  };
}

function snapshotTxn(t: Transaction): UndoableBulkAction['snapshot'][number] {
  return {
    id: t.id,
    category: t.category,
    categorySource: t.categorySource,
    ruleId: t.ruleId,
    categoryConfidence: t.categoryConfidence,
    aiSuggestedCategory: t.aiSuggestedCategory,
    aiReasoning: t.aiReasoning,
    categoryHistoryLength: t.categoryHistory?.length ?? 0,
  };
}

const UNDO_WINDOW_MS = 15_000;

function aOrAn(name: string): string {
  return /^[aeiou]/i.test(name.trim()) ? 'an' : 'a';
}

/**
 * Start/end iso date pair for a given tax-year selection. 'all' is
 * represented with open-ended bounds.
 */
export function taxYearRange(key: TaxYearKey): { start: string; end: string } {
  if (key === 'current') {
    return { start: UK_TAX_YEAR_CURRENT_START, end: UK_TAX_YEAR_CURRENT_END };
  }
  if (key === 'previous') {
    return { start: UK_TAX_YEAR_PREVIOUS_START, end: UK_TAX_YEAR_PREVIOUS_END };
  }
  return { start: '0000-01-01', end: '9999-12-31' };
}

/** Human label for each tax-year selection, shown in the filter. */
export function taxYearLabel(key: TaxYearKey): string {
  if (key === 'current') return '2026/27 tax year';
  if (key === 'previous') return '2025/26 tax year';
  return 'All time';
}

/** Personal transactions filtered by tax-year selection. */
export function selectPersonalForTaxYear(
  transactions: Transaction[],
  key: TaxYearKey,
): Transaction[] {
  const { start, end } = taxYearRange(key);
  return transactions.filter(
    (t) => t.isPersonal && t.date >= start && t.date <= end,
  );
}

export const useStore = create<Store>((set, get) => ({
  transactions: seed,
  rules: INITIAL_RULES,

  activeFilters: new Set<FilterKey>(),
  categoryFilter: new Set<Category>(),
  searchQuery: '',
  dateRange: 'all',
  customDateRange: null,
  accountFilter: 'all',

  selectedId: null,
  checkedIds: new Set<string>(),

  listView: 'flat',
  currentView: 'to-review',
  expandedMerchants: new Set<string>(),
  focusedMerchant: null,

  batch: emptyBatch,
  receiptModal: {
    open: false,
    txnId: null,
    source: 'detail',
    replace: false,
    pendingFile: null,
  },

  undoable: null,
  personalUndo: null,
  receiptUndo: null,
  ruleOffer: null,
  rulesModalOpen: false,

  personalTaxYear: 'previous',
  yearEnd: emptyYearEnd,

  reviewedSession: [],
  recentlyChangedIds: [],
  pendingVat: {},

  toggleFilter: (f) =>
    set((s) => {
      const next = new Set(s.activeFilters);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return { activeFilters: next };
    }),

  toggleCategoryFilter: (c) =>
    set((s) => {
      const next = new Set(s.categoryFilter);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { categoryFilter: next };
    }),

  clearCategoryFilter: () =>
    set(() => ({ categoryFilter: new Set<Category>() })),

  setSearchQuery: (q) => set(() => ({ searchQuery: q })),

  clearFilters: () =>
    set(() => ({
      activeFilters: new Set<FilterKey>(),
      categoryFilter: new Set<Category>(),
      searchQuery: '',
      dateRange: 'all' as DateRangeKey,
      customDateRange: null,
      accountFilter: 'all' as AccountFilter,
    })),

  setDateRange: (d) =>
    set((s) => {
      if (d !== 'custom') return { dateRange: d };
      // Seed a sensible default range when flipping into custom for the
      // first time: last 30 days ending today. User can adjust from there.
      if (s.customDateRange) return { dateRange: d };
      const today = new Date('2026-04-18T12:00:00Z');
      const end = today.toISOString().slice(0, 10);
      const startDate = new Date(today);
      startDate.setUTCDate(startDate.getUTCDate() - 30);
      const start = startDate.toISOString().slice(0, 10);
      return { dateRange: d, customDateRange: { start, end } };
    }),

  setCustomDateRange: (start, end) =>
    set(() => ({
      dateRange: 'custom' as DateRangeKey,
      customDateRange: { start, end },
    })),

  setAccountFilter: (a) => set(() => ({ accountFilter: a })),

  setSelected: (id) => set(() => ({ selectedId: id })),

  setListView: (v) =>
    set(() =>
      // Leaving By-merchant clears the focused merchant overlay.
      v === 'flat'
        ? { listView: v, focusedMerchant: null }
        : { listView: v },
    ),

  setCurrentView: (v) =>
    set((s) => {
      if (s.currentView === v) return {};
      // Fresh slate on switch: clear selection, bulk checks, any merchant
      // overlay, and the "Reviewed" filter (only valid in all-transactions).
      const nextFilters = new Set(s.activeFilters);
      if (v === 'to-review') nextFilters.delete('reviewed');
      return {
        currentView: v,
        selectedId: null,
        checkedIds: new Set<string>(),
        focusedMerchant: null,
        activeFilters: nextFilters,
      };
    }),

  toggleMerchantExpanded: (merchant) =>
    set((s) => {
      const next = new Set(s.expandedMerchants);
      if (next.has(merchant)) next.delete(merchant);
      else next.add(merchant);
      return { expandedMerchants: next };
    }),

  setMerchantExpanded: (merchant, expanded) =>
    set((s) => {
      const next = new Set(s.expandedMerchants);
      if (expanded) next.add(merchant);
      else next.delete(merchant);
      return { expandedMerchants: next };
    }),

  focusMerchant: (merchant) => set(() => ({ focusedMerchant: merchant })),

  toggleChecked: (id) =>
    set((s) => {
      const next = new Set(s.checkedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { checkedIds: next };
    }),

  clearChecked: () => set(() => ({ checkedIds: new Set<string>() })),

  setAllChecked: (ids) =>
    set((s) => {
      const allIn = ids.every((id) => s.checkedIds.has(id));
      if (allIn) {
        const next = new Set(s.checkedIds);
        for (const id of ids) next.delete(id);
        return { checkedIds: next };
      }
      const next = new Set(s.checkedIds);
      for (const id of ids) next.add(id);
      return { checkedIds: next };
    }),

  togglePersonal: (id) =>
    set((s) => ({
      transactions: updateTxn(s.transactions, id, {
        isPersonal: !s.transactions.find((t) => t.id === id)?.isPersonal,
      }),
    })),

  saveVat: (id, { rate, amount, method }) =>
    set((s) => {
      const clean = Math.max(0, Math.round(amount * 100) / 100);
      let nextBatch = s.batch;
      if (s.batch.active && s.batch.ids.includes(id)) {
        const wasDone = s.batch.completedIds.has(id);
        const prevDone = s.batch.completedIds.size;
        const completedIds = new Set([...s.batch.completedIds, id]);
        const nextDone = completedIds.size;
        // Un-skip if this item had been skipped earlier — recording VAT
        // supersedes the skip state.
        const skippedIds = new Set(s.batch.skippedIds);
        skippedIds.delete(id);
        // Pick the first as-yet-unshown milestone the newly-completed
        // count crosses. 100% is intentionally excluded: the completion
        // screen already fills that role.
        const milestone = nextMilestone(
          prevDone,
          nextDone,
          s.batch.ids.length,
          s.batch.milestonesShown,
        );
        const milestonesShown = milestone
          ? new Set([...s.batch.milestonesShown, milestone])
          : s.batch.milestonesShown;
        nextBatch = {
          ...s.batch,
          completedIds,
          skippedIds,
          milestonesShown,
          activeMilestone: milestone ?? s.batch.activeMilestone,
          vatAddedCount: wasDone
            ? s.batch.vatAddedCount
            : s.batch.vatAddedCount + 1,
          vatAddedTotal: wasDone
            ? s.batch.vatAddedTotal
            : s.batch.vatAddedTotal + clean,
        };
      }
      return {
        transactions: updateTxn(s.transactions, id, {
          vatStatus: 'recorded',
          vatRate: rate,
          vatAmount: clean,
          vatEntryMethod: method,
          vatEnteredAt: new Date().toISOString(),
        }),
        batch: nextBatch,
      };
    }),

  removeVat: (id) =>
    set((s) => ({
      transactions: updateTxn(s.transactions, id, {
        vatStatus: 'needs-vat',
        vatAmount: undefined,
        vatRate: undefined,
        vatEntryMethod: undefined,
        vatEnteredAt: undefined,
      }),
    })),

  markNotVatEligible: (id) =>
    set((s) => {
      let nextBatch = s.batch;
      if (s.batch.active && s.batch.ids.includes(id)) {
        const prevDone = s.batch.completedIds.size;
        const completedIds = new Set([...s.batch.completedIds, id]);
        const nextDone = completedIds.size;
        const skippedIds = new Set(s.batch.skippedIds);
        skippedIds.delete(id);
        const milestone = nextMilestone(
          prevDone,
          nextDone,
          s.batch.ids.length,
          s.batch.milestonesShown,
        );
        const milestonesShown = milestone
          ? new Set([...s.batch.milestonesShown, milestone])
          : s.batch.milestonesShown;
        nextBatch = {
          ...s.batch,
          completedIds,
          skippedIds,
          milestonesShown,
          activeMilestone: milestone ?? s.batch.activeMilestone,
        };
      }
      return {
        transactions: updateTxn(s.transactions, id, {
          vatStatus: 'not-applicable',
          vatAmount: undefined,
          vatRate: undefined,
          vatEntryMethod: undefined,
          vatEnteredAt: new Date().toISOString(),
        }),
        batch: nextBatch,
      };
    }),

  setPendingVat: (id, pending) =>
    set((s) => ({ pendingVat: { ...s.pendingVat, [id]: pending } })),

  clearPendingVat: (id) =>
    set((s) => {
      if (!(id in s.pendingVat)) return {} as Partial<Store>;
      const next = { ...s.pendingVat };
      delete next[id];
      return { pendingVat: next };
    }),

  commitPendingVat: (id) => {
    const pending = get().pendingVat[id];
    if (!pending) return;
    // Flush through the same committed-state paths the batch flow uses so
    // everything downstream (reviewedSession, milestones, etc.) stays
    // consistent regardless of which flow staged the answer.
    if (pending.kind === 'record') {
      get().saveVat(id, {
        rate: pending.rate,
        amount: pending.amount,
        method: pending.method,
      });
    } else {
      get().markNotVatEligible(id);
    }
    get().clearPendingVat(id);
  },

  // Deliberately touches receipt fields only. Upload must NOT move a txn out
  // of "To review" — only toggleReviewed does that.
  attachReceipt: (id, args) =>
    set((s) => ({
      transactions: updateTxn(s.transactions, id, {
        receiptAttached: true,
        receiptFilename: args.filename,
        receiptMimeType: args.mimeType,
        receiptDataUrl: args.dataUrl,
        receiptUploadedAt: new Date().toISOString(),
        // If this row had been reviewed-without-receipt, attaching one
        // retroactively clears the caveat: the record is now complete.
        reviewedWithoutReceipt: false,
      }),
      // If a removal undo was pending, clear it: a fresh attach supersedes it.
      receiptUndo: null,
    })),

  removeReceipt: (id) =>
    set((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t || !t.receiptAttached) return {};
      const undo: UndoableReceiptRemoval = {
        id: `receipt-undo-${Date.now()}`,
        txnId: id,
        message: 'Receipt removed',
        snapshot: {
          receiptAttached: t.receiptAttached,
          receiptFilename: t.receiptFilename,
          receiptUploadedAt: t.receiptUploadedAt,
          receiptDataUrl: t.receiptDataUrl,
          receiptMimeType: t.receiptMimeType,
        },
        // 8s inline undo window, consistent with the personal inline undo.
        expiresAt: Date.now() + 8_000,
      };
      return {
        transactions: updateTxn(s.transactions, id, {
          receiptAttached: false,
          receiptFilename: undefined,
          receiptUploadedAt: undefined,
          receiptDataUrl: undefined,
          receiptMimeType: undefined,
        }),
        receiptUndo: undo,
      };
    }),

  undoRemoveReceipt: () => {
    const u = get().receiptUndo;
    if (!u) return;
    set((s) => ({
      transactions: updateTxn(s.transactions, u.txnId, {
        receiptAttached: u.snapshot.receiptAttached,
        receiptFilename: u.snapshot.receiptFilename,
        receiptUploadedAt: u.snapshot.receiptUploadedAt,
        receiptDataUrl: u.snapshot.receiptDataUrl,
        receiptMimeType: u.snapshot.receiptMimeType,
      }),
      receiptUndo: null,
    }));
  },

  dismissReceiptUndo: () => set(() => ({ receiptUndo: null })),

  startBatch: (ids) =>
    set(() => ({
      batch: {
        active: true,
        ids,
        currentIndex: 0,
        completedIds: new Set<string>(),
        skippedIds: new Set<string>(),
        milestonesShown: new Set<number>(),
        activeMilestone: null,
        vatAddedCount: 0,
        vatAddedTotal: 0,
      },
      selectedId: ids[0] ?? null,
      checkedIds: new Set<string>(),
    })),

  exitBatch: () => set(() => ({ batch: emptyBatch })),

  advanceBatch: () =>
    set((s) => {
      if (!s.batch.active) return {};
      let i = s.batch.currentIndex + 1;
      // Skip anything already completed; skipped items are still walkable
      // (the user may want to revisit), so we only skip past completions.
      while (
        i < s.batch.ids.length &&
        s.batch.completedIds.has(s.batch.ids[i]!)
      ) {
        i++;
      }
      const nextIndex = Math.min(i, s.batch.ids.length);
      const nextId =
        nextIndex < s.batch.ids.length ? s.batch.ids[nextIndex]! : null;
      return {
        batch: { ...s.batch, currentIndex: nextIndex },
        selectedId: nextId ?? s.selectedId,
      };
    }),

  skipCurrentBatch: () =>
    set((s) => {
      if (!s.batch.active) return {};
      const currentId = s.batch.ids[s.batch.currentIndex];
      // Walk forward past completed items. Skipped items are left
      // walkable so the user can revisit; the sidebar marks them
      // with a distinct dashed-outline chip.
      let i = s.batch.currentIndex + 1;
      while (
        i < s.batch.ids.length &&
        s.batch.completedIds.has(s.batch.ids[i]!)
      ) {
        i++;
      }
      const nextIndex = Math.min(i, s.batch.ids.length);
      const nextId =
        nextIndex < s.batch.ids.length ? s.batch.ids[nextIndex]! : null;
      const skippedIds = currentId
        ? new Set([...s.batch.skippedIds, currentId])
        : s.batch.skippedIds;
      return {
        batch: { ...s.batch, currentIndex: nextIndex, skippedIds },
        selectedId: nextId ?? s.selectedId,
      };
    }),

  dismissBatchMilestone: () =>
    set((s) =>
      s.batch.active
        ? { batch: { ...s.batch, activeMilestone: null } }
        : {},
    ),

  jumpBatchTo: (index) =>
    set((s) => {
      if (!s.batch.active) return {};
      const safe = Math.max(0, Math.min(s.batch.ids.length - 1, index));
      const id = s.batch.ids[safe];
      return {
        batch: { ...s.batch, currentIndex: safe },
        selectedId: id ?? s.selectedId,
      };
    }),

  openReceiptModal: (txnId, source, opts) =>
    set(() => ({
      receiptModal: {
        open: true,
        txnId,
        source,
        replace: opts?.replace ?? false,
        pendingFile: opts?.pendingFile ?? null,
      },
    })),

  closeReceiptModal: () =>
    set((s) => ({
      receiptModal: { ...s.receiptModal, open: false, pendingFile: null },
    })),

  consumeReceiptPendingFile: () =>
    set((s) => ({
      receiptModal: { ...s.receiptModal, pendingFile: null },
    })),

  changeCategory: (id, to) =>
    set((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t || t.category === to) return {};
      const entry = makeHistoryEntry(t.category, to, 'manual');
      return {
        transactions: updateTxn(s.transactions, id, {
          category: to,
          categorySource: 'manual',
          ruleId: undefined,
          // A user-chosen category should be trusted; drop "AI unsure" state.
          categoryConfidence: 'high',
          aiSuggestedCategory: undefined,
          aiReasoning: undefined,
          categoryHistory: [...(t.categoryHistory ?? []), entry],
        }),
        // Soft green dwell on the row for ~1.2s + fade. Entry cleared by
        // a setTimeout in the consumer component once the animation ends.
        recentlyChangedIds: [
          { id, at: Date.now() },
          ...s.recentlyChangedIds.filter((e) => e.id !== id),
        ],
      };
    }),

  clearRecentlyChanged: (id) =>
    set((s) => ({
      recentlyChangedIds: s.recentlyChangedIds.filter((e) => e.id !== id),
    })),

  applyToPastForMerchant: ({
    pivotId,
    merchant,
    fromCategory,
    toCategory,
    createRule,
  }) =>
    set((s) => {
      const now = new Date().toISOString();
      const affected = s.transactions.filter(
        (t) =>
          t.id !== pivotId &&
          t.merchant === merchant &&
          t.category === fromCategory &&
          !t.isPersonal,
      );
      if (affected.length === 0 && !createRule) return {};

      const snapshots = affected.map((t) => snapshotTxn(t));
      let newRule: MerchantRule | undefined;
      if (createRule) {
        newRule = {
          id: `rule_${merchant.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`,
          merchant,
          category: toCategory,
          createdAt: now,
          appliedToPastCount: affected.length + 1,
        };
      }

      const pivotSnapshot = s.transactions.find((t) => t.id === pivotId);
      if (pivotSnapshot) snapshots.unshift(snapshotTxn(pivotSnapshot));

      const updatedTransactions = s.transactions.map((t) => {
        if (t.id === pivotId && newRule) {
          return { ...t, ruleId: newRule.id, categorySource: 'rule' as const };
        }
        if (
          t.id !== pivotId &&
          t.merchant === merchant &&
          t.category === fromCategory &&
          !t.isPersonal
        ) {
          const entry: CategoryHistoryEntry = {
            from: t.category,
            to: toCategory,
            changedAt: now,
            source: 'bulk',
          };
          return {
            ...t,
            category: toCategory,
            categorySource: newRule ? ('rule' as const) : ('manual' as const),
            ruleId: newRule ? newRule.id : undefined,
            categoryConfidence: 'high' as const,
            aiSuggestedCategory: undefined,
            aiReasoning: undefined,
            categoryHistory: [...(t.categoryHistory ?? []), entry],
          };
        }
        return t;
      });

      const n = affected.length;
      const message = newRule
        ? `Updated ${n} transaction${n === 1 ? '' : 's'} and added ${aOrAn(merchant)} ${merchant} rule.`
        : `Updated ${n} ${merchant} transaction${n === 1 ? '' : 's'}.`;

      const undoable: UndoableBulkAction = {
        id: `undo_${Date.now()}`,
        message,
        snapshot: snapshots,
        createdRuleId: newRule?.id,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      };

      return {
        transactions: updatedTransactions,
        rules: newRule ? [...s.rules, newRule] : s.rules,
        undoable,
      };
    }),

  bulkRecategorise: (ids, toCategory) =>
    set((s) => {
      const targets = s.transactions.filter(
        (t) => ids.includes(t.id) && t.category !== toCategory,
      );
      if (targets.length === 0) return {};
      const now = new Date().toISOString();
      const snapshots = targets.map((t) => snapshotTxn(t));

      const updatedTransactions = s.transactions.map((t) => {
        if (!ids.includes(t.id) || t.category === toCategory) return t;
        const entry: CategoryHistoryEntry = {
          from: t.category,
          to: toCategory,
          changedAt: now,
          source: 'bulk',
        };
        return {
          ...t,
          category: toCategory,
          categorySource: 'manual' as const,
          ruleId: undefined,
          categoryConfidence: 'high' as const,
          aiSuggestedCategory: undefined,
          aiReasoning: undefined,
          categoryHistory: [...(t.categoryHistory ?? []), entry],
        };
      });

      const n = targets.length;
      const undoable: UndoableBulkAction = {
        id: `undo_${Date.now()}`,
        message: `Updated ${n} transaction${n === 1 ? '' : 's'}.`,
        snapshot: snapshots,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      };

      return {
        transactions: updatedTransactions,
        undoable,
        checkedIds: new Set<string>(),
      };
    }),

  setRuleForMerchant: (merchant, toCategory) =>
    set((s) => {
      const now = new Date().toISOString();
      const targets = s.transactions.filter(
        (t) => t.merchant === merchant && !t.isPersonal,
      );
      if (targets.length === 0) return {};

      // Remove any existing rule for this merchant (we replace it).
      const existingRules = s.rules.filter((r) => r.merchant !== merchant);

      const newRule: MerchantRule = {
        id: `rule_${merchant.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`,
        merchant,
        category: toCategory,
        createdAt: now,
        appliedToPastCount: targets.filter((t) => t.category !== toCategory)
          .length,
      };

      const snapshots = targets.map((t) => snapshotTxn(t));

      const targetIds = new Set(targets.map((t) => t.id));
      const updatedTransactions = s.transactions.map((t) => {
        if (!targetIds.has(t.id)) return t;
        const categoryChanged = t.category !== toCategory;
        const entry: CategoryHistoryEntry | null = categoryChanged
          ? {
              from: t.category,
              to: toCategory,
              changedAt: now,
              source: 'rule',
            }
          : null;
        return {
          ...t,
          category: toCategory,
          categorySource: 'rule' as const,
          ruleId: newRule.id,
          categoryConfidence: 'high' as const,
          aiSuggestedCategory: undefined,
          aiReasoning: undefined,
          categoryHistory: entry
            ? [...(t.categoryHistory ?? []), entry]
            : t.categoryHistory,
        };
      });

      const changed = newRule.appliedToPastCount;
      const article = aOrAn(merchant);
      const message =
        changed > 0
          ? `Added ${article} ${merchant} rule and updated ${changed} transaction${changed === 1 ? '' : 's'}.`
          : `Added ${article} ${merchant} rule.`;

      const undoable: UndoableBulkAction = {
        id: `undo_${Date.now()}`,
        message,
        snapshot: snapshots,
        createdRuleId: newRule.id,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      };

      return {
        transactions: updatedTransactions,
        rules: [...existingRules, newRule],
        undoable,
      };
    }),

  createMerchantRule: (merchant, toCategory, { applyToExisting }) => {
    if (applyToExisting) {
      // Delegate to the retro-applying path so we get the same snapshot /
      // undoable semantics as rule creation from a transaction row.
      get().setRuleForMerchant(merchant, toCategory);
      return;
    }
    set((s) => {
      // Drop any previous rule for this merchant — we replace it.
      const existingRules = s.rules.filter(
        (r) => r.merchant.toLowerCase() !== merchant.toLowerCase(),
      );
      const newRule: MerchantRule = {
        id: `rule_${merchant.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`,
        merchant,
        category: toCategory,
        createdAt: new Date().toISOString(),
        appliedToPastCount: 0,
      };
      return {
        rules: [...existingRules, newRule],
      };
    });
  },

  offerRule: ({ merchant, fromCategory, toCategory }) =>
    set(() => ({
      ruleOffer: {
        id: `offer_${Date.now()}`,
        merchant,
        fromCategory,
        toCategory,
        expiresAt: Date.now() + 8000,
      },
    })),

  dismissRuleOffer: () => set(() => ({ ruleOffer: null })),

  acceptRuleOffer: () =>
    set((s) => {
      const offer = s.ruleOffer;
      if (!offer) return {};
      // Drop any stale rule for this merchant; the offer is authoritative.
      const existingRules = s.rules.filter(
        (r) => r.merchant.toLowerCase() !== offer.merchant.toLowerCase(),
      );
      const newRule: MerchantRule = {
        id: `rule_${offer.merchant.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`,
        merchant: offer.merchant,
        category: offer.toCategory,
        createdAt: new Date().toISOString(),
        // We deliberately don't retro-apply to existing transactions —
        // the user already picked "Just this one" for the pivot row.
        appliedToPastCount: 0,
      };
      return {
        rules: [...existingRules, newRule],
        ruleOffer: null,
      };
    }),

  undoLastBulk: () => {
    const undoable = get().undoable;
    if (!undoable) return;
    set((s) => {
      // Restore each transaction from its snapshot.
      const byId = new Map(undoable.snapshot.map((p) => [p.id, p] as const));
      const restored = s.transactions.map((t) => {
        const p = byId.get(t.id);
        if (!p) return t;
        return {
          ...t,
          category: p.category,
          categorySource: p.categorySource,
          ruleId: p.ruleId,
          categoryConfidence: p.categoryConfidence,
          aiSuggestedCategory: p.aiSuggestedCategory,
          aiReasoning: p.aiReasoning,
          categoryHistory: (t.categoryHistory ?? []).slice(
            0,
            p.categoryHistoryLength,
          ),
        };
      });
      const rules = undoable.createdRuleId
        ? s.rules.filter((r) => r.id !== undoable.createdRuleId)
        : s.rules;
      return {
        transactions: restored,
        rules,
        undoable: {
          ...undoable,
          message: 'Change reverted.',
          snapshot: [],
          createdRuleId: undefined,
          expiresAt: Date.now() + 2500,
        },
      };
    });
  },

  dismissUndo: () => set(() => ({ undoable: null })),

  removeRule: (ruleId) =>
    set((s) => ({
      rules: s.rules.filter((r) => r.id !== ruleId),
      transactions: s.transactions.map((t) =>
        t.ruleId === ruleId
          ? { ...t, ruleId: undefined, categorySource: 'manual' as const }
          : t,
      ),
    })),

  setRulesModalOpen: (open) => set(() => ({ rulesModalOpen: open })),

  toggleReviewed: (id, reviewed) => {
    // Flush any staged VAT answer first so the transaction carries the
    // user's intent the moment it flips to reviewed. Only matters when
    // transitioning to reviewed=true; un-reviewing is a correction and
    // shouldn't drag in stale pending state.
    const curr = get().transactions.find((x) => x.id === id);
    const next = reviewed ?? !(curr?.reviewed ?? false);
    if (next && curr && !curr.reviewed) {
      get().commitPendingVat(id);
    }
    set((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t) return {};
      const nextReviewed = reviewed ?? !t.reviewed;
      if (t.reviewed === nextReviewed) return {};
      return {
        transactions: updateTxn(s.transactions, id, { reviewed: nextReviewed }),
        // Push on transition to reviewed=true only. Un-reviewing is a
        // correction, not a new review event.
        reviewedSession: nextReviewed
          ? pushReviewedSession(s.reviewedSession, [id])
          : s.reviewedSession,
      };
    });
  },

  bulkSetReviewed: (ids, reviewed) =>
    set((s) => {
      const targetIds = new Set(ids);
      const newlyReviewed: string[] = [];
      const changed = s.transactions.map((t) => {
        if (!targetIds.has(t.id) || t.reviewed === reviewed) return t;
        if (reviewed) newlyReviewed.push(t.id);
        return { ...t, reviewed };
      });
      return {
        transactions: changed,
        checkedIds: new Set<string>(),
        reviewedSession: reviewed
          ? pushReviewedSession(s.reviewedSession, newlyReviewed)
          : s.reviewedSession,
      };
    }),

  markReviewedWithoutReceipt: (ids) => {
    // Flush staged VAT answers (from the inline detail flow) before the
    // reviewed flag flips, so the transaction carries the user's intent
    // into its reviewed state instead of losing the staged amount.
    for (const id of ids) {
      if (get().pendingVat[id]) get().commitPendingVat(id);
    }
    set((s) => {
      const targetIds = new Set(ids);
      const newlyReviewed: string[] = [];
      const changed = s.transactions.map((t) => {
        if (!targetIds.has(t.id)) return t;
        if (!t.reviewed) newlyReviewed.push(t.id);
        return { ...t, reviewed: true, reviewedWithoutReceipt: true };
      });
      return {
        transactions: changed,
        checkedIds: new Set<string>(),
        reviewedSession: pushReviewedSession(s.reviewedSession, newlyReviewed),
      };
    });
  },

  setPersonalTaxYear: (key) => set(() => ({ personalTaxYear: key })),

  // Single-txn personal/business toggles no longer stage an undo. The
  // inline "Undo" chip under the toggle was a confidence check nobody
  // needed for a one-click toggle they can just click again. Bulk
  // mark-personal still shows a snackbar undo, because that affects many
  // rows at once and is harder to reverse by hand.
  markPersonal: (id, opts) =>
    set((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t || t.isPersonal) return {};
      const source: PersonalHistoryEntry['source'] = opts?.source ?? 'manual';
      const now = new Date().toISOString();
      const entry: PersonalHistoryEntry = {
        toPersonal: true,
        changedAt: now,
        source,
      };
      const note: PersonalExpenseNote | undefined = opts?.reason
        ? { reason: opts.reason, reviewedForCorpTax: false }
        : t.personalExpenseNote;
      // Intentionally does NOT touch `reviewed`. Flipping expense type is
      // a classification change, not a review action — the only legitimate
      // writers of `reviewed` are `toggleReviewed` (detail panel button)
      // and `bulkSetReviewed` (bulk action bar). Anything else creates
      // silent side-effects that drop items out of "To review".
      return {
        transactions: updateTxn(s.transactions, id, {
          isPersonal: true,
          category: 'Personal',
          aiSuggestedCategory: undefined,
          aiReasoning: undefined,
          categoryConfidence: 'high',
          personalExpenseNote: note,
          personalHistory: [...(t.personalHistory ?? []), entry],
        }),
      };
    }),

  markBusiness: (id, opts) =>
    set((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t || !t.isPersonal) return {};
      const source: PersonalHistoryEntry['source'] = opts?.source ?? 'manual';
      const now = new Date().toISOString();
      const entry: PersonalHistoryEntry = {
        toPersonal: false,
        changedAt: now,
        source,
      };
      const nextCategory: Category = opts?.toCategory ?? inferBusinessCategory(t, s.transactions);
      // See note in `markPersonal`: `reviewed` is owned solely by
      // `toggleReviewed` / `bulkSetReviewed`. Flipping back to business
      // must not silently unreview the transaction.
      return {
        transactions: updateTxn(s.transactions, id, {
          isPersonal: false,
          category: nextCategory,
          personalExpenseNote: undefined,
          personalHistory: [...(t.personalHistory ?? []), entry],
        }),
      };
    }),

  bulkMarkPersonal: (ids, reason) =>
    set((s) => {
      const targets = s.transactions.filter(
        (t) => ids.includes(t.id) && !t.isPersonal,
      );
      if (targets.length === 0) return {};
      const now = new Date().toISOString();
      const snapshots = targets.map((t) => snapshotPersonal(t));
      const targetIds = new Set(targets.map((t) => t.id));
      const trimmedReason = reason?.trim() ?? '';

      const updatedTransactions = s.transactions.map((t) => {
        if (!targetIds.has(t.id)) return t;
        const entry: PersonalHistoryEntry = {
          toPersonal: true,
          changedAt: now,
          source: 'bulk',
        };
        const note: PersonalExpenseNote | undefined =
          trimmedReason.length > 0
            ? {
                reason: trimmedReason,
                reviewedForCorpTax: false,
              }
            : t.personalExpenseNote;
        // Bulk mark-personal is still a classification change — `reviewed`
        // belongs to the explicit review toggles, not to this path.
        return {
          ...t,
          isPersonal: true,
          category: 'Personal' as Category,
          aiSuggestedCategory: undefined,
          aiReasoning: undefined,
          categoryConfidence: 'high' as const,
          personalExpenseNote: note,
          personalHistory: [...(t.personalHistory ?? []), entry],
        };
      });

      const n = targets.length;
      const undoable: UndoablePersonalAction = {
        id: `pundo_${Date.now()}`,
        kind: 'snackbar',
        message: `Marked ${n} transaction${n === 1 ? '' : 's'} as personal.`,
        snapshot: snapshots,
        expiresAt: Date.now() + PERSONAL_SNACKBAR_UNDO_MS,
      };

      return {
        transactions: updatedTransactions,
        personalUndo: undoable,
        checkedIds: new Set<string>(),
      };
    }),

  setPersonalReason: (id, reason) =>
    set((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t) return {};
      const trimmed = reason.trim();
      const prev = t.personalExpenseNote;
      // No-op if nothing changed (avoids rewriting state on every blur).
      if ((prev?.reason ?? '') === trimmed) return {};
      const nextNote: PersonalExpenseNote | undefined =
        trimmed.length === 0
          ? prev?.reviewedForCorpTax
            ? { ...prev, reason: undefined }
            : undefined
          : {
              reason: trimmed,
              reviewedForCorpTax: prev?.reviewedForCorpTax ?? false,
              reviewedAt: prev?.reviewedAt,
            };
      return {
        transactions: updateTxn(s.transactions, id, {
          personalExpenseNote: nextNote,
        }),
      };
    }),

  setReviewedForCorpTax: (id, reviewed) =>
    set((s) => {
      const t = s.transactions.find((x) => x.id === id);
      if (!t) return {};
      const prev = t.personalExpenseNote;
      const nextNote: PersonalExpenseNote = {
        reason: prev?.reason,
        reviewedForCorpTax: reviewed,
        reviewedAt: reviewed ? new Date().toISOString() : undefined,
      };
      // If no reason and not reviewed, drop the note entirely.
      const cleaned: PersonalExpenseNote | undefined =
        !nextNote.reviewedForCorpTax && !nextNote.reason ? undefined : nextNote;
      // NOTE: intentionally does NOT write the top-level `reviewed` flag.
      // "Reviewed for corporation tax" is a distinct corp-tax bookkeeping
      // state on the personal expense note; it must not silently move the
      // transaction out of the "To review" inbox. Only the detail panel's
      // "Mark as reviewed" button and the bulk action bar are allowed to
      // touch `reviewed`.
      return {
        transactions: updateTxn(s.transactions, id, {
          personalExpenseNote: cleaned,
        }),
      };
    }),

  undoLastPersonal: () => {
    const undoable = get().personalUndo;
    if (!undoable) return;
    set((s) => {
      const byId = new Map(undoable.snapshot.map((p) => [p.id, p] as const));
      const restored = s.transactions.map((t) => {
        const p = byId.get(t.id);
        if (!p) return t;
        return {
          ...t,
          isPersonal: p.isPersonal,
          category: p.category,
          reviewed: p.reviewed,
          personalExpenseNote: p.personalExpenseNote,
          personalHistory: (t.personalHistory ?? []).slice(
            0,
            p.personalHistoryLength,
          ),
          categoryHistory: (t.categoryHistory ?? []).slice(
            0,
            p.categoryHistoryLength,
          ),
        };
      });
      return {
        transactions: restored,
        personalUndo: {
          ...undoable,
          message: 'Change reverted.',
          snapshot: [],
          expiresAt: Date.now() + 2500,
        },
      };
    });
  },

  dismissPersonalUndo: () => set(() => ({ personalUndo: null })),

  startYearEnd: (ids) =>
    set(() => ({
      yearEnd: {
        active: true,
        ids,
        currentIndex: 0,
        decisions: new Map<string, YearEndDecision>(),
        movedToBusiness: new Set<string>(),
      },
      selectedId: ids[0] ?? null,
      checkedIds: new Set<string>(),
    })),

  exitYearEnd: () => set(() => ({ yearEnd: emptyYearEnd })),

  yearEndDecide: (id, decision) => {
    const s = get();
    if (!s.yearEnd.active) return;
    const t = s.transactions.find((x) => x.id === id);
    if (!t) return;

    // Fold the side-effects of the decision into the underlying transaction.
    //
    // Neither branch writes the top-level `reviewed` flag. Year-end is a
    // corp-tax workflow that decides personal vs. business; it shouldn't
    // reach across and toggle the unrelated "To review" inbox state.
    // That flag is owned by `toggleReviewed` and `bulkSetReviewed` only.
    if (decision === 'personal') {
      // Keep it personal, mark reviewed-for-corp-tax = true on the note.
      const prev = t.personalExpenseNote;
      const nextNote: PersonalExpenseNote = {
        reason: prev?.reason,
        reviewedForCorpTax: true,
        reviewedAt: new Date().toISOString(),
      };
      set((ss) => ({
        transactions: updateTxn(ss.transactions, id, {
          personalExpenseNote: nextNote,
        }),
      }));
    } else if (decision === 'business') {
      // Flip back to business. Use markBusiness helper inline.
      const now = new Date().toISOString();
      const entry: PersonalHistoryEntry = {
        toPersonal: false,
        changedAt: now,
        source: 'year-end',
      };
      const nextCategory = inferBusinessCategory(t, s.transactions);
      set((ss) => ({
        transactions: updateTxn(ss.transactions, id, {
          isPersonal: false,
          category: nextCategory,
          personalExpenseNote: undefined,
          personalHistory: [...(t.personalHistory ?? []), entry],
        }),
      }));
    }
    // 'skip' records the decision but doesn't mutate the txn.

    set((ss) => {
      const decisions = new Map(ss.yearEnd.decisions);
      decisions.set(id, decision);
      const moved = new Set(ss.yearEnd.movedToBusiness);
      if (decision === 'business') moved.add(id);
      else moved.delete(id);
      return {
        yearEnd: {
          ...ss.yearEnd,
          decisions,
          movedToBusiness: moved,
        },
      };
    });
  },

  yearEndAdvance: () =>
    set((s) => {
      if (!s.yearEnd.active) return {};
      const nextIndex = Math.min(s.yearEnd.currentIndex + 1, s.yearEnd.ids.length);
      const nextId =
        nextIndex < s.yearEnd.ids.length ? s.yearEnd.ids[nextIndex]! : null;
      return {
        yearEnd: { ...s.yearEnd, currentIndex: nextIndex },
        selectedId: nextId ?? s.selectedId,
      };
    }),

  yearEndJumpTo: (index) =>
    set((s) => {
      if (!s.yearEnd.active) return {};
      const safe = Math.max(0, Math.min(s.yearEnd.ids.length - 1, index));
      const id = s.yearEnd.ids[safe];
      return {
        yearEnd: { ...s.yearEnd, currentIndex: safe },
        selectedId: id ?? s.selectedId,
      };
    }),
}));
