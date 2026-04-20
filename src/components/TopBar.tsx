import { BadgeCheck, ChevronDown } from 'lucide-react';
import { useStore } from '../store';

export function TopBar() {
  const rules = useStore((s) => s.rules);
  const setRulesModalOpen = useStore((s) => s.setRulesModalOpen);
  const currentView = useStore((s) => s.currentView);
  const setCurrentView = useStore((s) => s.setCurrentView);

  return (
    <header className="z-30 shrink-0 border-b border-ink-100 bg-paper">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:h-16 lg:px-8">
        <div className="flex items-center gap-4 lg:gap-8">
          <a
            href="#"
            className="flex items-center gap-2 text-ink-900"
            aria-label="ANNA home"
          >
            <span
              className="grid h-7 w-7 place-items-center rounded-md bg-accent text-white"
              aria-hidden="true"
            >
              <span className="text-[13px] font-semibold tracking-tight">
                A
              </span>
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              ANNA
            </span>
          </a>
          {/* Primary nav: visible from tablet up. On mobile we surface the
              To review / All transactions switch inside FilterBar so the
              top bar can stay at a tight 56px. */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 sm:flex"
          >
            <NavLink
              active={currentView === 'to-review'}
              onClick={() => setCurrentView('to-review')}
            >
              To review
            </NavLink>
            <NavLink
              active={currentView === 'all-transactions'}
              onClick={() => setCurrentView('all-transactions')}
            >
              All transactions
            </NavLink>
            <NavLink>Documents</NavLink>
            <NavLink>Reports</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {/* Rules button is a quiet secondary action. On mobile we hide
              the label and keep a 44x44 icon-only target; the count is
              still shown as a badge. */}
          <button
            type="button"
            onClick={() => setRulesModalOpen(true)}
            aria-label={`Rules${rules.length > 0 ? ` (${rules.length})` : ''}`}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-ink-100 bg-paper text-ink-700 hover:bg-ink-50 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5 sm:text-[12.5px] sm:font-medium"
          >
            <BadgeCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Rules</span>
            {rules.length > 0 && (
              <span className="tabular absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white sm:static sm:h-auto sm:min-w-0 sm:rounded-full sm:bg-ink-50 sm:px-1.5 sm:py-px sm:text-[11px] sm:font-normal sm:text-ink-500">
                {rules.length}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Hemlock Design Ltd"
            className="inline-flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] text-ink-700 hover:bg-ink-50 sm:px-2.5"
          >
            <span
              className="grid h-8 w-8 place-items-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-700 sm:h-6 sm:w-6"
              aria-hidden="true"
            >
              HM
            </span>
            <span className="hidden max-w-[160px] truncate sm:inline">
              Hemlock Design Ltd
            </span>
            <ChevronDown
              className="hidden h-4 w-4 text-ink-400 sm:inline"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  children,
  active,
  onClick,
}: {
  children: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      className={`rounded-md px-3 py-1.5 text-[13px] ${
        active
          ? 'bg-ink-50 font-medium text-ink-900'
          : 'text-ink-500 hover:text-ink-800'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </a>
  );
}
