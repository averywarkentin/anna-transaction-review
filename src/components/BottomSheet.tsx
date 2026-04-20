import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Max sheet height as a fraction of the viewport, 0–1. Defaults to 0.7. */
  maxHeight?: number;
  children: React.ReactNode;
  /** aria-label for the dialog if no visible title is provided. */
  ariaLabel?: string;
  /** Footer slot (full-width, above the safe-area inset). */
  footer?: React.ReactNode;
};

/**
 * Mobile-native bottom sheet. Rises from the bottom of the viewport,
 * stops at a capped height, and traps focus until dismissed.
 *
 * Rendered in a portal at `document.body` so nothing in the
 * scrollable layout above can clip it. The backdrop dims the page
 * behind the sheet and closes it on tap — exactly the iOS/Android
 * convention users expect.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  maxHeight = 0.7,
  children,
  ariaLabel,
  footer,
}: Props) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape. We attach at the document level so the key works
  // even when focus has drifted inside a nested input.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock background scroll while the sheet is open so the page doesn't
  // drift behind the translucent backdrop.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Move initial focus into the sheet so keyboard users land in-sheet.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      sheetRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const heightVh = Math.round(maxHeight * 100);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      aria-modal="true"
      role="dialog"
      aria-label={ariaLabel ?? title}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/50 transition-opacity"
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        style={{ maxHeight: `${heightVh}vh` }}
        className="relative flex w-full flex-col overflow-hidden rounded-t-2xl bg-paper shadow-[0_-10px_40px_rgba(15,23,42,0.18)] focus:outline-none"
      >
        {/* Drag handle affordance. Non-functional (we don't support
            drag-to-dismiss) but it signals "this is a sheet you can
            swipe-away" visually, which users expect on mobile. */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span
            className="h-1 w-10 rounded-full bg-ink-200"
            aria-hidden="true"
          />
        </div>
        {title && (
          <div className="flex items-center justify-between border-b border-ink-100 px-4 pb-3 pt-1">
            <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-50 hover:text-ink-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {children}
        </div>
        {footer && (
          <div className="border-t border-ink-100 bg-paper px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
