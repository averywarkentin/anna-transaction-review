import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useStore } from '../store';

/**
 * Soft "Always categorise X as Y?" nudge that surfaces after a single
 * transaction is recategorised and the merchant looks rule-worthy (enough
 * history, no existing rule, not a category chameleon). Explicit accept
 * creates a forward-looking rule; auto-dismisses after 8s, or on next
 * in-app action that clears the offer.
 *
 * Positioned above the UndoSnackbar stack when both are live.
 */
export function RuleOfferSnackbar() {
  const offer = useStore((s) => s.ruleOffer);
  const undoable = useStore((s) => s.undoable);
  const personalUndo = useStore((s) => s.personalUndo);
  const acceptRuleOffer = useStore((s) => s.acceptRuleOffer);
  const dismissRuleOffer = useStore((s) => s.dismissRuleOffer);

  const [, setTick] = useState(0);

  useEffect(() => {
    if (!offer) return;
    const remaining = Math.max(0, offer.expiresAt - Date.now());
    const t = window.setTimeout(() => dismissRuleOffer(), remaining);
    const iv = window.setInterval(
      () => setTick((n) => (n + 1) % 1_000_000),
      1000,
    );
    return () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, [offer, dismissRuleOffer]);

  if (!offer) return null;

  // If an undo snackbar is currently visible, stack this one above it so
  // they don't overlap.
  const undoVisible =
    (undoable && undoable.expiresAt > Date.now()) ||
    (personalUndo &&
      personalUndo.kind === 'snackbar' &&
      personalUndo.expiresAt > Date.now());
  const bottomClass = undoVisible ? 'bottom-20' : 'bottom-6';

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 ${bottomClass} z-40 flex justify-center px-4`}
      aria-live="polite"
    >
      <div
        role="status"
        className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-xl border border-ink-100 bg-ink-900 px-4 py-2.5 text-paper shadow-[0_12px_36px_-8px_rgba(15,23,42,0.4)]"
      >
        <Sparkles
          className="h-4 w-4 shrink-0 text-accent"
          aria-hidden="true"
        />
        <span className="text-[13px]">
          Always categorise{' '}
          <span className="font-semibold">{offer.merchant}</span> as{' '}
          <span className="font-semibold">{offer.toCategory}</span>?
        </span>
        <span className="h-4 w-px bg-ink-700" aria-hidden="true" />
        <button
          type="button"
          onClick={acceptRuleOffer}
          className="inline-flex items-center gap-1.5 rounded-md bg-paper/10 px-2 py-1 text-[12.5px] font-semibold text-paper hover:bg-paper/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
        >
          Create rule
        </button>
        <button
          type="button"
          onClick={dismissRuleOffer}
          aria-label="Dismiss"
          className="grid h-7 w-7 place-items-center rounded-md text-paper/60 hover:bg-paper/10 hover:text-paper"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
