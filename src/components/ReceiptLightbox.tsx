import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type Props = {
  src: string;
  alt: string;
  caption: string;
  onClose: () => void;
  /** Element to return focus to on close (the thumbnail button that opened it). */
  returnFocusTo?: HTMLElement | null;
};

/**
 * Lightbox modal for viewing an image receipt at a larger size. Kept deliberately
 * plain: dark backdrop, one image, a caption, and a close button. No zoom,
 * pan, or multi-receipt navigation — those would bloat the receipt flow.
 *
 * Focus traps to the close button while open (there's only the one
 * interactive element), Escape closes, backdrop click closes, and on
 * unmount focus returns to the caller's `returnFocusTo`.
 */
export function ReceiptLightbox({
  src,
  alt,
  caption,
  onClose,
  returnFocusTo,
}: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    return () => {
      returnFocusTo?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        // One focusable element — pin focus to it.
        e.preventDefault();
        closeRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Receipt viewer"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink-900/70 animate-[lightboxFade_180ms_ease-out] px-3 sm:px-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes lightboxFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close receipt viewer"
        className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-md bg-paper/15 text-white hover:bg-paper/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <img
        src={src}
        alt={alt}
        className="max-h-[80vh] max-w-full rounded-md shadow-2xl sm:max-w-[80vw]"
        onMouseDown={(e) => e.stopPropagation()}
      />

      <p
        className="mt-4 text-center text-[12.5px] text-white/80"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {caption}
      </p>
    </div>
  );
}
