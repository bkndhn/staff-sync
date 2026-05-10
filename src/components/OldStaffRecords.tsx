import React, { useState } from 'react';
import { OldStaffRecord } from '../types';
import { Archive, Download, Eye, UserPlus, Trash2 } from 'lucide-react';
import { exportOldStaffPDF } from '../utils/pdfExport';

interface OldStaffRecordsProps {
  oldStaffRecords: OldStaffRecord[];
  onRejoinStaff: (record: OldStaffRecord) => void;
  onPermanentDelete: (record: OldStaffRecord) => void;
}

const OldStaffRecords: React.FC<OldStaffRecordsProps> = ({ oldStaffRecords, onRejoinStaff, onPermanentDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<OldStaffRecord | null>(null);

  const filteredRecords = oldStaffRecords.filter(record =>
    record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLocationColor = (location: string) => {
    switch (location) {
      case 'Big Shop': return 'badge-premium badge-info';
      case 'Small Shop': return 'badge-premium badge-success';
      case 'Godown': return 'badge-premium badge-purple';
      default: return 'badge-premium badge-neutral';
    }
  };

  const handleExportPDF = () => {
    exportOldStaffPDF(oldStaffRecords);
  };

  const handleRejoin = (record: OldStaffRecord) => {
    if (window.confirm(`Are you sure you want to rejoin ${record.name}? This will restore them to active staff with their previous salary and advance data.`)) {
      onRejoinStaff(record);
    }
  };

  // Calculate experience from joined date to left date
  const calcExperience = (joinedDate: string, leftDate: string) => {
    const joined = new Date(joinedDate);
    const left = new Date(leftDate);
    
    let years = left.getFullYear() - joined.getFullYear();
    let months = left.getMonth() - joined.getMonth();
    
    if (months < 0) {
      years--;
      months += 12;
    }
    
    // Adjust for day difference
    if (left.getDate() < joined.getDate()) {
      months--;
      if (months < 0) {
        years--;
        months += 12;
      }
    }
    
    years = Math.max(0, years);
    months = Math.max(0, months);
    
    return `${years}y ${months}m`;
  };

  return (
    <div className="p-2 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <Archive className="text-white/80" size={28} />
          Old Staff Records
        </h1>
        <div className="flex gap-3">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search by name, location, or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Archived Staff Records ({filteredRecords.length})
          </h2>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center">
            <Archive className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No archived records found</h3>
            <p className="text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : 'Archived staff records will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                  <th className="sticky left-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff Type</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Basic</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Incentive</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HRA</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Salary</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding Advance</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRecords.map((record, index) => {
                  const experience = calcExperience(record.joinedDate, record.leftDate);

                  return (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                      <td className="sticky left-0 z-10 bg-white px-6 py-4 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="flex items-center gap-3">
                          {record.photo && (
                            <img src={record.photo} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{record.name}</div>
                            <div className="text-sm text-gray-500">
                              {record.joinedDate} - {record.leftDate}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getLocationColor(record.location)}>
                          {record.location}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          {record.type === 'full-time' ? 'Full-Time' : 'Part-Time'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium">
                        {experience}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₹{record.basicSalary.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₹{record.incentive.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₹{record.hra.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                        ₹{record.totalSalary.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-semibold ${record.totalAdvanceOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹{record.totalAdvanceOutstanding.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.contactNumber || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                        {record.reason}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedRecord(record)}
                            className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                            title="View details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleRejoin(record)}
                            className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors"
                            title="Rejoin staff"
                          >
                            <UserPlus size={16} />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`PERMANENT DELETE: Are you sure you want to permanently delete ${record.name}?\n\nThis will remove ALL their data including attendance and salary history. This action CANNOT be undone.`)) {
                                onPermanentDelete(record);
                              }
                            }}
                            className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors"
                            title="Permanently delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Archive className="text-gray-600" size={24} />
                {selectedRecord.name} - Staff Record
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 border-b pb-2">Personal Information</h4>
                {selectedRecord.photo && (
                  <div className="flex justify-center md:justify-start mb-2">
                    <img src={selectedRecord.photo} alt={selectedRecord.name} className="w-24 h-24 rounded-full object-cover border-4 border-gray-100 shadow-sm" />
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Name:</span> {selectedRecord.name}</div>
                  <div><span className="font-medium">Location:</span> {selectedRecord.location}</div>
                  <div><span className="font-medium">Staff Type:</span> {selectedRecord.type === 'full-time' ? 'Full-Time' : 'Part-Time'}</div>
                  <div><span className="font-medium">Contact:</span> {selectedRecord.contactNumber || 'N/A'}</div>
                  <div><span className="font-medium">Address:</span> {selectedRecord.address || 'N/A'}</div>
                  <div><span className="font-medium">Experience (Worked):</span> {calcExperience(selectedRecord.joinedDate, selectedRecord.leftDate)}</div>
                  <div><span className="font-medium">Joined:</span> {selectedRecord.joinedDate}</div>
                  <div><span className="font-medium">Left:</span> {selectedRecord.leftDate}</div>
                  <div><span className="font-medium">Reason:</span> {selectedRecord.reason}</div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 border-b pb-2">Salary Information</h4>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Basic Salary:</span> ₹{selectedRecord.basicSalary.toLocaleString()}</div>
                  <div><span className="font-medium">Incentive:</span> ₹{selectedRecord.incentive.toLocaleString()}</div>
                  <div><span className="font-medium">HRA:</span> ₹{selectedRecord.hra.toLocaleString()}</div>
                  <div><span className="font-medium">Total Salary:</span> ₹{selectedRecord.totalSalary.toLocaleString()}</div>
                  <div>
                    <span className="font-medium">Outstanding Advance:</span>
                    <span className={`ml-1 font-semibold ${selectedRecord.totalAdvanceOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{selectedRecord.totalAdvanceOutstanding.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => handleRejoin(selectedRecord)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <UserPlus size={16} />
                Rejoin Staff
              </button>
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OldStaffRecords;
