import { useState, useEffect } from 'react';
import { Share2, ChevronLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { SplitHeader } from '../../components/Split/SplitHeader';
import { ParticipantList } from '../../components/Split/ParticipantList';
import { ItemList } from '../../components/Split/ItemList';
import {
    ReceiptCaptureFlow,
    ReceiptImage,
    type ParsedItem,
} from '../../components/Receipt';
import { PaymentButton } from '../../components/Payment/PaymentButton';
import { PaymentModal } from '../../components/Payment/PaymentModal';
import { ShareModal } from '../../components/Split/ShareModal';
import { signAndSubmitPayment } from '../../utils/stellar/wallet';
import { LoadingSkeleton } from '../../components/Split/LoadingSkeleton';
import { useCollaboration } from '../../hooks/useCollaboration';
import { PresenceIndicator, LiveActivityFeed, ConflictResolver } from '../../components/Collaboration';
import type { Split, Participant } from '../../types';
import { useTranslation } from 'react-i18next';
import type { ParsedStellarPaymentURI } from '../../utils/stellar/paymentUri';

// Mock Data
const MOCK_SPLIT: Split = {
    id: 'split_123',
    title: 'Dinner at Nobu',
    totalAmount: 450.00,
    currency: 'USD',
    date: new Date().toISOString(),
    status: 'active',
    receiptUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=600',
    participants: [
        { id: '1', name: 'You', amountOwed: 112.50, status: 'pending', isCurrentUser: true },
        { id: '2', name: 'Sarah M.', amountOwed: 112.50, status: 'paid', avatar: 'https://i.pravatar.cc/150?u=1' },
        { id: '3', name: 'Mike R.', amountOwed: 112.50, status: 'pending', avatar: 'https://i.pravatar.cc/150?u=2' },
        { id: '4', name: 'Jessica L.', amountOwed: 112.50, status: 'paid', avatar: 'https://i.pravatar.cc/150?u=3' },
    ],
    items: [
        { name: 'Sashimi Platter', price: 120.00 },
        { name: 'Wagyu Steak', price: 180.00 },
        { name: 'Omakase Selection', price: 150.00 },
    ]
};
const MOCK_DESTINATION = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA6NSWVE2YQYCVY75HL7P5G4U2DI';

export const SplitDetailPage = () => {
    const { t } = useTranslation();
    const [split, setSplit] = useState<Split>(MOCK_SPLIT);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [showReceiptUpload, setShowReceiptUpload] = useState(false);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const { joinSplit, leaveSplit, sendUpdate, updateCursor, presence } = useCollaboration();

    // Track local cursor
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // throttle in real app
            updateCursor(e.clientX, e.clientY);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [updateCursor]);

    // Simulate initial fetch
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
            // Join collaboration room once loaded
            joinSplit(MOCK_SPLIT.id, {
                userId: 'user-123',
                name: t('common.you'),
                activeView: 'split-details'
            });
        }, 1500);
        return () => {
            clearTimeout(timer);
            leaveSplit(); // cleanup on unmount
        };
    }, [joinSplit, leaveSplit]);

    const currentUser = split.participants.find(p => p.isCurrentUser);
    const shouldShowPayment = currentUser && currentUser.status === 'pending';

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 pt-16">
                <LoadingSkeleton />
            </div>
        );
    }

    const handlePayment = async () => {
        if (!currentUser) return;

        setIsProcessingPayment(true);
        try {
            const result = await signAndSubmitPayment(currentUser.amountOwed, MOCK_DESTINATION);
            if (result.success) {
                setPaymentStatus('success');
                setSplit(prev => {
                    const newParticipants: Participant[] = prev.participants.map(p =>
                        p.isCurrentUser ? { ...p, status: 'paid' as const } : p
                    );
                    const allPaid = newParticipants.every(p => p.status === 'paid');
                    return {
                        ...prev,
                        participants: newParticipants,
                        status: allPaid ? 'completed' : prev.status
                    };
                });
                sendUpdate({ type: 'payment-status', payload: { status: 'paid', amount: currentUser.amountOwed }, userId: 'user-123' });
                setTimeout(() => {
                    setIsPaymentModalOpen(false);
                    setPaymentStatus('idle');
                }, 1500);
            } else {
                setPaymentStatus('error');
                setTimeout(() => setPaymentStatus('idle'), 3000);
            }
        } catch (error) {
            setPaymentStatus('error');
            setTimeout(() => setPaymentStatus('idle'), 3000);
            console.error("Payment failed", error);
        } finally {
            setIsProcessingPayment(false);
        }
    };

    const handleScannedPayment = async (payment: ParsedStellarPaymentURI) => {
        const amount = payment.amount ?? currentUser?.amountOwed ?? 0;
        if (!currentUser || amount <= 0) {
            throw new Error('Scanned payment does not include a valid amount');
        }

        setIsProcessingPayment(true);
        try {
            const result = await signAndSubmitPayment(amount, payment.destination);
            if (result.success) {
                setPaymentStatus('success');
                setSplit(prev => {
                    const newParticipants: Participant[] = prev.participants.map(p =>
                        p.isCurrentUser ? { ...p, status: 'paid' as const } : p
                    );
                    const allPaid = newParticipants.every(p => p.status === 'paid');
                    return {
                        ...prev,
                        participants: newParticipants,
                        status: allPaid ? 'completed' : prev.status
                    };
                });
                sendUpdate({
                    type: 'payment-status',
                    payload: { status: 'paid', amount, destination: payment.destination },
                    userId: 'user-123'
                });
                setTimeout(() => {
                    setIsPaymentModalOpen(false);
                    setPaymentStatus('idle');
                }, 1500);
            } else {
                throw new Error('Payment submission failed');
            }
        } catch (error) {
            setPaymentStatus('error');
            setTimeout(() => setPaymentStatus('idle'), 3000);
            throw error;
        } finally {
            setIsProcessingPayment(false);
        }
    };

    const handleReceiptApply = ({
        imageUrl,
        items,
        receiptTotal,
    }: {
        imageUrl?: string;
        items: ParsedItem[];
        receiptTotal: number;
    }) => {
        setSplit((prev) => ({
            ...prev,
            receiptUrl: imageUrl ?? prev.receiptUrl,
            totalAmount: receiptTotal > 0 ? receiptTotal : prev.totalAmount,
            items: items.map((item) => ({
                name: item.name,
                price: item.quantity * item.price,
                quantity: item.quantity,
                unitPrice: item.price,
                confidence: item.confidence,
            })),
        }));

        sendUpdate({
            type: 'receipt-reviewed',
            payload: {
                itemCount: items.length,
                total: receiptTotal,
            },
            userId: 'user-123',
        });
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-32 md:pb-12">
            {/* Feedback Toast */}
            {paymentStatus !== 'idle' && (
                <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 ${paymentStatus === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                    {paymentStatus === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <span className="font-bold">
                        {paymentStatus === 'success' ? t('common.settledSuccessfully') : t('common.paymentFailed')}
                    </span>
                </div>
            )}
            {/* Top Navigation */}
            <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex justify-between items-center px-4 py-3 md:hidden">
                <button className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <span className="font-bold text-gray-900">{t('common.splitDetails')}</span>
                <button
                    onClick={() => setIsShareModalOpen(true)}
                    className="p-2 -mr-2 text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
                >
                    <Share2 size={24} />
                </button>
            </div>

            <div className="max-w-lg mx-auto p-4 md:p-8">
                {/* Desktop Nav */}
                <div className="hidden md:flex justify-between items-center mb-8">
                    <button className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium transition-colors">
                        <div className="p-1 rounded-full bg-gray-100"><ChevronLeft size={20} /></div>
                        {t('common.backToDashboard')}
                    </button>
                    <button
                        onClick={() => setIsShareModalOpen(true)}
                        className="flex items-center gap-2 text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-xl font-bold transition-colors"
                    >
                        <Share2 size={18} /> {t('common.shareSplit')}
                    </button>
                </div>

                <SplitHeader split={split} />

                <div className="mb-6">
                    <PresenceIndicator />
                </div>

                <ReceiptImage imageUrl={split.receiptUrl} />

                <div className="mt-4">
                    <button
                        type="button"
                        onClick={() => setShowReceiptUpload((v) => !v)}
                        className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                    >
                        {showReceiptUpload ? 'Hide receipt review flow' : 'Scan or replace receipt'}
                    </button>
                    {showReceiptUpload && (
                        <div className="mt-3">
                            <ReceiptCaptureFlow
                                splitId={split.id}
                                currency={split.currency}
                                onApply={handleReceiptApply}
                            />
                        </div>
                    )}
                </div>

                <ItemList
                    items={split.items || []}
                    currency={split.currency}
                />

                <ParticipantList
                    participants={split.participants}
                    currency={split.currency}
                />

                {shouldShowPayment && (
                    <PaymentButton
                        amount={currentUser.amountOwed}
                        currency={split.currency}
                        onClick={() => setIsPaymentModalOpen(true)}
                    />
                )}

                <div className="mt-8">
                    <LiveActivityFeed />
                </div>
            </div>

            {shouldShowPayment && (
                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    amount={currentUser.amountOwed}
                    currency={split.currency}
                    destination={MOCK_DESTINATION}
                    splitId={split.id}
                    onConfirm={handlePayment}
                    onConfirmScannedPayment={handleScannedPayment}
                    isProcessing={isProcessingPayment}
                />
            )}

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                splitLink={`https://stellarsplit.app/split/${split.id}`}
            />

            <ConflictResolver />

            {/* Render Remote Cursors via Yjs CRDT */}
            {Object.values(presence).map(user => {
                if (!user.cursor || user.userId === 'user-123') return null; // don't draw own cursor
                return (
                    <div
                        key={user.userId}
                        className="fixed pointer-events-none z-50 transition-all duration-75 ease-linear flex flex-col items-start gap-1"
                        style={{ left: user.cursor.x, top: user.cursor.y }}
                    >
                        <svg width="18" height="24" viewBox="0 0 18 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2.5 0L17.5 15H11.5L8.5 24L2.5 0Z" fill="#A855F7" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                        <span className="bg-purple-500 text-white text-xs px-2 py-0.5 rounded shadow-sm whitespace-nowrap">
                            {user.name}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};
