import type { Item } from '../../types';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/format';

interface ItemListProps {
    items: Item[];
    currency: string;
}

export const ItemList = ({ items, currency }: ItemListProps) => {
    const { t } = useTranslation();
    if (!items || items.length === 0) return null;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
            <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                <h3 className="font-semibold text-gray-700">{t('common.receiptItems')}</h3>
            </div>
            <div className="divide-y divide-gray-50">
                {items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-white">
                        <div>
                            <span className="text-gray-700 font-medium">{item.name}</span>
                            {(item.quantity && item.quantity > 1) || item.unitPrice ? (
                                <p className="text-sm text-gray-500">
                                    {item.quantity ?? 1} x {formatCurrency(item.unitPrice ?? item.price / (item.quantity ?? 1), currency)}
                                </p>
                            ) : null}
                        </div>
                        <span className="font-bold text-gray-900">
                            {formatCurrency(item.price, currency)}
                        </span>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-gray-50/30 flex justify-between items-center text-sm">
                <span className="text-gray-500 italic">{t('common.subtotal')}</span>
                <span className="font-semibold text-gray-600">
                    {formatCurrency(items.reduce((acc, item) => acc + item.price, 0), currency)}
                </span>
            </div>
        </div>
    );
};
