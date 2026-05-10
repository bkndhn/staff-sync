import React, { useState } from 'react';
import { X, MessageCircle, Check, SkipForward, Send } from 'lucide-react';
import { Staff, SalaryDetail } from '../types';

interface BulkSalarySenderProps {
    salaryDetails: SalaryDetail[];
    staff: Staff[];
    onClose: () => void;
    onSend: (detail: SalaryDetail) => void;
    year: number;
    month: number;
}

const BulkSalarySender: React.FC<BulkSalarySenderProps> = ({
    salaryDetails,
    staff,
    onClose,
    onSend,
    year,
    month
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

    // Filter out staff with no phone number or net salary <= 0 (optional, but good practice)
    const eligibleDetails = salaryDetails.filter(detail => {
        const member = staff.find(s => s.id === detail.staffId);
        return member && member.isActive && member.contactNumber;
    });

    const currentDetail = eligibleDetails[currentIndex];
    const currentStaff = currentDetail ? staff.find(s => s.id === currentDetail.staffId) : null;

    const _progress = Math.round(((currentIndex) / eligibleDetails.length) * 100);

    const handleSend = () => {
        if (currentDetail) {
            onSend(currentDetail);
            setCompletedIds(prev => new Set(prev).add(currentDetail.staffId));
            if (currentIndex < eligibleDetails.length - 1) {
                setCurrentIndex(prev => prev + 1);
            }
        }
    };

    const handleSkip = () => {
        if (currentIndex < eligibleDetails.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const _isComplete = currentIndex >= eligibleDetails.length - 1 && completedIds.has(eligibleDetails[eligibleDetails.length - 1]?.staffId);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <MessageCircle className="w-6 h-6" />
                            Rapid WhatsApp Sender
                        </h2>
                        <p className="text-green-100 text-sm mt-1">
                            Sending slips for {new Date(0, month).toLocaleString('default', { month: 'long' })} {year}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {/* Progress Bar */}
                    <div className="mb-6">
                        <div className="flex justify-between text-sm text-gray-600 mb-2">
                            <span>Progress</span>
                            <span className="font-medium">{currentIndex + 1} of {eligibleDetails.length}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 transition-all duration-300 ease-out"
                                style={{ width: `${(Math.min(currentIndex + (completedIds.has(currentDetail?.staffId) ? 1 : 0), eligibleDetails.length) / eligibleDetails.length) * 100}%` }}
                            />
                        </div>
                    </div>

                    {eligibleDetails.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>No eligible staff with phone numbers found for this month.</p>
                        </div>
                    ) : !currentStaff ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">All Done!</h3>
                            <p className="text-gray-600 mb-6">You've cycled through all staff members.</p>
                            <button
                                onClick={onClose}
                                className="btn-premium btn-premium-success px-6 py-2"
                            >
                                Close
                            </button>
                        </div>
                    ) : (
                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg font-bold">
                                    {currentStaff.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">{currentStaff.name}</h3>
                                    <p className="text-sm text-gray-500">{currentStaff.location}</p>
                                </div>
                                <div className="ml-auto text-right">
                                    <p className="text-sm text-gray-500">Net Salary</p>
                                    <p className="text-lg font-bold text-green-600">₹{currentDetail?.netSalary.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleSkip}
                                    className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    <SkipForward size={18} />
                                    Skip
                                </button>
                                <button
                                    onClick={handleSend}
                                    className="flex-[2] px-4 py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2 transform active:scale-95"
                                >
                                    <Send size={18} />
                                    Send WhatsApp
                                </button>
                            </div>

                            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                Phone: {currentStaff.contactNumber || 'N/A'}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkSalarySender;
