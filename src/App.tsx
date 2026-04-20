import { useEffect, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { FilterBar } from './components/FilterBar';
import { TransactionList } from './components/TransactionList';
import { DetailPanel } from './components/DetailPanel';
import { MerchantDetailPanel } from './components/MerchantDetailPanel';
import { ReceiptUploadModal } from './components/ReceiptUploadModal';
import { RulesModal } from './components/RulesModal';
import { BatchReviewMode } from './components/BatchReviewMode';
import { YearEndReviewMode } from './components/YearEndReviewMode';
import { UndoSnackbar } from './components/UndoSnackbar';
import { MobileBatchCta } from './components/MobileBatchCta';
import { useStore } from './store';
import { useIsMobile } from './hooks/useBreakpoint';

export default function App() {
  const batchActive = useStore((s) => s.batch.active);
  const yearEndActive = useStore((s) => s.yearEnd.active);
  const focusedMerchant = useStore((s) => s.focusedMerchant);
  const selectedId = useStore((s) => s.selectedId);
  const isMobile = useIsMobile();

  // On mobile the master/detail split collapses: when a row (or merchant)
  // is selected we take over the whole viewport with the detail panel.
  // The top bar and filter bar stay hidden in takeover so the detail can
  // use all available vertical space. Tapping back in the detail clears
  // the selection and we drop back into the list.
  const mobileShowDetail = isMobile && (selectedId || focusedMerchant);

  // Browser-back integration for the mobile takeover.
  //
  // When we open the detail we push a synthetic history entry tagged with
  // { anna: 'detail' }. A hardware/browser back then fires popstate, at
  // which point we clear the selection to drop back to the list. If the
  // user instead closes the detail from inside the app (tapping the Back
  // arrow, marking reviewed and running out of items, etc.), we consume
  // the pushed entry with history.back() so the stack stays balanced.
  //
  // `poppingRef` guards against that reconciliation double-firing: once
  // popstate has already dropped our entry, we must not call back() again
  // or we'd navigate out of the app entirely.
  const pushedRef = useRef(false);
  const poppingRef = useRef(false);

  useEffect(() => {
    if (!isMobile) return;
    function onPop() {
      poppingRef.current = true;
      pushedRef.current = false;
      const st = useStore.getState();
      st.setSelected(null);
      st.focusMerchant(null);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      // If we've resized up from mobile while a detail was open, drop
      // our synthetic history entry so the back button isn't left
      // pointing at a view that no longer exists.
      if (pushedRef.current && !poppingRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
      return;
    }
    if (mobileShowDetail && !pushedRef.current) {
      window.history.pushState({ anna: 'detail' }, '');
      pushedRef.current = true;
    } else if (!mobileShowDetail && pushedRef.current && !poppingRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
    // Reset the pop guard at the end of each pass so the next open/close
    // starts from a clean slate.
    poppingRef.current = false;
  }, [mobileShowDetail, isMobile]);

  return (
    <>
      {yearEndActive ? (
        <YearEndReviewMode />
      ) : batchActive ? (
        <BatchReviewMode />
      ) : (
        <div className="flex h-screen flex-col bg-paper-subtle text-ink-800">
          {/* Top bar + filter bar stay mounted on mobile even during a
              detail takeover: the mobile detail is rendered as a
              fixed-position overlay below, so the list (and its filter
              state + scroll position) stays mounted behind it. That's
              what preserves the user's place when they tap Back. */}
          <TopBar />
          <FilterBar />
          <main className="min-h-0 flex-1 overflow-hidden">
            {/* Tablet & desktop share the master/detail split. On
                tablet we use 1fr/1fr so both panels get the same
                share of a narrower viewport; at lg we return to
                the 1.5/1 reference. Mobile is single-column; the
                detail takeover is handled by the overlay outside
                this grid. */}
            <div className="mx-auto grid h-full max-w-[1440px] grid-cols-1 gap-4 px-4 py-3 sm:grid-cols-[minmax(0,_1fr)_minmax(0,_1fr)] sm:gap-5 sm:px-6 lg:grid-cols-[minmax(0,_1.5fr)_minmax(0,_1fr)] lg:gap-6 lg:px-8 lg:py-4">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-ink-100 bg-paper shadow-panel">
                <TransactionList />
              </div>
              {/* Detail panel — hidden on mobile (overlay branch
                  handles it) and visible from tablet up. */}
              <div className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-ink-100 bg-paper shadow-panel sm:flex">
                {focusedMerchant ? <MerchantDetailPanel /> : <DetailPanel />}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Mobile-only batch CTA. Shown when the user has the Needs VAT
          chip active in the to-review inbox, giving them a one-tap way
          into batch review mode without having to reach up to the chip
          row's inline button. Hidden while the detail overlay is open
          so it doesn't compete with the detail action bar. */}
      {!mobileShowDetail && !batchActive && !yearEndActive && <MobileBatchCta />}

      {/* Mobile detail overlay. Rendered as a fixed takeover on top
          of the mounted list so that closing it (Back arrow, browser
          back, auto-advance caught-up → back to list) restores the
          exact filter + scroll state the user left the list in. */}
      {mobileShowDetail && !batchActive && !yearEndActive && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-paper sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Transaction detail"
        >
          {focusedMerchant ? <MerchantDetailPanel /> : <DetailPanel />}
        </div>
      )}

      <ReceiptUploadModal />
      <RulesModal />
      <UndoSnackbar />
    </>
  );
}
