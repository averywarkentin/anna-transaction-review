import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BadgeCheck,
  Bot,
  CalendarClock,
  History,
  ShieldCheck,
  Tag,
  User,
} from 'lucide-react';
import { formatDateLong } from '../lib/format';
import type {
  CategoryHistoryEntry,
  PersonalHistoryEntry,
  Transaction,
} from '../types';

type Event =
  | { kind: 'category-seed'; at: string; category: string }
  | { kind: 'category'; at: string; entry: CategoryHistoryEntry }
  | { kind: 'personal'; at: string; entry: PersonalHistoryEntry }
  | { kind: 'reviewed-for-corp-tax'; at: string };

/**
 * A small popover that chronicles the recorded history of a transaction:
 * category changes, personal/business toggles, and corp-tax review events.
 *
 * The brief stresses that showing decisions in both directions matters, so
 * this is where the "moved to personal, then back to business" story
 * actually lives. Especially important if an accountant or HMRC later
 * asks why something was classified a certain way.
 */
export function AuditTrailPopover({ txn }: { txn: Transaction }) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const events = buildEvents(txn);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded-md border border-ink-100 bg-paper px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:border-ink-200 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
      >
        <History className="h-3 w-3" aria-hidden="true" />
        History ({events.length})
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Audit trail"
          className="absolute right-0 top-full z-40 mt-2 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-ink-100 bg-paper shadow-panel sm:w-[320px]"
        >
          <div className="border-b border-ink-100 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
            Audit trail
          </div>
          {events.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-ink-400">
              No recorded changes yet
            </div>
          ) : (
            <ol className="max-h-[320px] overflow-y-auto scrollbar-thin px-3 py-2">
              {events.map((ev, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 border-b border-ink-50 py-2 last:border-b-0"
                >
                  <div
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-50 text-ink-500"
                    aria-hidden="true"
                  >
                    <EventIcon ev={ev} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] leading-snug text-ink-800">
                      <EventText ev={ev} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-400">
                      <CalendarClock
                        className="h-2.5 w-2.5"
                        aria-hidden="true"
                      />
                      {formatDateLong(ev.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function buildEvents(txn: Transaction): Event[] {
  const events: Event[] = [];

  // We always have an implicit starting point: when the transaction was
  // first seen and categorised. Use the transaction date as a proxy.
  events.push({
    kind: 'category-seed',
    at: txn.date + 'T09:00:00.000Z',
    category: txn.categoryHistory?.[0]?.from ?? txn.category,
  });

  for (const c of txn.categoryHistory ?? []) {
    events.push({ kind: 'category', at: c.changedAt, entry: c });
  }
  for (const p of txn.personalHistory ?? []) {
    events.push({ kind: 'personal', at: p.changedAt, entry: p });
  }
  if (txn.personalExpenseNote?.reviewedForCorpTax && txn.personalExpenseNote.reviewedAt) {
    events.push({
      kind: 'reviewed-for-corp-tax',
      at: txn.personalExpenseNote.reviewedAt,
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  return events;
}

function EventIcon({ ev }: { ev: Event }) {
  if (ev.kind === 'category-seed') {
    return <Bot className="h-3 w-3" aria-hidden="true" />;
  }
  if (ev.kind === 'category') {
    if (ev.entry.source === 'rule') {
      return <BadgeCheck className="h-3 w-3" aria-hidden="true" />;
    }
    return <Tag className="h-3 w-3" aria-hidden="true" />;
  }
  if (ev.kind === 'personal') {
    if (ev.entry.toPersonal) {
      return <User className="h-3 w-3" aria-hidden="true" />;
    }
    return <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />;
  }
  return <ShieldCheck className="h-3 w-3" aria-hidden="true" />;
}

function EventText({ ev }: { ev: Event }) {
  if (ev.kind === 'category-seed') {
    return (
      <span>
        Auto-categorised as{' '}
        <span className="font-medium text-ink-900">{ev.category}</span>
      </span>
    );
  }
  if (ev.kind === 'category') {
    const verb =
      ev.entry.source === 'rule'
        ? 'Re-categorised by rule'
        : ev.entry.source === 'bulk'
        ? 'Bulk re-categorised'
        : 'Re-categorised';
    return (
      <span>
        {verb} from{' '}
        <span className="font-medium text-ink-900">{ev.entry.from}</span> to{' '}
        <span className="font-medium text-ink-900">{ev.entry.to}</span>
      </span>
    );
  }
  if (ev.kind === 'personal') {
    const sourceLabel =
      ev.entry.source === 'bulk'
        ? ' (bulk)'
        : ev.entry.source === 'year-end'
        ? ' (year-end review)'
        : '';
    if (ev.entry.toPersonal) {
      return (
        <span>
          Moved to <span className="font-medium text-ink-900">personal</span>
          {sourceLabel}
        </span>
      );
    }
    return (
      <span>
        Moved back to{' '}
        <span className="font-medium text-ink-900">business</span>
        {sourceLabel}
      </span>
    );
  }
  return (
    <span>
      Reviewed for{' '}
      <span className="font-medium text-ink-900">corporation tax</span>
    </span>
  );
}
