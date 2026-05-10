import React, { useState } from 'react';
import { TrendingUp, X } from 'lucide-react';

interface SalaryHikeModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  currentSalary: number;
  newSalary: number;
  onConfirm: (isHike: boolean, reason?: string, hikeDate?: string) => void;
}

const SalaryHikeModal: React.FC<SalaryHikeModalProps> = ({
  isOpen,
  onClose,
  staffName,
  currentSalary,
  newSalary,
  onConfirm
}) => {
  const [isHike, setIsHike] = useState(true);
  const [reason, setReason] = useState('');
  const [hikeDate, setHikeDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const difference = newSalary - currentSalary;
  const isIncrease = difference > 0;

  const handleConfirm = () => {
    onConfirm(isHike, reason, hikeDate);
    onClose();
    setReason('');
    setHikeDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <TrendingUp className="text-green-600" size={24} />
            Salary Change Confirmation
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-800 mb-2">{staffName}</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Current Salary:</span>
                <div className="font-semibold text-gray-800">₹{currentSalary.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-gray-600">New Salary:</span>
                <div className="font-semibold text-green-600">₹{newSalary.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200">
              <span className="text-gray-600">Difference:</span>
              <div className={`font-semibold ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
                {isIncrease ? '+' : ''}₹{difference.toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Is this a salary hike or correction?
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="hike"
                  checked={isHike}
                  onChange={() => setIsHike(true)}
                  className="mr-2"
                />
                <span className="text-sm">Salary Hike (will be tracked in hike history)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="correction"
                  checked={!isHike}
                  onChange={() => setIsHike(false)}
                  className="mr-2"
                />
                <span className="text-sm">Salary Correction (no hike tracking)</span>
              </label>
            </div>
          </div>

          {isHike && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hike Date
                </label>
                <input
                  type="date"
                  value={hikeDate}
                  onChange={(e) => setHikeDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Hike (Optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Performance improvement, Annual increment, Promotion"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Confirm Change
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalaryHikeModal;