import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, AlertTriangle, Check, Download, Info } from 'lucide-react';
import { Staff, Attendance } from '../types';
import { isSunday } from '../utils/salaryCalculations';
import * as XLSX from 'xlsx';

interface BulkAttendanceUploadProps {
  staff: Staff[];
  onImport: (records: Omit<Attendance, 'id'>[]) => Promise<void>;
  onClose: () => void;
}

interface ParsedRow {
  rowNum: number;
  staffName: string;
  date: string;
  status: 'Present' | 'Half Day' | 'Absent';
  shift?: 'Morning' | 'Evening' | 'Both';
  location?: string;
  matchedStaff?: Staff;
  error?: string;
}

const BulkAttendanceUpload: React.FC<BulkAttendanceUploadProps> = ({ staff, onImport, onClose }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<{ success: number; errors: number }>({ success: 0, errors: 0 });
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeStaff = staff.filter(s => s.isActive && s.type === 'full-time');

  const normalizeStatus = (raw: string): 'Present' | 'Half Day' | 'Absent' | null => {
    const val = raw?.toString().trim().toUpperCase();
    if (!val) return null;
    if (['P', 'PRESENT', '1', 'YES'].includes(val)) return 'Present';
    if (['H', 'HD', 'HALF', 'HALF DAY', 'HALFDAY', '0.5', 'HM', 'HE'].includes(val)) return 'Half Day';
    if (['A', 'ABSENT', '0', 'NO', 'L', 'LEAVE'].includes(val)) return 'Absent';
    return null;
  };

  const normalizeShift = (raw: string): 'Morning' | 'Evening' | 'Both' | undefined => {
    const val = raw?.toString().trim().toUpperCase();
    if (!val) return undefined;
    if (['M', 'MORNING', 'AM'].includes(val)) return 'Morning';
    if (['E', 'EVENING', 'PM'].includes(val)) return 'Evening';
    if (['B', 'BOTH', 'FULL'].includes(val)) return 'Both';
    return undefined;
  };

  const parseDate = (raw: any): string | null => {
    if (!raw) return null;
    // Handle Excel serial date numbers
    if (typeof raw === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + raw * 86400000);
      return date.toISOString().split('T')[0];
    }
    const str = raw.toString().trim();
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // Try DD/MM/YYYY or DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    // Try MM/DD/YYYY
    const mdy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (mdy) {
      const m = parseInt(mdy[1]), d = parseInt(mdy[2]);
      if (m <= 12 && d <= 31) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
    }
    // Try Date parse
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    return null;
  };

  const matchStaff = (name: string): Staff | undefined => {
    if (!name) return undefined;
    const normalized = name.trim().toLowerCase();
    return activeStaff.find(s => s.name.toLowerCase() === normalized) ||
      activeStaff.find(s => s.name.toLowerCase().includes(normalized) || normalized.includes(s.name.toLowerCase()));
  };

  const findColumn = (headers: string[], keywords: string[]): number => {
    return headers.findIndex(h => {
      const normalized = h?.toString().toLowerCase().trim() || '';
      return keywords.some(k => normalized.includes(k));
    });
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, raw: true });

        if (json.length < 2) {
          alert('File must have at least a header row and one data row.');
          return;
        }

        const headers = (json[0] as any[]).map(h => h?.toString() || '');
        const nameCol = findColumn(headers, ['name', 'staff', 'employee', 'person']);
        const dateCol = findColumn(headers, ['date', 'day']);
        const statusCol = findColumn(headers, ['status', 'attendance', 'present', 'mark']);
        const shiftCol = findColumn(headers, ['shift', 'time']);
        const locationCol = findColumn(headers, ['location', 'branch', 'shop', 'place']);

        if (nameCol === -1 || dateCol === -1 || statusCol === -1) {
          alert('Could not find required columns. Please ensure your file has columns for: Staff Name, Date, and Status/Attendance.');
          return;
        }

        const rows: ParsedRow[] = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i] as any[];
          if (!row || row.length === 0 || !row[nameCol]) continue;

          const staffName = row[nameCol]?.toString().trim() || '';
          const dateRaw = row[dateCol];
          const statusRaw = row[statusCol]?.toString() || '';
          const shiftRaw = shiftCol !== -1 ? row[shiftCol]?.toString() : '';
          const locationRaw = locationCol !== -1 ? row[locationCol]?.toString() : '';

          const date = parseDate(dateRaw);
          const status = normalizeStatus(statusRaw);
          const shift = normalizeShift(shiftRaw || '');
          const matched = matchStaff(staffName);

          let error: string | undefined;
          if (!matched) error = `Staff "${staffName}" not found`;
          else if (!date) error = `Invalid date: "${dateRaw}"`;
          else if (!status) error = `Invalid status: "${statusRaw}"`;

          rows.push({
            rowNum: i + 1,
            staffName,
            date: date || '',
            status: status || 'Absent',
            shift,
            location: locationRaw?.trim() || matched?.location,
            matchedStaff: matched,
            error,
          });
        }

        setParsedRows(rows);
        setStep('preview');
      } catch (err) {
        console.error('Parse error:', err);
        alert('Failed to parse file. Please ensure it is a valid CSV or Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter(r => !r.error && r.matchedStaff);
    if (validRows.length === 0) return;

    setStep('importing');

    const records: Omit<Attendance, 'id'>[] = validRows.map(row => ({
      staffId: row.matchedStaff!.id,
      date: row.date,
      status: row.status,
      attendanceValue: row.status === 'Present' ? 1 : row.status === 'Half Day' ? 0.5 : 0,
      isSunday: isSunday(row.date),
      isPartTime: false,
      staffName: row.matchedStaff!.name,
      shift: row.shift,
      location: row.location || row.matchedStaff!.location,
    }));

    try {
      await onImport(records);
      setImportResult({ success: validRows.length, errors: parsedRows.length - validRows.length });
      setStep('done');
    } catch (err) {
      console.error('Import error:', err);
      alert('Failed to import attendance records. Please try again.');
      setStep('preview');
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const templateData = [
      ['Staff Name', 'Date', 'Status', 'Shift', 'Location'],
      ['John Doe', '2026-04-01', 'Present', 'Morning', 'Big Shop'],
      ['Jane Smith', '2026-04-01', 'Half Day', 'Evening', 'Small Shop'],
      ['Bob Wilson', '2026-04-01', 'Absent', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, 'attendance_template.xlsx');
  };

  const validCount = parsedRows.filter(r => !r.error).length;
  const errorCount = parsedRows.filter(r => r.error).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
            <Upload className="text-accent-info" size={18} />
            Bulk Attendance Upload
          </h3>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1"><X size={20} /></button>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div>
            <div
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-accent-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <FileSpreadsheet className="mx-auto mb-3 text-white/40" size={48} />
              <p className="text-sm font-medium mb-1">Drop your CSV or Excel file here</p>
              <p className="text-xs text-white/50">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>

            <div className="mt-4 p-3 rounded-lg glass-card-static">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-accent-info mt-0.5 flex-shrink-0" />
                <div className="text-xs text-white/60 space-y-1">
                  <p><strong>Required columns:</strong> Staff Name, Date, Status (P/A/H/Present/Absent/Half Day)</p>
                  <p><strong>Optional columns:</strong> Shift (Morning/Evening/Both), Location</p>
                  <p><strong>Date formats:</strong> YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 text-sm text-accent-info hover:text-accent-primary transition-colors"
              >
                <Download size={14} />
                Download Template
              </button>
              <button onClick={onClose} className="btn-ghost px-4 py-2">Cancel</button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-white/60">File: <strong className="text-white/80">{fileName}</strong></span>
              <span className="badge-premium badge-success text-xs">{validCount} valid</span>
              {errorCount > 0 && <span className="badge-premium badge-danger text-xs">{errorCount} errors</span>}
            </div>

            <div className="max-h-[350px] overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-white/5 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium text-white/60">#</th>
                    <th className="p-2 text-left font-medium text-white/60">Staff Name</th>
                    <th className="p-2 text-left font-medium text-white/60">Date</th>
                    <th className="p-2 text-left font-medium text-white/60">Status</th>
                    <th className="p-2 text-left font-medium text-white/60">Shift</th>
                    <th className="p-2 text-left font-medium text-white/60">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, i) => (
                    <tr key={i} className={`border-t border-white/5 ${row.error ? 'bg-red-500/10' : 'bg-green-500/5'}`}>
                      <td className="p-2 text-white/40">{row.rowNum}</td>
                      <td className="p-2">
                        <span className={row.matchedStaff ? '' : 'text-red-400'}>{row.staffName}</span>
                        {row.matchedStaff && row.matchedStaff.name !== row.staffName && (
                          <span className="text-white/40 ml-1">→ {row.matchedStaff.name}</span>
                        )}
                      </td>
                      <td className="p-2">{row.date || <span className="text-red-400">Invalid</span>}</td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          row.status === 'Present' ? 'bg-green-500/20 text-green-400' :
                          row.status === 'Half Day' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{row.status}</span>
                      </td>
                      <td className="p-2 text-white/60">{row.shift || '-'}</td>
                      <td className="p-2">
                        {row.error ? (
                          <span className="flex items-center gap-1 text-red-400"><AlertTriangle size={12} />{row.error}</span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-400"><Check size={12} />OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between items-center">
              <button onClick={() => { setStep('upload'); setParsedRows([]); }} className="btn-ghost px-4 py-2 text-sm">
                ← Back
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
                <button
                  onClick={handleImport}
                  disabled={validCount === 0}
                  className="btn-premium px-4 py-2 text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #38ef7d 0%, #11998e 100%)' }}
                >
                  Import {validCount} Records
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full border-2 border-accent-primary border-t-transparent animate-spin"></div>
            <p className="text-sm">Importing attendance records...</p>
            <p className="text-xs text-white/50 mt-1">Please wait</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center py-8">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-green-500/20 flex items-center justify-center">
              <Check className="text-green-400" size={28} />
            </div>
            <p className="text-sm font-medium mb-1">Import Complete</p>
            <p className="text-xs text-white/60">
              {importResult.success} records imported successfully
              {importResult.errors > 0 && `, ${importResult.errors} skipped due to errors`}
            </p>
            <button onClick={onClose} className="btn-premium px-6 py-2 text-sm mt-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkAttendanceUpload;
