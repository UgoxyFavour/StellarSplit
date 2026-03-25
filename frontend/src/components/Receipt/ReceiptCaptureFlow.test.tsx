import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReceiptCaptureFlow } from './ReceiptCaptureFlow';

vi.mock('../CameraCapture', () => ({
  CameraCapture: ({
    onCapture,
  }: {
    onCapture: (file: File) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCapture(new File(['image'], 'receipt.jpg', { type: 'image/jpeg' }))
      }
    >
      Mock capture
    </button>
  ),
}));

vi.mock('../ReceiptUpload', () => ({
  ReceiptUpload: ({
    onFilesChange,
    onManualEntry,
  }: {
    onFilesChange?: (files: File[]) => void;
    onManualEntry?: (data: {
      amount: string;
      date: string;
      merchant: string;
      notes: string;
    }) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onFilesChange?.([
            new File(['image'], 'grocery-receipt.jpg', { type: 'image/jpeg' }),
          ])
        }
      >
        Mock upload
      </button>
      <button
        type="button"
        onClick={() =>
          onManualEntry?.({
            amount: '18.75',
            date: '2026-03-25',
            merchant: 'Corner Store',
            notes: 'Late snack run',
          })
        }
      >
        Mock upload manual
      </button>
    </div>
  ),
  ManualEntryFallback: ({
    onSubmit,
    onCancel,
  }: {
    onSubmit: (data: {
      amount: string;
      date: string;
      merchant: string;
      notes: string;
    }) => void;
    onCancel: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onSubmit({
            amount: '42.00',
            date: '2026-03-25',
            merchant: 'Manual Cafe',
            notes: 'Brunch',
          })
        }
      >
        Submit manual details
      </button>
      <button type="button" onClick={onCancel}>
        Cancel manual details
      </button>
    </div>
  ),
}));

vi.mock('./ReceiptParserResults', () => ({
  ReceiptParserResults: ({
    items,
    onAccept,
    onReject,
  }: {
    items: Array<{ name: string }>;
    onAccept: (items: Array<{ name: string }>) => void;
    onReject: () => void;
  }) => (
    <div>
      <div data-testid="review-item-count">{items.length}</div>
      <button type="button" onClick={() => onAccept(items)}>
        Accept parsed receipt
      </button>
      <button type="button" onClick={onReject}>
        Reject parsed receipt
      </button>
    </div>
  ),
}));

vi.mock('../../utils/receiptOcr', () => ({
  createManualReviewItems: (manualEntry: { amount: string; merchant: string }) => [
    {
      id: 'manual-item-1',
      name: manualEntry.merchant || 'Manual receipt',
      quantity: 1,
      price: Number.parseFloat(manualEntry.amount),
      confidence: 100,
    },
  ],
  simulateReceiptOcr: vi.fn(async (request, onProgress) => {
    onProgress?.({ progress: 45, label: 'Scanning now' });
    onProgress?.({ progress: 100, label: 'Done' });

    if (request.manualEntry) {
      return {
        merchant: request.manualEntry.merchant,
        receiptTotal: Number.parseFloat(request.manualEntry.amount),
        items: [
          {
            id: 'manual-item-1',
            name: request.manualEntry.merchant,
            quantity: 1,
            price: Number.parseFloat(request.manualEntry.amount),
            confidence: 100,
          },
        ],
      };
    }

    return {
      merchant: 'Corner Grocery',
      receiptTotal: 31.5,
      items: [
        {
          id: 'ocr-item-1',
          name: 'Fresh Produce',
          quantity: 1,
          price: 18.5,
          confidence: 91,
        },
        {
          id: 'ocr-item-2',
          name: 'Snacks',
          quantity: 1,
          price: 13,
          confidence: 72,
        },
      ],
    };
  }),
}));

describe('ReceiptCaptureFlow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('lets the user upload a receipt and apply reviewed OCR items', async () => {
    const onApply = vi.fn();

    render(
      <ReceiptCaptureFlow splitId="split-123" currency="USD" onApply={onApply} />
    );

    fireEvent.click(screen.getByRole('button', { name: /upload receipt/i }));
    fireEvent.click(screen.getByRole('button', { name: /^mock upload$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /accept parsed receipt/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /accept parsed receipt/i }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant: 'Corner Grocery',
        receiptTotal: 31.5,
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Fresh Produce' }),
        ]),
      })
    );
  });

  it('keeps a draft in localStorage and resumes review state', async () => {
    const onApply = vi.fn();

    const { unmount } = render(
      <ReceiptCaptureFlow splitId="split-abc" currency="USD" onApply={onApply} />
    );

    fireEvent.click(screen.getByRole('button', { name: /upload receipt/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock upload manual/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /accept parsed receipt/i })).toBeInTheDocument()
    );

    unmount();

    render(
      <ReceiptCaptureFlow splitId="split-abc" currency="USD" onApply={onApply} />
    );

    expect(screen.getByText(/corner store/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept parsed receipt/i })).toBeInTheDocument();
  });
});
