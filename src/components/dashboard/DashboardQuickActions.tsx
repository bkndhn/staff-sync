import React from 'react';
import { Share2, Download, SlidersHorizontal, UserPlus, FileText, Send } from 'lucide-react';

interface DashboardQuickActionsProps {
  onShareWhatsApp: () => void;
  onExportPDF: () => void;
  onOpenReportConfig: () => void;
  onOpenWidgetConfig: () => void;
}

export const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  onShareWhatsApp,
  onExportPDF,
  onOpenReportConfig,
  onOpenWidgetConfig,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onShareWhatsApp}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xs font-semibold shadow-md transition-all active:scale-95"
        title="Broadcast daily report via WhatsApp"
      >
        <Send size={14} />
        <span>WhatsApp Report</span>
      </button>

      <button
        onClick={onExportPDF}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[var(--text-primary)] text-xs font-semibold border border-[var(--glass-border)] transition-colors active:scale-95"
        title="Download PDF Report"
      >
        <Download size={14} />
        <span>PDF</span>
      </button>

      <button
        onClick={onOpenReportConfig}
        className="p-1.5 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[var(--text-primary)] text-xs font-semibold border border-[var(--glass-border)] transition-colors active:scale-95 flex items-center gap-1"
        title="Configure Report Columns"
      >
        <FileText size={14} />
        <span className="hidden sm:inline">Report Columns</span>
      </button>

      <button
        onClick={onOpenWidgetConfig}
        className="p-1.5 px-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 text-xs font-semibold transition-colors active:scale-95 flex items-center gap-1"
        title="Customize Dashboard Layout & Widgets"
      >
        <SlidersHorizontal size={14} />
        <span>Customize View</span>
      </button>
    </div>
  );
};

export default DashboardQuickActions;
