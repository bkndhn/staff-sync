import React, { useMemo, useState } from 'react';
import { Sparkles, RefreshCw, Send, Bot } from 'lucide-react';
import { Staff, Attendance } from '../types';

interface AIInsightsProps {
  staff: Staff[];
  attendance: Attendance[];
}

const SUPABASE_URL = 'https://nsmppwnpdxomjmgrtqka.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbXBwd25wZHhvbWptZ3J0cWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NDM3NjksImV4cCI6MjA2NzExOTc2OX0.gVzJ4uPAmFT5yngvdcFsHXHH1cUL-nIq0e71Gx8ALOk';

function getSessionToken(): string | null {
  try {
    const raw = localStorage.getItem('staffManagementLogin');
    if (!raw) return null;
    return JSON.parse(raw)?.sessionToken || null;
  } catch { return null; }
}

const AIInsights: React.FC<AIInsightsProps> = ({ staff, attendance }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string>('');
  const [question, setQuestion] = useState('');

  const snapshot = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);
    const activeStaff = staff.filter(s => s.isActive !== false);
    const monthAttendance = attendance.filter(a => a.date?.startsWith(monthPrefix));
    const present = monthAttendance.filter(a => a.status === 'Present').length;
    const absent = monthAttendance.filter(a => a.status === 'Absent').length;
    const halfDay = monthAttendance.filter(a => a.status === 'Half Day').length;
    const byLocation: Record<string, number> = {};
    activeStaff.forEach(s => { byLocation[s.location || 'Unknown'] = (byLocation[s.location || 'Unknown'] || 0) + 1; });
    const totalSalary = activeStaff.reduce((sum, s) => sum + (Number(s.salary) || 0), 0);
    return {
      generatedAt: today,
      totalActiveStaff: activeStaff.length,
      byLocation,
      currentMonth: monthPrefix,
      attendance: { present, absent, halfDay, total: monthAttendance.length },
      totalMonthlySalary: totalSalary,
      avgSalary: activeStaff.length ? Math.round(totalSalary / activeStaff.length) : 0,
    };
  }, [staff, attendance]);

  const ask = async (q?: string) => {
    setLoading(true); setError(null); setAnswer('');
    try {
      const token = getSessionToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'x-session-token': token || '',
        },
        body: JSON.stringify({ snapshot, question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'AI request failed');
      setAnswer(data.insights || '(no response)');
    } catch (e: any) {
      setError(e.message || 'Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-blue-500" size={22} />
        <h1 className="text-xl md:text-2xl font-bold">AI Insights</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Gemini</span>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-blue-100 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
          <Stat label="Active Staff" value={snapshot.totalActiveStaff} />
          <Stat label="Present (mo)" value={snapshot.attendance.present} />
          <Stat label="Absent (mo)" value={snapshot.attendance.absent} />
          <Stat label="Monthly Salary" value={`₹${snapshot.totalMonthlySalary.toLocaleString('en-IN')}`} />
        </div>

        <button
          onClick={() => ask()}
          disabled={loading}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60"
        >
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <Bot size={16} />}
          {loading ? 'Analyzing…' : 'Generate insights'}
        </button>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-blue-100 p-4">
        <label className="text-sm font-medium text-gray-700">Ask a question</label>
        <div className="flex gap-2 mt-2">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && question.trim()) ask(question.trim()); }}
            placeholder="e.g. Which location has the worst attendance?"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
          />
          <button
            onClick={() => question.trim() && ask(question.trim())}
            disabled={loading || !question.trim()}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{error}</div>
      )}

      {answer && (
        <div className="rounded-2xl bg-white shadow-sm border border-blue-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot size={16} className="text-blue-500" />
            <span className="text-sm font-medium text-gray-700">Insights</span>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">{answer}</pre>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-3">
    <div className="text-xs text-gray-600">{label}</div>
    <div className="text-lg font-bold text-blue-700">{value}</div>
  </div>
);

export default AIInsights;
