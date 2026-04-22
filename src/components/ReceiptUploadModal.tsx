import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  FileText,
  Upload,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { DEFAULT_VAT_RATES, calcVatFromGross } from '../data/transactions';
import { formatAmount, formatDateLong } from '../lib/format';
import type { Transaction, VatRate } from '../types';

type ReceiptMime = 'image/jpeg' | 'image/png' | 'application/pdf';

type UploadedFile = {
  filename: string;
  mimeType: ReceiptMime;
  /** For images: a data URL used both as the preview and as persisted storage. */
  dataUrl?: string;
  /** Shown in the modal while processing. Data URL for images; placeholder label for PDFs. */
  thumbnail: string;
};

type Stage =
  | { kind: 'dropzone' }
  | ({ kind: 'processing' } & UploadedFile)
  | ({
      kind: 'success';
      detectedRate: VatRate;
      detectedAmount: number;
      detectedTotal: number;
      detectedMerchant: string;
      exactMatch: boolean;
    } & UploadedFile)
  | ({ kind: 'failure' } & UploadedFile);

export function ReceiptUploadModal() {
  const modal = useStore((s) => s.receiptModal);
  const closeReceiptModal = useStore((s) => s.closeReceiptModal);
  const consumeReceiptPendingFile = useStore(
    (s) => s.consumeReceiptPendingFile,
  );
  const transactions = useStore((s) => s.transactions);
  const attachReceipt = useStore((s) => s.attachReceipt);
  const saveVat = useStore((s) => s.saveVat);
  const setPendingVat = useStore((s) => s.setPendingVat);

  const txn = modal.txnId
    ? transactions.find((t) => t.id === modal.txnId) ?? null
    : null;

  const [stage, setStage] = useState<Stage>({ kind: 'dropzone' });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (modal.open) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
      setStage({ kind: 'dropzone' });
      // Focus first interactive inside panel shortly after open
      window.setTimeout(() => {
        const focusable = panelRef.current?.querySelector<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
      }, 10);
    } else {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      lastFocusedRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.open]);

  useEffect(() => {
    if (!modal.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeReceiptModal();
      }
      if (e.key === 'Tab') {
        trapFocus(e, panelRef.current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal.open, closeReceiptModal]);

  // When an external caller supplies a pre-selected file (e.g. a drop on
  // the detail panel), skip the dropzone stage and process immediately.
  useEffect(() => {
    if (!modal.open || !modal.pendingFile || !txn) return;
    const file = modal.pendingFile;
    consumeReceiptPendingFile();
    handleFile(file, txn, setStage, timerRef);
  }, [modal.open, modal.pendingFile, txn, consumeReceiptPendingFile]);

  if (!modal.open || !txn) return null;

  const onFile = (file: File) => handleFile(file, txn, setStage, timerRef);

  const onSimulateFile = () => {
    // Allow clicking the zone without a real file — synthesise one for the flow.
    // The SVG rides inside a data URL and renders cleanly in <img>.
    const dataUrl = svgPreview(txn.merchant);
    simulateProcessing(
      {
        filename: `receipt-${txn.id}.png`,
        mimeType: 'image/png',
        dataUrl,
        thumbnail: dataUrl,
      },
      txn,
      setStage,
      timerRef,
    );
  };

  const onSaveFromSuccess = () => {
    if (stage.kind !== 'success') return;
    attachReceipt(txn.id, {
      filename: stage.filename,
      mimeType: stage.mimeType,
      dataUrl: stage.dataUrl,
    });
    if (modal.source === 'detail') {
      // Defer commit: stage VAT so the txn stays in "To review" until the
      // user clicks "Mark as reviewed". RecordedView renders from pending.
      setPendingVat(txn.id, {
        kind: 'record',
        rate: stage.detectedRate,
        amount: stage.detectedAmount,
        method: 'receipt',
      });
    } else {
      // Batch flow commits immediately to drive auto-advance.
      saveVat(txn.id, {
        rate: stage.detectedRate,
        amount: stage.detectedAmount,
        method: 'receipt',
      });
    }
    closeReceiptModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink-900/40 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeReceiptModal();
      }}
    >
      <div
        ref={panelRef}
        className="flex h-full w-full flex-col overflow-hidden bg-paper shadow-[0_12px_48px_-8px_rgba(15,23,42,0.25)] sm:h-auto sm:max-w-[520px] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="receipt-modal-title"
              className="text-[15px] font-semibold text-ink-900"
            >
              {modal.replace ? 'Replace receipt' : 'Upload receipt'}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeReceiptModal}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:flex-none">
          {/* Prominent context strip: confirms to the user which
              transaction this upload attaches to. Lives above every
              stage so the anchor never scrolls out while the user is
              processing or reviewing detected values. */}
          <div
            className="mb-4 flex items-start gap-3 rounded-lg border border-accent-soft bg-accent-soft/40 px-3 py-2.5"
            aria-label="Attaching receipt to transaction"
          >
            <FileText
              className="mt-0.5 h-4 w-4 shrink-0 text-accent"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 text-[12.5px] text-ink-700">
              <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-500">
                Attaching receipt to
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="truncate text-[13.5px] font-semibold text-ink-900">
                  {txn.merchant}
                </span>
                <span className="text-ink-500">
                  {formatDateLong(txn.date)}
                </span>
                <span
                  className={`tabular font-semibold ${
                    txn.amount > 0 ? 'text-emerald-700' : 'text-ink-900'
                  }`}
                >
                  {formatAmount(txn.amount, { signed: true })}
                </span>
              </div>
            </div>
          </div>

          {stage.kind === 'dropzone' && (
            <DropzoneStage onFile={onFile} onClickZone={onSimulateFile} />
          )}
          {stage.kind === 'processing' && (
            <ProcessingStage stage={stage} />
          )}
          {stage.kind === 'success' && (
            <SuccessStage
              stage={stage}
              txn={txn}
              onSave={onSaveFromSuccess}
            />
          )}
          {stage.kind === 'failure' && (
            <FailureStage
              stage={stage}
              onEnterManual={() => closeReceiptModal()}
              onTryAgain={() => setStage({ kind: 'dropzone' })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Shared entry point for file → processing, used both by the in-modal
 * dropzone/browse/camera flows and by external drops that pre-fill the
 * modal via `openReceiptModal({ pendingFile })`.
 */
function handleFile(
  file: File,
  txn: Transaction,
  setStage: (s: Stage) => void,
  timerRef: { current: number | null },
) {
  const mimeType = normaliseMime(file.type, file.name);
  if (mimeType === 'application/pdf') {
    simulateProcessing(
      { filename: file.name, mimeType, thumbnail: 'pdf' },
      txn,
      setStage,
      timerRef,
    );
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : '';
    simulateProcessing(
      { filename: file.name, mimeType, dataUrl, thumbnail: dataUrl },
      txn,
      setStage,
      timerRef,
    );
  };
  reader.readAsDataURL(file);
}

function simulateProcessing(
  file: UploadedFile,
  txn: Transaction,
  setStage: (s: Stage) => void,
  timerRef: { current: number | null },
) {
  setStage({ kind: 'processing', ...file });
  const delay = 1500 + Math.random() * 1000;
  timerRef.current = window.setTimeout(() => {
    if (Math.random() < 0.8) {
      const gross = Math.abs(txn.amount);
      const rate: VatRate =
        DEFAULT_VAT_RATES[txn.category] === 0
          ? 20
          : DEFAULT_VAT_RATES[txn.category];
      const amount = calcVatFromGross(gross, rate);
      const exactMatch = Math.random() < 0.6;
      setStage({
        kind: 'success',
        ...file,
        detectedRate: rate,
        detectedAmount: amount,
        detectedTotal: gross,
        detectedMerchant: exactMatch
          ? txn.merchant
          : variantMerchant(txn.merchant),
        exactMatch,
      });
    } else {
      setStage({ kind: 'failure', ...file });
    }
  }, delay);
}

function DropzoneStage({
  onFile,
  onClickZone,
}: {
  onFile: (file: File) => void;
  onClickZone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
        else onClickZone();
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (inputRef.current) inputRef.current.click();
          else onClickZone();
        }}
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          isDragging
            ? 'border-accent bg-accent-soft'
            : 'border-ink-200 bg-paper-muted hover:border-ink-300 hover:bg-ink-50'
        }`}
      >
        <Upload className="h-6 w-6 text-ink-400" aria-hidden="true" />
        <div>
          <div className="text-[14px] font-semibold text-ink-800 sm:text-[13.5px]">
            <span className="sm:hidden">Choose a receipt</span>
            <span className="hidden sm:inline">Drop your receipt here</span>
          </div>
          <div className="mt-0.5 text-[12px] text-ink-400">
            <span className="sm:hidden">JPG, PNG, PDF</span>
            <span className="hidden sm:inline">
              or click to browse · JPG, PNG, PDF
            </span>
          </div>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          else onClickZone();
        }}
      />
      {/* Mobile-only camera shortcut. capture="environment" opens the
          rear camera directly on iOS/Android, shortcutting the file
          picker for the common case of snapping a paper receipt. */}
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-ink-100 bg-paper px-3 py-3 text-[14px] font-semibold text-ink-700 hover:bg-ink-50 sm:hidden"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Take a photo
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <p className="mt-3 text-center text-[11.5px] text-ink-400">
        No receipt to hand?{' '}
        <button
          type="button"
          onClick={onClickZone}
          className="font-medium text-ink-500 underline underline-offset-2 hover:text-ink-800"
        >
          Try the demo flow with a stub image
        </button>
      </p>
    </div>
  );
}

function ProcessingStage({
  stage,
}: {
  stage: { thumbnail: string; filename: string };
}) {
  return (
    <div className="flex items-center gap-4">
      <Thumbnail src={stage.thumbnail} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink-800">
          Reading your receipt…
        </div>
        <div className="mt-0.5 truncate text-[12px] text-ink-400">
          {stage.filename}
        </div>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-ink-100"
          role="progressbar"
          aria-label="Processing receipt"
        >
          <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] bg-accent/80" />
        </div>
        <style>{`
          @keyframes indeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `}</style>
      </div>
    </div>
  );
}

function SuccessStage({
  stage,
  txn,
  onSave,
}: {
  stage: Extract<Stage, { kind: 'success' }>;
  txn: Transaction;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <Thumbnail src={stage.thumbnail} />
        <div className="min-w-0 flex-1 space-y-2.5">
          <DetectedRow label="VAT rate">
            <span className="tabular">{stage.detectedRate}%</span>
          </DetectedRow>
          <DetectedRow label="VAT amount">
            <span className="tabular font-semibold">
              {formatAmount(stage.detectedAmount)}
            </span>
          </DetectedRow>
          <DetectedRow label="Merchant">
            <span className="truncate">{stage.detectedMerchant}</span>
          </DetectedRow>
          <DetectedRow label="Total">
            <span className="tabular">
              {formatAmount(stage.detectedTotal)}
            </span>
          </DetectedRow>
        </div>
      </div>

      <div
        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] ${
          stage.exactMatch
            ? 'bg-emerald-50 text-emerald-800'
            : 'bg-amber-50 text-amber-800'
        }`}
        role="note"
      >
        {stage.exactMatch ? (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
        )}
        <span>
          {stage.exactMatch ? (
            <>Looks right. Merchant on the receipt matches the transaction.</>
          ) : (
            <>
              Double-check this. The merchant on the receipt looks slightly
              different from the transaction ({txn.merchant}).
            </>
          )}
        </span>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-hover"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Save
        </button>
      </div>
    </div>
  );
}

function FailureStage({
  stage,
  onEnterManual,
  onTryAgain,
}: {
  stage: { thumbnail: string; filename: string };
  onEnterManual: () => void;
  onTryAgain: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <Thumbnail src={stage.thumbnail} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 text-[13px] text-ink-800">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <span>
              We couldn’t read the VAT details from this receipt. You can enter
              them manually or try a different photo.
            </span>
          </div>
          <div className="mt-2 truncate text-[12px] text-ink-400">
            {stage.filename}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onTryAgain}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-100 bg-paper px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"
        >
          Try another receipt
        </button>
        <button
          type="button"
          onClick={onEnterManual}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-accent-hover"
        >
          Enter manually
        </button>
      </div>
    </div>
  );
}

function DetectedRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-ink-100 pb-1.5 text-[13px] text-ink-700 last:border-b-0 last:pb-0">
      <span className="text-ink-400">{label}</span>
      {children}
    </div>
  );
}

function Thumbnail({ src }: { src: string }) {
  const isImage = src.startsWith('data:') || src.startsWith('blob:');
  return (
    <div
      className="grid h-[96px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-md border border-ink-100 bg-paper-muted"
      aria-hidden="true"
    >
      {isImage ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={src} className="h-full w-full object-cover" />
      ) : (
        // The 'pdf' sentinel (or anything non-URL-ish) renders as a doc icon.
        <FileText className="h-6 w-6 text-ink-300" />
      )}
    </div>
  );
}

/**
 * Pick a valid receipt mime type from the File, falling back on the
 * extension. Browsers usually populate `file.type` but not always (drag
 * from odd sources), so this is the safety net.
 */
function normaliseMime(
  fileType: string,
  filename: string,
): 'image/jpeg' | 'image/png' | 'application/pdf' {
  if (fileType === 'image/jpeg' || fileType === 'image/png' || fileType === 'application/pdf') {
    return fileType;
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function variantMerchant(name: string): string {
  const variants: Record<string, string> = {
    Tesco: 'TESCO STORES LIMITED',
    "Sainsbury's": "J Sainsbury Plc",
    Uber: 'Uber B.V.',
    Amazon: 'AMZN Mktplace EU',
    Pret: 'Pret A Manger (UK) Ltd',
    'Caffè Nero': 'Caffe Nero Group',
    Deliveroo: 'Roofoods Ltd',
    Figma: 'Figma Inc.',
    Slack: 'Slack Technologies Ltd',
    Adobe: 'Adobe Systems Software Ireland',
    WeWork: 'WW Worldwide C.V.',
    'Google Workspace': 'Google Cloud EMEA Ltd',
    'British Airways': 'BA PLC',
    easyJet: 'easyJet Airline Co Ltd',
    Apple: 'APPLE DISTRIBUTION INTL',
    'John Lewis': 'John Lewis Plc',
    Mailchimp: 'Rocket Science Group',
    Notion: 'Notion Labs Inc.',
    Xero: 'Xero (UK) Ltd',
    'LinkedIn Ads': 'LinkedIn Ireland Unlimited',
    'Meta Ads': 'Meta Platforms Ireland',
    'British Gas': 'Centrica Energy',
    'BT Business': 'BT Group Plc',
    'Rocket Lawyer': 'Rocket Lawyer UK Ltd',
    TfL: 'Transport for London',
  };
  return variants[name] ?? `${name.toUpperCase()} LTD`;
}

function svgPreview(label: string): string {
  const safe = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 16);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='240' viewBox='0 0 180 240'><rect width='100%' height='100%' fill='#f1f5f9'/><rect x='14' y='18' width='152' height='12' rx='2' fill='#cbd5e1'/><rect x='14' y='42' width='120' height='8' rx='2' fill='#cbd5e1'/><rect x='14' y='58' width='140' height='8' rx='2' fill='#e2e8f0'/><rect x='14' y='88' width='152' height='1' fill='#cbd5e1'/><rect x='14' y='100' width='90' height='7' rx='2' fill='#94a3b8'/><rect x='124' y='100' width='42' height='7' rx='2' fill='#94a3b8'/><rect x='14' y='116' width='90' height='7' rx='2' fill='#94a3b8'/><rect x='124' y='116' width='42' height='7' rx='2' fill='#94a3b8'/><rect x='14' y='132' width='90' height='7' rx='2' fill='#94a3b8'/><rect x='124' y='132' width='42' height='7' rx='2' fill='#94a3b8'/><rect x='14' y='158' width='152' height='1' fill='#cbd5e1'/><rect x='14' y='170' width='60' height='9' rx='2' fill='#475569'/><rect x='110' y='170' width='56' height='9' rx='2' fill='#475569'/><text x='14' y='214' font-family='sans-serif' font-size='12' fill='#64748b'>${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'button, [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
