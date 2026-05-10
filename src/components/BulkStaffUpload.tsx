import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, AlertTriangle, Check, Download } from 'lucide-react';
import { Staff } from '../types';
import * as XLSX from 'xlsx';

interface BulkStaffUploadProps {
  existingStaff: Staff[];
  onImport: (records: Omit<Staff, 'id'>[]) => Promise<void>;
  onClose: () => void;
}

interface ParsedRow {
  rowNum: number;
  data: Omit<Staff, 'id'>;
  error?: string;
  duplicate?: boolean;
}

const BulkStaffUpload: React.FC<BulkStaffUploadProps> = ({ existingStaff, onImport, onClose }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importResult, setImportResult] = useState<{ success: number; errors: number }>({ success: 0, errors: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadSample = () => {
    const sample = [
      {
        Name: 'John Doe',
        Location: 'Big Shop',
        Floor: 'Ground',
        Designation: 'Salesman',
        Type: 'full-time',
        Experience: '2 years',
        BasicSalary: 15000,
        Incentive: 10000,
        HRA: 0,
        MealAllowance: 0,
        TotalSalary: 25000,
        JoinedDate: '2024-01-15',
        ContactNumber: '9876543210',
        Address: '123 Main St',
        BankAccountNumber: '',
        IFSCCode: '',
        BankName: '',
        PaymentMode: 'cash',
        StaffAccommodation: 'day_scholar',
        SundayPenalty: true,
        SalaryCalculationDays: 30,
      },
      {
        Name: 'Jane Smith (Part Time)',
        Location: 'Small Shop',
        Floor: '',
        Designation: 'Helper',
        Type: 'part-time',
        Experience: '1 year',
        BasicSalary: 0,
        Incentive: 0,
        HRA: 0,
        MealAllowance: 0,
        TotalSalary: 0,
        JoinedDate: '2024-06-01',
        ContactNumber: '9123456780',
        Address: '',
        BankAccountNumber: '',
        IFSCCode: '',
        BankName: '',
        PaymentMode: 'cash',
        StaffAccommodation: '',
        SundayPenalty: false,
        SalaryCalculationDays: 30,
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');

    // Add an instructions sheet
    const instructions = [
      { Field: 'Name', Required: 'Yes', Example: 'John Doe', Notes: 'Full name of staff' },
      { Field: 'Location', Required: 'Yes', Example: 'Big Shop', Notes: 'Must match existing location name' },
      { Field: 'Floor', Required: 'No', Example: 'Ground', Notes: 'Optional floor name' },
      { Field: 'Designation', Required: 'No', Example: 'Salesman', Notes: 'Optional job title' },
      { Field: 'Type', Required: 'Yes', Example: 'full-time', Notes: 'full-time or part-time' },
      { Field: 'Experience', Required: 'No', Example: '2 years', Notes: 'Free text' },
      { Field: 'BasicSalary', Required: 'Yes (full-time)', Example: '15000', Notes: 'Number, ₹' },
      { Field: 'Incentive', Required: 'No', Example: '10000', Notes: 'Number, ₹' },
      { Field: 'HRA', Required: 'No', Example: '0', Notes: 'Number, ₹' },
      { Field: 'MealAllowance', Required: 'No', Example: '0', Notes: 'Number, ₹' },
      { Field: 'TotalSalary', Required: 'Yes', Example: '25000', Notes: 'Auto = Basic + Incentive + HRA + Meal' },
      { Field: 'JoinedDate', Required: 'Yes', Example: '2024-01-15', Notes: 'YYYY-MM-DD or DD/MM/YYYY' },
      { Field: 'ContactNumber', Required: 'No', Example: '9876543210', Notes: '10 digits' },
      { Field: 'Address', Required: 'No', Example: '123 Main St', Notes: 'Free text' },
      { Field: 'PaymentMode', Required: 'No', Example: 'cash', Notes: 'cash or bank' },
      { Field: 'StaffAccommodation', Required: 'No', Example: 'day_scholar', Notes: 'day_scholar | accommodation | (blank)' },
      { Field: 'SundayPenalty', Required: 'No', Example: 'true', Notes: 'true / false' },
      { Field: 'SalaryCalculationDays', Required: 'No', Example: '30', Notes: 'Default 30' },
    ];
    const wsI = XLSX.utils.json_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
    XLSX.writeFile(wb, 'staff-bulk-upload-template.xlsx');
  };

  const parseDate = (raw: any): string | null => {
    if (!raw) return null;
    if (typeof raw === 'number') {
      const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
      return d.toISOString().split('T')[0];
    }
    const str = raw.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    return null;
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const existingNames = new Set(existingStaff.map(s => s.name.trim().toLowerCase()));
    const parsed: ParsedRow[] = rows.map((r, idx) => {
      const name = String(r.Name || r.name || '').trim();
      if (!name) return { rowNum: idx + 2, data: {} as any, error: 'Missing Name' };

      const joinedDate = parseDate(r.JoinedDate || r.joinedDate || r.JoinDate);
      if (!joinedDate) return { rowNum: idx + 2, data: {} as any, error: 'Invalid JoinedDate' };

      const type = String(r.Type || r.type || 'full-time').toLowerCase().includes('part') ? 'part-time' : 'full-time';
      const basicSalary = Number(r.BasicSalary || r.basicSalary || 0);
      const incentive = Number(r.Incentive || r.incentive || 0);
      const hra = Number(r.HRA || r.hra || 0);
      const mealAllowance = Number(r.MealAllowance || r.mealAllowance || 0);
      const totalSalary = Number(r.TotalSalary || r.totalSalary || (basicSalary + incentive + hra + mealAllowance));

      const acc = String(r.StaffAccommodation || '').toLowerCase();
      const staffAccommodation = (acc === 'accommodation' ? 'accommodation' : acc === 'day_scholar' ? 'day_scholar' : '') as 'day_scholar' | 'accommodation' | '';

      const data: Omit<Staff, 'id'> = {
        name,
        location: String(r.Location || r.location || '').trim(),
        floor: String(r.Floor || r.floor || '').trim() || undefined,
        designation: String(r.Designation || r.designation || '').trim() || undefined,
        type: type as 'full-time' | 'part-time',
        experience: String(r.Experience || r.experience || '').trim(),
        basicSalary,
        incentive,
        hra,
        totalSalary,
        mealAllowance,
        joinedDate,
        isActive: true,
        sundayPenalty: String(r.SundayPenalty ?? 'true').toLowerCase() !== 'false',
        salaryCalculationDays: Number(r.SalaryCalculationDays || 30),
        staffAccommodation,
        contactNumber: String(r.ContactNumber || '').trim() || undefined,
        address: String(r.Address || '').trim() || undefined,
        bankAccountNumber: String(r.BankAccountNumber || '').trim() || undefined,
        ifscCode: String(r.IFSCCode || '').trim() || undefined,
        bankName: String(r.BankName || '').trim() || undefined,
        paymentMode: String(r.PaymentMode || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash',
      };

      const duplicate = existingNames.has(name.toLowerCase());
      let error: string | undefined;
      if (!data.location) error = 'Missing Location';
      else if (type === 'full-time' && totalSalary <= 0) error = 'Total salary required for full-time';

      return { rowNum: idx + 2, data, error, duplicate };
    });

    setParsedRows(parsed);
    setStep('preview');
  };

  const handleImport = async () => {
    setStep('importing');
    const valid = parsedRows.filter(r => !r.error && !r.duplicate);
    let success = 0, errors = 0;
    try {
      await onImport(valid.map(r => r.data));
      success = valid.length;
    } catch (e) {
      console.error(e);
      errors = valid.length;
    }
    setImportResult({ success, errors });
    setStep('done');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="text-emerald-500" size={22} /> Bulk Import Staff
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-5 flex-1">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">📋 Steps:</p>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>Download the sample template below</li>
                  <li>Fill in your staff details (do not change column headers)</li>
                  <li>Upload the file and verify the preview</li>
                  <li>Click "Import" to add all valid rows</li>
                </ol>
              </div>

              <button onClick={downloadSample} className="w-full py-3 rounded-xl bg-emerald-100 text-emerald-700 font-semibold flex items-center justify-center gap-2 hover:bg-emerald-200 transition-colors">
                <Download size={18} /> Download Sample Excel Template
              </button>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <Upload className="mx-auto text-gray-400 mb-3" size={36} />
                <p className="text-sm text-gray-600 mb-3">Excel (.xlsx, .xls) or CSV file</p>
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
                  Choose File
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">File: <span className="font-semibold">{fileName}</span></span>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-600 font-bold">✓ {parsedRows.filter(r => !r.error && !r.duplicate).length} valid</span>
                  <span className="text-amber-600 font-bold">⚠ {parsedRows.filter(r => r.duplicate).length} duplicate</span>
                  <span className="text-red-600 font-bold">✗ {parsedRows.filter(r => r.error).length} errors</span>
                </div>
              </div>
              <div className="overflow-auto max-h-[50vh] border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">Row</th>
                      <th className="px-2 py-2 text-left">Status</th>
                      <th className="px-2 py-2 text-left">Name</th>
                      <th className="px-2 py-2 text-left">Location</th>
                      <th className="px-2 py-2 text-left">Type</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-left">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${r.error ? 'bg-red-50' : r.duplicate ? 'bg-amber-50' : ''}`}>
                        <td className="px-2 py-1.5">{r.rowNum}</td>
                        <td className="px-2 py-1.5">
                          {r.error ? <span className="text-red-600" title={r.error}>✗ {r.error}</span>
                            : r.duplicate ? <span className="text-amber-600">⚠ duplicate</span>
                            : <span className="text-emerald-600">✓ ok</span>}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{r.data.name}</td>
                        <td className="px-2 py-1.5">{r.data.location}</td>
                        <td className="px-2 py-1.5">{r.data.type}</td>
                        <td className="px-2 py-1.5 text-right">₹{r.data.totalSalary?.toLocaleString('en-IN')}</td>
                        <td className="px-2 py-1.5">{r.data.joinedDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
              <p className="text-gray-600">Importing staff records...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <Check className="mx-auto text-emerald-500 mb-3" size={48} />
              <p className="text-lg font-bold text-gray-800 mb-1">Import Complete</p>
              <p className="text-sm text-gray-600">
                {importResult.success} staff added successfully
                {importResult.errors > 0 && <span className="text-red-600">, {importResult.errors} failed</span>}
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50">Back</button>
              <button onClick={handleImport}
                disabled={parsedRows.filter(r => !r.error && !r.duplicate).length === 0}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                Import {parsedRows.filter(r => !r.error && !r.duplicate).length} Staff
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">Close</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkStaffUpload;
