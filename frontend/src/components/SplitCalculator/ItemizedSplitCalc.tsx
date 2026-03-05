import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ShoppingCart, Check } from "lucide-react";
import type { Participant, SplitItem } from "./SplitCalculator";

interface ItemizedSplitCalcProps {
  participants: Participant[];
  items: SplitItem[];
  taxAmount: number;
  tipAmount: number;
  currency: string;
  onParticipantsChange: (participants: Participant[]) => void;
  onItemsChange: (items: SplitItem[]) => void;
  onTaxChange: (tax: number) => void;
  onTipChange: (tip: number) => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  XLM: "XLM",
};

export function ItemizedSplitCalc({
  participants,
  items,
  taxAmount,
  tipAmount,
  currency,
  onItemsChange,
  onTaxChange,
  onTipChange,
}: ItemizedSplitCalcProps) {
  const { t } = useTranslation();
  const currencySymbol = CURRENCY_SYMBOLS[currency] || "$";

  const addItem = () => {
    const newItem: SplitItem = {
      id: Date.now().toString(),
      name: "",
      price: 0,
      assignedTo: [],
    };
    onItemsChange([...items, newItem]);
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<SplitItem>) => {
    onItemsChange(
      items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const toggleItemAssignment = (itemId: string, participantId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const isAssigned = item.assignedTo.includes(participantId);
    const newAssignedTo = isAssigned
      ? item.assignedTo.filter((id) => id !== participantId)
      : [...item.assignedTo, participantId];

    updateItem(itemId, { assignedTo: newAssignedTo });
  };

  const assignToAll = (itemId: string) => {
    updateItem(itemId, { assignedTo: participants.map((p) => p.id) });
  };

  const calculateItemShare = (item: SplitItem) => {
    if (item.assignedTo.length === 0) return 0;
    return item.price / item.assignedTo.length;
  };

  const subtotal = useMemo(() => {
    return (
      items.reduce((sum, item) => sum + item.price, 0) + taxAmount + tipAmount
    );
  }, [items, taxAmount, tipAmount]);

  const participantTotals = useMemo(() => {
    const totals: Record<string, number> = {};

    participants.forEach((p) => {
      let total = 0;
      items.forEach((item) => {
        if (item.assignedTo.includes(p.id)) {
          total += calculateItemShare(item);
        }
      });
      totals[p.id] = Math.round(total * 100) / 100;
    });

    // Add tax and tip proportionally
    const itemsTotal = items.reduce((sum, item) => sum + item.price, 0);
    if (itemsTotal > 0) {
      participants.forEach((p) => {
        const proportion = (totals[p.id] || 0) / itemsTotal;
        totals[p.id] += (taxAmount + tipAmount) * proportion;
        totals[p.id] = Math.round(totals[p.id] * 100) / 100;
      });
    }

    return totals;
  }, [participants, items, taxAmount, tipAmount]);

  return (
    <div className="space-y-6">
      {/* Items List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ShoppingCart size={20} aria-hidden="true" />
            {t("calculator.items")} ({items.length})
          </h3>
          <button
            onClick={addItem}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-lg transition-colors"
            aria-label={t("calculator.addItem")}
          >
            <Plus size={16} aria-hidden="true" />
            {t("calculator.add")}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <ShoppingCart size={40} className="mx-auto mb-2 opacity-50" />
            <p>{t("calculator.noItems")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-start gap-3 mb-3">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) =>
                      updateItem(item.id, { name: e.target.value })
                    }
                    placeholder={t("calculator.itemName")}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    aria-label={t("calculator.itemName")}
                  />
                  <div className="relative w-28">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price || ""}
                      onChange={(e) =>
                        updateItem(item.id, {
                          price: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0.00"
                      className="w-full pl-6 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      aria-label={t("calculator.itemPrice")}
                    />
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    aria-label={`${t("calculator.remove")} ${item.name || t("calculator.item")}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* Assignment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {t("calculator.assignTo")}
                    </span>
                    <button
                      onClick={() => assignToAll(item.id)}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {t("calculator.assignAll")}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {participants.map((participant) => {
                      const isAssigned = item.assignedTo.includes(
                        participant.id,
                      );
                      return (
                        <button
                          key={participant.id}
                          onClick={() =>
                            toggleItemAssignment(item.id, participant.id)
                          }
                          className={`px-3 py-1.5 text-sm rounded-full border transition-colors flex items-center gap-1.5 ${
                            isAssigned
                              ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                              : "bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-500 hover:border-[var(--color-primary)]"
                          }`}
                          aria-pressed={isAssigned}
                        >
                          {isAssigned && <Check size={14} />}
                          {participant.name}
                        </button>
                      );
                    })}
                  </div>
                  {item.assignedTo.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {t("calculator.sharePerPerson")}: {currencySymbol}
                      {calculateItemShare(item).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tax and Tip */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="itemized-tax"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            {t("calculator.tax")}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {currencySymbol}
            </span>
            <input
              id="itemized-tax"
              type="number"
              min="0"
              step="0.01"
              value={taxAmount || ""}
              onChange={(e) => onTaxChange(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full pl-8 pr-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="itemized-tip"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            {t("calculator.tip")}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {currencySymbol}
            </span>
            <input
              id="itemized-tip"
              type="number"
              min="0"
              step="0.01"
              value={tipAmount || ""}
              onChange={(e) => onTipChange(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full pl-8 pr-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {t("calculator.breakdown")}
        </h4>
        <div className="space-y-2">
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="flex justify-between items-center"
            >
              <span className="text-gray-700 dark:text-gray-300">
                {participant.name}
              </span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {currencySymbol}
                {(participantTotals[participant.id] || 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {t("calculator.total")}
            </span>
            <span className="font-bold text-[var(--color-primary)]">
              {currencySymbol}
              {subtotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
