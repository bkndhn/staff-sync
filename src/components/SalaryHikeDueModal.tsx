import React, { useState, useEffect } from 'react';
import { Staff, SalaryHike } from '../types';
import { TrendingUp, X, Download } from 'lucide-react';
import { appSettingsService } from '../services/appSettingsService';

interface SalaryHikeDueModalProps {
    staff: Staff[];
    salaryHikes: SalaryHike[];
    onClose: () => void;
}

const SalaryHikeDueModal: React.FC<SalaryHikeDueModalProps> = ({
    staff,
    salaryHikes,
    onClose
}) => {
    const [defaultInterval, setDefaultInterval] = useState(12);

    useEffect(() => {
        appSettingsService.getDefaultHikeInterval().then(setDefaultInterval);
    }, []);

    const getStaffSalaryHikes = (staffId: string): SalaryHike[] => {
        return salaryHikes
            .filter(h => h.staffId === staffId)
            .sort((a, b) => new Date(b.hikeDate).getTime() - new Date(a.hikeDate).getTime());
    };

    const getHikeIntervalForStaff = (member: Staff): number => {
        return member.hikeIntervalMonths && member.hikeIntervalMonths > 0
            ? member.hikeIntervalMonths
            : defaultInterval;
    };

    // Get staff due for hike based on configurable interval
    const staffDueForHike = staff.filter(member => member.isActive).filter(member => {
        // If staff has a specific next hike date set, use that
        if (member.nextHikeDate) {
            return new Date(member.nextHikeDate) <= new Date();
        }

        const intervalMonths = getHikeIntervalForStaff(member);
        const joinedDate = new Date(member.joinedDate);
        const thresholdDate = new Date();
        thresholdDate.setMonth(thresholdDate.getMonth() - intervalMonths);

        if (joinedDate > thresholdDate) return false;

        const memberHikes = getStaffSalaryHikes(member.id);
        if (memberHikes.length === 0) return true;

        const lastHikeDate = new Date(memberHikes[0].hikeDate);
        return lastHikeDate <= thresholdDate;
    });

    const getMonthsSinceHike = (staffId: string): string => {
        const hikes = getStaffSalaryHikes(staffId);
        if (hikes.length === 0) {
            const member = staff.find(s => s.id === staffId);
            if (member) {
                const joined = new Date(member.joinedDate);
                const now = new Date();
                const years = Math.floor((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24 * 365));
                const months = Math.floor(((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24 * 30)) % 12);
                return `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
            }
            return 'N/A';
        }
        const lastHike = new Date(hikes[0].hikeDate);
        const now = new Date();
        const years = Math.floor((now.getTime() - lastHike.getTime()) / (1000 * 60 * 60 * 24 * 365));
        const months = Math.floor(((now.getTime() - lastHike.getTime()) / (1000 * 60 * 60 * 24 * 30)) % 12);
        return `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
    };

    const exportToExcel = async () => {
        const XLSX = await import('xlsx');
        const data = staffDueForHike.map((member, index) => {
            const hikes = getStaffSalaryHikes(member.id);
            const lastHike = hikes[0];
            return {
                'S.No': index + 1,
                'Name': member.name,
                'Location': member.location,
                'Past Salary': lastHike ? lastHike.oldSalary : (member.initialSalary || 0),
                'Current Salary': member.basicSalary + member.incentive + member.hra,
                'Hiked Salary': lastHike ? (lastHike.newSalary - lastHike.oldSalary) : 0,
                'Last Hike Date': lastHike ? new Date(lastHike.hikeDate).toLocaleDateString() : 'Never',
                'Months Since Hike': getMonthsSinceHike(member.id),
                'Hike Interval': `${getHikeIntervalForStaff(member)} months`,
                'Next Hike Date': member.nextHikeDate || 'Auto'
            };
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Salary Hike Due');
        XLSX.writeFile(wb, `Salary_Hike_Due_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <TrendingUp size={20} />
                        Staff Eligible for Salary Hike ({staffDueForHike.length})
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-white/80">Default: {defaultInterval} months</span>
                        <button
                            onClick={exportToExcel}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            <Download size={16} />
                            Export Excel
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
                <div className="overflow-auto max-h-[calc(80vh-100px)]">
                    <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Location</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Current Salary</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Last Hike</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Since Hike</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Interval</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Next Due</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {staffDueForHike.map((member, index) => {
                                const hikes = getStaffSalaryHikes(member.id);
                                const lastHike = hikes[0];
                                const currentSalary = member.basicSalary + member.incentive + member.hra;
                                const interval = getHikeIntervalForStaff(member);
                                return (
                                    <tr key={member.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{member.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{member.location}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-800">₹{currentSalary.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {lastHike ? new Date(lastHike.hikeDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Never'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-orange-600 font-medium">{getMonthsSinceHike(member.id)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {interval} months
                                            {member.hikeIntervalMonths ? ' (custom)' : ''}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-red-600 font-medium">
                                            {member.nextHikeDate
                                                ? new Date(member.nextHikeDate).toLocaleDateString('en-GB')
                                                : 'Overdue'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="bg-gray-50 px-4 py-3 border-t flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SalaryHikeDueModal;
