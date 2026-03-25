import type { ParsedItem } from '../components/Receipt';
import type { ManualEntryData } from '../components/ReceiptUpload';

export interface ReceiptOcrProgress {
  progress: number;
  label: string;
}

export interface ReceiptOcrRequest {
  fileName?: string;
  manualEntry?: ManualEntryData;
}

export interface ReceiptOcrResult {
  merchant: string;
  receiptTotal: number;
  items: ParsedItem[];
}

const RECEIPT_STEPS: ReceiptOcrProgress[] = [
  { progress: 14, label: 'Optimizing the receipt image' },
  { progress: 33, label: 'Detecting text blocks and totals' },
  { progress: 56, label: 'Extracting likely line items' },
  { progress: 79, label: 'Reconciling quantities and prices' },
  { progress: 100, label: 'Preparing your review screen' },
];

const MERCHANT_FIXTURES = [
  {
    merchant: 'Nobu',
    keywords: ['nobu', 'sushi', 'dinner'],
    items: [
      { name: 'Sashimi Platter', quantity: 1, price: 120, confidence: 94 },
      { name: 'Wagyu Steak', quantity: 1, price: 180, confidence: 91 },
      { name: 'Omakase Selection', quantity: 1, price: 150, confidence: 46 },
    ],
  },
  {
    merchant: 'Corner Grocery',
    keywords: ['grocery', 'market', 'store'],
    items: [
      { name: 'Fresh Produce', quantity: 1, price: 18.5, confidence: 92 },
      { name: 'Household Supplies', quantity: 1, price: 12.25, confidence: 87 },
      { name: 'Snacks & Drinks', quantity: 2, price: 6.4, confidence: 63 },
    ],
  },
  {
    merchant: 'Cafe Meridian',
    keywords: ['cafe', 'coffee', 'brunch'],
    items: [
      { name: 'Flat White', quantity: 2, price: 4.75, confidence: 96 },
      { name: 'Avocado Toast', quantity: 1, price: 11.5, confidence: 84 },
      { name: 'Breakfast Bowl', quantity: 1, price: 13.25, confidence: 49 },
    ],
  },
  {
    merchant: 'Urban Grill',
    keywords: ['grill', 'burger', 'lunch'],
    items: [
      { name: 'Signature Burger', quantity: 2, price: 13.5, confidence: 89 },
      { name: 'Loaded Fries', quantity: 1, price: 8.75, confidence: 78 },
      { name: 'Soft Drinks', quantity: 3, price: 3.25, confidence: 57 },
    ],
  },
];

const FALLBACK_ITEMS = [
  'Shared Appetizer',
  'Main Course',
  'Dessert',
  'Beverage',
  'Side Dish',
  'Service Charge',
];

const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const createSeed = (value: string) =>
  Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);

const clampCurrency = (value: number) => Math.round(value * 100) / 100;

const buildParsedItems = (
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    confidence: number;
  }>
): ParsedItem[] =>
  items.map((item, index) => ({
    id: `ocr-item-${index + 1}`,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    confidence: item.confidence,
    receiptRegion: {
      x: 8,
      y: 16 + index * 14,
      width: 76,
      height: 10,
    },
  }));

const buildFallbackItems = (seed: number): ParsedItem[] =>
  FALLBACK_ITEMS.slice(0, 4).map((label, index) => {
    const quantity = (seed + index) % 3 === 0 ? 2 : 1;
    const price = clampCurrency(7.5 + ((seed + index * 11) % 17) * 1.35);
    const confidence = index === 2 ? 48 : 68 + ((seed + index * 5) % 24);

    return {
      id: `ocr-item-${index + 1}`,
      name: label,
      quantity,
      price,
      confidence,
      receiptRegion: {
        x: 8,
        y: 16 + index * 14,
        width: 76,
        height: 10,
      },
    };
  });

export const createManualReviewItems = (
  manualEntry: ManualEntryData
): ParsedItem[] => {
  const amount = Number.parseFloat(manualEntry.amount);
  const safeAmount = Number.isFinite(amount) ? clampCurrency(amount) : 0;
  const merchantLabel = manualEntry.merchant.trim() || 'Receipt item';

  return [
    {
      id: 'manual-item-1',
      name: merchantLabel,
      quantity: 1,
      price: safeAmount,
      confidence: 100,
    },
  ];
};

export const simulateReceiptOcr = async (
  request: ReceiptOcrRequest,
  onProgress?: (progress: ReceiptOcrProgress) => void
): Promise<ReceiptOcrResult> => {
  for (const step of RECEIPT_STEPS) {
    onProgress?.(step);
    await delay(220);
  }

  if (request.manualEntry) {
    const items = createManualReviewItems(request.manualEntry);
    const total = items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );

    return {
      merchant: request.manualEntry.merchant.trim() || 'Manual receipt',
      receiptTotal: clampCurrency(total),
      items,
    };
  }

  const normalizedName = request.fileName?.toLowerCase() ?? 'receipt';
  const fixture = MERCHANT_FIXTURES.find(({ keywords }) =>
    keywords.some((keyword) => normalizedName.includes(keyword))
  );

  if (fixture) {
    const items = buildParsedItems(fixture.items);
    const receiptTotal = clampCurrency(
      items.reduce((sum, item) => sum + item.quantity * item.price, 0)
    );

    return {
      merchant: fixture.merchant,
      receiptTotal,
      items,
    };
  }

  const seed = createSeed(normalizedName);
  const items = buildFallbackItems(seed);
  const receiptTotal = clampCurrency(
    items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  );

  return {
    merchant: 'Scanned receipt',
    receiptTotal,
    items,
  };
};
