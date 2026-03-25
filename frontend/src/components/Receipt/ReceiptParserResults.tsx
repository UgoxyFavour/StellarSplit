import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle } from 'lucide-react';
import {
  ParsedItemEditor,
  type ParsedItem,
} from './ParsedItemEditor';
import { ReceiptImageViewer } from './ReceiptImageViewer';
import { TotalReconciliationBanner } from './TotalReconciliationBanner';

interface ReceiptParserResultsProps {
  imageUrl?: string;
  items: ParsedItem[];
  receiptTotal: number;
  currency: string;
  onAccept: (items: ParsedItem[]) => void;
  onReject: () => void;
  isLoading?: boolean;
}

export const ReceiptParserResults = ({
  imageUrl,
  items: initialItems,
  receiptTotal,
  currency,
  onAccept,
  onReject,
  isLoading = false,
}: ReceiptParserResultsProps) => {
  useTranslation();
  const [items, setItems] = useState<ParsedItem[]>(initialItems);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [acceptingLowConfidence, setAcceptingLowConfidence] = useState(false);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const parsedTotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const lowConfidenceItems = items.filter((item) => item.confidence < 50);
  const hasLowConfidenceItems = lowConfidenceItems.length > 0;

  const highlightRegion = items.find((item) => item.id === hoveredItemId)
    ?.receiptRegion || null;

  const handleAcceptAll = useCallback(() => {
    if (hasLowConfidenceItems && !acceptingLowConfidence) {
      setAcceptingLowConfidence(true);
      return;
    }
    onAccept(items);
  }, [items, hasLowConfidenceItems, acceptingLowConfidence, onAccept]);

  const handleAcceptLowConfidence = useCallback(() => {
    // Mark low confidence items for correction
    const correctedItems = items.map((item) => ({
      ...item,
      confidence: Math.min(item.confidence + 20, 100),
    }));
    setItems(correctedItems);
    setAcceptingLowConfidence(false);
  }, [items]);

  const handleCorrectLowConfidence = useCallback(() => {
    // Filter to show only low confidence items for editing
    const lowConfidenceOnlyItems = items.filter((item) => item.confidence < 50);
    setItems(lowConfidenceOnlyItems);
    setAcceptingLowConfidence(false);
  }, [items]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="p-6 bg-white border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Review Receipt
        </h2>
        <TotalReconciliationBanner
          receiptTotal={receiptTotal}
          parsedTotal={parsedTotal}
          currency={currency}
        />
      </div>

      {/* Low Confidence Warning Dialog */}
      {acceptingLowConfidence && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <XCircle className="text-yellow-600" size={24} />
              <h3 className="text-lg font-semibold text-gray-900">
                Low Confidence Items
              </h3>
            </div>
            <p className="text-gray-600 mb-6">
              {lowConfidenceItems.length} item(s) have low confidence scores.
              Would you like to correct them before proceeding?
            </p>
            <ul className="mb-6 space-y-2">
              {lowConfidenceItems.map((item) => (
                <li key={item.id} className="text-sm text-gray-600">
                  • {item.name} ({item.confidence}%)
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                onClick={handleCorrectLowConfidence}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
              >
                Correct Items
              </button>
              <button
                onClick={handleAcceptLowConfidence}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Accept Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        {/* Image Viewer */}
        <div className="min-h-0">
          {imageUrl ? (
            <ReceiptImageViewer
              imageUrl={imageUrl}
              highlightRegion={highlightRegion}
            />
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
              <div>
                <p className="font-semibold text-gray-700">No receipt image preview</p>
                <p className="mt-2 text-sm">
                  You can still review and correct the parsed line items manually.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Item Editor */}
        <div className="min-h-0">
          <ParsedItemEditor
            items={items}
            currency={currency}
            onItemsChange={setItems}
            onItemHover={setHoveredItemId}
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 bg-white border-t border-gray-200 flex items-center justify-end gap-3">
        <button
          onClick={onReject}
          disabled={isLoading}
          className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reject
        </button>
        <button
          onClick={handleAcceptAll}
          disabled={isLoading || items.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle size={18} /> Accept All
        </button>
      </div>
    </div>
  );
};
