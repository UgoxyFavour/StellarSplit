import { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FileScan,
  PencilLine,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { CameraCapture } from '../CameraCapture';
import {
  ManualEntryFallback,
  ReceiptUpload,
  type ManualEntryData,
} from '../ReceiptUpload';
import { ReceiptParserResults } from './ReceiptParserResults';
import type { ParsedItem } from './ParsedItemEditor';
import {
  createManualReviewItems,
  simulateReceiptOcr,
  type ReceiptOcrProgress,
} from '../../utils/receiptOcr';

type FlowStep =
  | 'choose'
  | 'camera'
  | 'upload'
  | 'manual'
  | 'processing'
  | 'review'
  | 'complete';

type CaptureMethod = 'camera' | 'upload' | 'manual';

interface ReceiptFlowDraft {
  step: FlowStep;
  method: CaptureMethod;
  imageUrl?: string;
  imageName?: string;
  merchant?: string;
  receiptTotal: number;
  items: ParsedItem[];
  manualEntry?: ManualEntryData;
  progress: number;
  progressLabel?: string;
  error?: string;
  updatedAt: string;
}

export interface ReceiptCaptureFlowResult {
  imageUrl?: string;
  items: ParsedItem[];
  receiptTotal: number;
  merchant?: string;
  manualEntry?: ManualEntryData;
}

interface ReceiptCaptureFlowProps {
  splitId: string;
  currency: string;
  onApply: (result: ReceiptCaptureFlowResult) => void;
}

const createEmptyDraft = (): ReceiptFlowDraft => ({
  step: 'choose',
  method: 'camera',
  receiptTotal: 0,
  items: [],
  progress: 0,
  updatedAt: new Date().toISOString(),
});

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Unable to preview the selected receipt'));
    };
    reader.onerror = () => reject(new Error('Unable to preview the selected receipt'));
    reader.readAsDataURL(file);
  });

const loadDraft = (storageKey: string): ReceiptFlowDraft => {
  const emptyDraft = createEmptyDraft();

  try {
    const rawDraft = localStorage.getItem(storageKey);
    if (!rawDraft) {
      return emptyDraft;
    }

    const parsed = JSON.parse(rawDraft) as Partial<ReceiptFlowDraft>;
    return {
      ...emptyDraft,
      ...parsed,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      progress:
        typeof parsed.progress === 'number' ? Math.max(0, parsed.progress) : 0,
      updatedAt: parsed.updatedAt ?? emptyDraft.updatedAt,
    };
  } catch {
    return emptyDraft;
  }
};

const methodLabel: Record<CaptureMethod, string> = {
  camera: 'Camera',
  upload: 'Upload',
  manual: 'Manual',
};

export const ReceiptCaptureFlow = ({
  splitId,
  currency,
  onApply,
}: ReceiptCaptureFlowProps) => {
  const storageKey = useMemo(
    () => `stellarsplit-receipt-draft:${splitId}`,
    [splitId]
  );
  const [draft, setDraft] = useState<ReceiptFlowDraft>(() => loadDraft(storageKey));
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  const parsedTotal = useMemo(
    () =>
      draft.items.reduce((sum, item) => sum + item.quantity * item.price, 0),
    [draft.items]
  );

  const updateDraft = (updater: (current: ReceiptFlowDraft) => ReceiptFlowDraft) => {
    setDraft((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }));
  };

  const clearDraft = () => {
    const emptyDraft = createEmptyDraft();
    localStorage.removeItem(storageKey);
    setDraft(emptyDraft);
  };

  const startMethod = (step: Extract<FlowStep, 'camera' | 'upload' | 'manual'>) => {
    updateDraft((current) => ({
      ...current,
      step,
      method: step,
      error: undefined,
      progress: 0,
      progressLabel: undefined,
    }));
  };

  const beginProcessing = async ({
    method,
    file,
    manualEntry,
  }: {
    method: CaptureMethod;
    file?: File;
    manualEntry?: ManualEntryData;
  }) => {
    try {
      const imageUrl =
        file && file.type.startsWith('image/')
          ? await readFileAsDataUrl(file)
          : undefined;

      updateDraft((current) => ({
        ...current,
        step: 'processing',
        method,
        imageUrl: imageUrl ?? current.imageUrl,
        imageName: file?.name ?? current.imageName,
        manualEntry,
        progress: 0,
        progressLabel: 'Preparing your receipt for OCR',
        error: undefined,
      }));

      const result = await simulateReceiptOcr(
        {
          fileName: file?.name,
          manualEntry,
        },
        (progressUpdate: ReceiptOcrProgress) => {
          setDraft((current) => ({
            ...current,
            step: 'processing',
            method,
            imageUrl: imageUrl ?? current.imageUrl,
            imageName: file?.name ?? current.imageName,
            manualEntry,
            progress: progressUpdate.progress,
            progressLabel: progressUpdate.label,
            error: undefined,
            updatedAt: new Date().toISOString(),
          }));
        }
      );

      updateDraft((current) => ({
        ...current,
        step: 'review',
        method,
        imageUrl: imageUrl ?? current.imageUrl,
        imageName: file?.name ?? current.imageName,
        manualEntry,
        merchant: result.merchant,
        receiptTotal: result.receiptTotal,
        items: result.items,
        progress: 100,
        progressLabel: undefined,
        error: undefined,
      }));
    } catch (error) {
      updateDraft((current) => ({
        ...current,
        step: method,
        method,
        error:
          error instanceof Error
            ? error.message
            : 'We could not prepare this receipt. Please try again.',
        progress: 0,
        progressLabel: undefined,
      }));
    }
  };

  const handleCapture = (file: File) => {
    void beginProcessing({ method: 'camera', file });
  };

  const handleFilesChange = (files: File[]) => {
    const file = files[0];
    if (!file) {
      return;
    }

    void beginProcessing({ method: 'upload', file });
  };

  const handleManualSubmit = (manualEntry: ManualEntryData) => {
    const draftItems = createManualReviewItems(manualEntry);

    updateDraft((current) => ({
      ...current,
      step: 'review',
      method: 'manual',
      items: draftItems,
      receiptTotal: Number.parseFloat(manualEntry.amount),
      merchant: manualEntry.merchant.trim() || current.merchant || 'Manual receipt',
      manualEntry,
      progress: 100,
      progressLabel: undefined,
      error: undefined,
    }));
  };

  const handleApply = (items: ParsedItem[]) => {
    setIsApplying(true);

    const normalizedItems = items.filter(
      (item) => item.name.trim().length > 0 && item.quantity > 0
    );
    const receiptTotal =
      draft.receiptTotal > 0
        ? draft.receiptTotal
        : normalizedItems.reduce(
            (sum, item) => sum + item.quantity * item.price,
            0
          );

    updateDraft((current) => ({
      ...current,
      step: 'complete',
      items: normalizedItems,
      receiptTotal,
      error: undefined,
    }));

    onApply({
      imageUrl: draft.imageUrl,
      items: normalizedItems,
      receiptTotal,
      merchant: draft.merchant,
      manualEntry: draft.manualEntry,
    });

    setIsApplying(false);
  };

  const canResumeReview = draft.items.length > 0;
  const hasDraftContent =
    canResumeReview ||
    Boolean(draft.imageUrl) ||
    Boolean(draft.manualEntry?.amount) ||
    Boolean(draft.merchant);

  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 bg-gradient-to-br from-purple-50 via-white to-blue-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">
              Receipt Review Flow
            </p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">
              Capture, scan, correct, and continue
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Camera capture, upload fallback, OCR review, and manual fixes all live
              in one draft-aware flow.
            </p>
          </div>
          <div className="rounded-full border border-purple-100 bg-white px-3 py-1 text-xs font-medium text-gray-600">
            {methodLabel[draft.method]} draft
          </div>
        </div>

        {hasDraftContent && draft.step === 'choose' && (
          <div className="mt-4 rounded-2xl border border-purple-100 bg-white/90 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">Draft saved on this device</p>
                <p className="text-sm text-gray-600">
                  Resume where you left off or clear it and start fresh.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canResumeReview && (
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        step: current.step === 'complete' ? 'complete' : 'review',
                        error: undefined,
                      }))
                    }
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                  >
                    <RefreshCcw size={16} />
                    Resume review
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearDraft}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <Trash2 size={16} />
                  Start over
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {draft.error && (
        <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
          {draft.error}
        </div>
      )}

      {draft.step === 'choose' && (
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <button
            type="button"
            onClick={() => startMethod('camera')}
            className="flex min-h-[180px] flex-col items-start rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-purple-300 hover:bg-purple-50/40"
          >
            <span className="rounded-2xl bg-purple-100 p-3 text-purple-700">
              <Camera size={22} />
            </span>
            <span className="mt-4 text-lg font-semibold text-gray-900">Use camera</span>
            <span className="mt-2 text-sm text-gray-600">
              Launch the rear camera, request permission, and compress the photo
              before OCR.
            </span>
          </button>

          <button
            type="button"
            onClick={() => startMethod('upload')}
            className="flex min-h-[180px] flex-col items-start rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-purple-300 hover:bg-purple-50/40"
          >
            <span className="rounded-2xl bg-blue-100 p-3 text-blue-700">
              <Upload size={22} />
            </span>
            <span className="mt-4 text-lg font-semibold text-gray-900">Upload receipt</span>
            <span className="mt-2 text-sm text-gray-600">
              Fall back to the file picker for an existing receipt image or PDF.
            </span>
          </button>

          <button
            type="button"
            onClick={() => startMethod('manual')}
            className="flex min-h-[180px] flex-col items-start rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-purple-300 hover:bg-purple-50/40"
          >
            <span className="rounded-2xl bg-amber-100 p-3 text-amber-700">
              <PencilLine size={22} />
            </span>
            <span className="mt-4 text-lg font-semibold text-gray-900">Enter manually</span>
            <span className="mt-2 text-sm text-gray-600">
              Start from the total and merchant, then refine the parsed items yourself.
            </span>
          </button>
        </div>
      )}

      {draft.step === 'camera' && (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-gray-900">Capture your receipt</p>
              <p className="text-sm text-gray-600">
                The camera view requests permission when it opens and compresses the
                photo before review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateDraft((current) => ({ ...current, step: 'choose' }))}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Back
            </button>
          </div>
          <CameraCapture onCapture={handleCapture} onError={(error) => {
            updateDraft((current) => ({
              ...current,
              error: error.message,
            }));
          }} />
        </div>
      )}

      {draft.step === 'upload' && (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-gray-900">Upload a receipt</p>
              <p className="text-sm text-gray-600">
                Use an existing image or PDF if taking a photo is not convenient right now.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateDraft((current) => ({ ...current, step: 'choose' }))}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Back
            </button>
          </div>
          <ReceiptUpload
            maxFiles={1}
            onFilesChange={handleFilesChange}
            onManualEntry={handleManualSubmit}
            onError={(error) => {
              updateDraft((current) => ({
                ...current,
                error: error.message,
              }));
            }}
          />
        </div>
      )}

      {draft.step === 'manual' && (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-gray-900">Manual receipt details</p>
              <p className="text-sm text-gray-600">
                We will seed the review with one line item so you can break it down by hand.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateDraft((current) => ({ ...current, step: 'choose' }))}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Back
            </button>
          </div>
          <ManualEntryFallback
            defaultValues={draft.manualEntry}
            onSubmit={handleManualSubmit}
            onCancel={() => updateDraft((current) => ({ ...current, step: 'choose' }))}
          />
        </div>
      )}

      {draft.step === 'processing' && (
        <div className="space-y-5 p-5">
          <div className="flex items-start gap-4 rounded-2xl border border-purple-100 bg-purple-50/70 p-4">
            <span className="rounded-2xl bg-white p-3 text-purple-700 shadow-sm">
              <FileScan size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Running OCR review</p>
              <p className="mt-1 text-sm text-gray-600">
                {draft.progressLabel ?? 'Extracting items from your receipt'}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-purple-100">
                <div
                  className="h-full rounded-full bg-purple-600 transition-all duration-300"
                  style={{ width: `${draft.progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-medium text-purple-700">
                {draft.progress}% complete
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-700">Current source</p>
            <p className="mt-1 text-sm text-gray-600">
              {draft.imageName ?? draft.manualEntry?.merchant ?? 'Receipt draft'}
            </p>
          </div>

          {draft.imageUrl && (
            <img
              src={draft.imageUrl}
              alt="Receipt preview while OCR is running"
              className="max-h-[340px] w-full rounded-2xl border border-gray-200 object-cover"
            />
          )}
        </div>
      )}

      {(draft.step === 'review' || draft.step === 'complete') && (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">
                {draft.merchant || 'Receipt review'}
              </p>
              <p className="text-sm text-gray-600">
                {draft.imageName ?? 'Manual entry'} · Parsed subtotal {parsedTotal.toFixed(2)}{' '}
                {currency}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateDraft((current) => ({ ...current, step: 'choose' }))}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white"
              >
                Replace receipt
              </button>
              <button
                type="button"
                onClick={clearDraft}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white"
              >
                Clear draft
              </button>
            </div>
          </div>

          {draft.step === 'complete' && (
            <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
              <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Receipt applied to this split</p>
                <p className="text-sm">
                  The reviewed items are now reflected below, and this draft stays here
                  if you want to reopen it.
                </p>
              </div>
            </div>
          )}

          <ReceiptParserResults
            imageUrl={draft.imageUrl}
            items={draft.items}
            receiptTotal={draft.receiptTotal || parsedTotal}
            currency={currency}
            onAccept={handleApply}
            onReject={() => updateDraft((current) => ({ ...current, step: 'choose' }))}
            isLoading={isApplying}
          />
        </div>
      )}
    </div>
  );
};
