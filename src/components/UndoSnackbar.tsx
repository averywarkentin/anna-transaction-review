import { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useStore } from '../store';

/**
 * Persistent bottom-centre snackbar that surfaces the most recent
 * undoable bulk action. Shows either a category-change undo (from the
 * recategorise flow) or a bulk mark-as-personal undo, whichever is more
 * recent. Stays visible up to its expiry, dismisses on button, and can be
 * replaced by the next action. After undo, briefly shows "Change reverted."
 */
export function UndoSnackbar() {
  const undoable = useStore((s) => s.undoable);
  const personalUndo = useStore((s) => s.personalUndo);
  const undoLastBulk = useStore((s) => s.undoLastBulk);
  const undoLastPersonal = useStore((s) => s.undoLastPersonal);
  const dismissUndo = useStore((s) => s.dismissUndo);
  const dismissPersonalUndo = useStore((s) => s.dismissPersonalUndo);

  // Choose which undo to surface: whichever expires later is the more
  // recent action. Inline personal undos live in the detail panel, not
  // here, so we only surface snackbar-kind personal undos.
  const surfacedPersonal =
    personalUndo && personalUndo.kind === 'snackbar' ? personalUndo : null;
  const useBulk =
    undoable &&
    (!surfacedPersonal || undoable.expiresAt >= surfacedPersonal.expiresAt);
  const active = useBulk ? undoable : surfacedPersonal;
  const onUndo = useBulk ? undoLastBulk : undoLastPersonal;
  const onDismiss = useBulk ? dismissUndo : dismissPersonalUndo;

  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const remaining = Math.max(0, active.expiresAt - Date.now());
    const t = window.setTimeout(() => {
      onDismiss();
    }, remaining);
    const iv = window.setInterval(() => setTick((n) => (n + 1) % 1_000_000), 1000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, [active, onDismiss]);

  if (!active) return null;

  const isReverted = active.snapshot.length === 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
      aria-live="polite"
    >
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-xl border border-ink-100 bg-ink-900 px-4 py-2.5 text-paper shadow-[0_12px_36px_-8px_rgba(15,23,42,0.4)]"
      >
        <span className="text-[13px]">{active.message}</span>
        {!isReverted && (
          <>
            <span className="h-4 w-px bg-ink-700" aria-hidden="true" />
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex items-center gap-1.5 rounded-md bg-paper/10 px-2 py-1 text-[12.5px] font-semibold text-paper hover:bg-paper/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Undo
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-7 w-7 place-items-center rounded-md text-paper/60 hover:bg-paper/10 hover:text-paper"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
