import React, { useState, useMemo, useEffect } from 'react';
import { OldStaffRecord } from '../types';
import { Archive, Download, Eye, UserPlus, Trash2, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { exportOldStaffPDF, OLD_STAFF_PDF_COLUMNS } from '../utils/pdfExport';
import { customConfirm } from './CustomDialog';
import ListFilterBar from './ui/ListFilterBar';

interface OldStaffRecordsProps {
  oldStaffRecords: OldStaffRecord[];
  onRejoinStaff: (record: OldStaffRecord) => void;
  onPermanentDelete: (record: OldStaffRecord) => void;
  loading?: boolean;
}

const PAGE_SIZE = 20;

const ARCHIVE_SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'left', label: 'Left date' },
  { key: 'salary', label: 'Last salary' },
  { key: 'advance', label: 'Outstanding' },
];

const OldStaffRecords: React.FC<OldStaffRecordsProps> = ({ oldStaffRecords, onRejoinStaff, onPermanentDelete, loading = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<OldStaffRecord | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>(() => {
    try { return JSON.parse(localStorage.getItem('archiveSort') || '') || { key: 'name', dir: 'asc' }; }
    catch { return { key: 'name', dir: 'asc' }; }
  });
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('archiveColumns') || '') || OLD_STAFF_PDF_COLUMNS.map(c => c.key); }
    catch { return OLD_STAFF_PDF_COLUMNS.map(c => c.key); }
  });

  const filteredRecords = useMemo(() => {
    const list = oldStaffRecords.filter(record =>
      record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.reason.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'left': return (new Date(a.leftDate).getTime() - new Date(b.leftDate).getTime()) * dir;
        case 'salary': return (a.totalSalary - b.totalSalary) * dir;
        case 'advance': return (a.totalAdvanceOutstanding - b.totalAdvanceOutstanding) * dir;
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [oldStaffRecords, searchTerm, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [searchTerm]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  const pagedRecords = filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getLocationColor = (location: string) => {
    switch (location) {
      case 'Big Shop': return 'badge-premium badge-info';
      case 'Small Shop': return 'badge-premium badge-success';
      case 'Godown': return 'badge-premium badge-purple';
      default: return 'badge-premium badge-neutral';
    }
  };

  const handleExportPDF = () => {
    exportOldStaffPDF(filteredRecords, visibleColumns);
  };

  const handleRejoin = async (record: OldStaffRecord) => {
    if (await customConfirm(`Are you sure you want to rejoin ${record.name}? This will restore them to active staff with their previous salary and advance data.`)) {
      onRejoinStaff(record);
    }
  };

  const handleDelete = async (record: OldStaffRecord) => {
    if (await customConfirm(`PERMANENT DELETE: Are you sure you want to permanently delete ${record.name}?\n\nThis will remove ALL their data including attendance and salary history. This action CANNOT be undone.`)) {
      onPermanentDelete(record);
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
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl md:text-3xl font-bold text-white flex items-center gap-2">
          <Archive className="text-white/80" size={24} />
          Old Staff Records
        </h1>
        <button
          onClick={handleExportPDF}
          className="flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-white text-gray-700 text-sm font-semibold shadow-sm active:bg-gray-100 transition-colors"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Export PDF</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 md:p-6">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, location, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 min-h-[44px] border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base md:text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-white/90">Archived ({filteredRecords.length})</h2>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <Archive className="mx-auto text-gray-300 mb-3" size={40} />
            <h3 className="text-base font-medium text-gray-900 mb-1">No archived records found</h3>
            <p className="text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : 'Archived staff records will appear here.'}
            </p>
          </div>
        ) : (
          pagedRecords.map((record) => {
            const isOpen = expanded.has(record.id);
            return (
              <div key={record.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpanded(record.id)}
                  className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50"
                >
                  {record.photo ? (
                    <img src={record.photo} alt="" className="w-11 h-11 rounded-full object-cover border border-gray-200" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-semibold">
                      {record.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 truncate">{record.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {record.location} · {calcExperience(record.joinedDate, record.leftDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-600">₹{record.totalSalary.toLocaleString()}</div>
                    {record.totalAdvanceOutstanding > 0 && (
                      <div className="text-[11px] text-red-600 font-medium">Adv ₹{record.totalAdvanceOutstanding.toLocaleString()}</div>
                    )}
                  </div>
                  {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/60">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-white border border-gray-100 p-2">
                        <div className="text-[11px] text-gray-500">Type</div>
                        <div className="font-medium text-gray-900">{record.type === 'full-time' ? 'Full-Time' : 'Part-Time'}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-gray-100 p-2">
                        <div className="text-[11px] text-gray-500">Contact</div>
                        <div className="font-medium text-gray-900 truncate">{record.contactNumber || '-'}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-gray-100 p-2">
                        <div className="text-[11px] text-gray-500">Basic</div>
                        <div className="font-medium text-gray-900">₹{record.basicSalary.toLocaleString()}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-gray-100 p-2">
                        <div className="text-[11px] text-gray-500">Incentive</div>
                        <div className="font-medium text-gray-900">₹{record.incentive.toLocaleString()}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-gray-100 p-2">
                        <div className="text-[11px] text-gray-500">HRA</div>
                        <div className="font-medium text-gray-900">₹{record.hra.toLocaleString()}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-gray-100 p-2">
                        <div className="text-[11px] text-gray-500">Period</div>
                        <div className="font-medium text-gray-900 text-xs">{record.joinedDate} → {record.leftDate}</div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 p-2 text-sm">
                      <div className="text-[11px] text-gray-500">Reason</div>
                      <div className="text-gray-900">{record.reason}</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedRecord(record)}
                        className="flex-1 min-h-[44px] rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold flex items-center justify-center gap-2 active:bg-blue-100"
                      >
                        <Eye size={16} /> View
                      </button>
                      <button
                        onClick={() => handleRejoin(record)}
                        className="flex-1 min-h-[44px] rounded-xl bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-2 active:bg-green-700"
                      >
                        <UserPlus size={16} /> Rejoin
                      </button>
                      <button
                        onClick={() => handleDelete(record)}
                        aria-label="Permanently delete"
                        className="min-h-[44px] w-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center active:bg-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {filteredRecords.length > PAGE_SIZE && (
          <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 p-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-[40px] px-3 rounded-xl text-sm font-medium text-gray-700 disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-[40px] px-3 rounded-xl text-sm font-medium text-gray-700 disabled:opacity-40 flex items-center gap-1"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Records Table (desktop) */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
          <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emp Code</th>
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
                {pagedRecords.map((record, index) => {
                  const experience = calcExperience(record.joinedDate, record.leftDate);

                  return (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{(page - 1) * PAGE_SIZE + index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
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
                            onClick={() => handleDelete(record)}
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

          {filteredRecords.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
              <span className="text-sm text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-4 md:p-6 w-full md:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 md:mb-6 sticky top-0 bg-white pb-2">
              <h3 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2 min-w-0">
                <Archive className="text-gray-600 shrink-0" size={22} />
                <span className="truncate">{selectedRecord.name}</span>
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X size={20} />
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

            <div className="mt-6 flex flex-col-reverse md:flex-row md:justify-between gap-2">
              <button
                onClick={() => setSelectedRecord(null)}
                className="min-h-[44px] px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => handleRejoin(selectedRecord)}
                className="flex items-center justify-center gap-2 min-h-[44px] px-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold"
              >
                <UserPlus size={16} />
                Rejoin Staff
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OldStaffRecords;
