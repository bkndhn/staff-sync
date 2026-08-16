import React, { useState, useEffect } from 'react';
import { Sparkles, AlertTriangle, Info, AlertCircle, RefreshCw } from 'lucide-react';
import { dataApi } from '../lib/dataApi';
import { supabase } from '../lib/supabase';

interface AIInsight {
  id: string;
  type: string;
  insight_text: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
}

export const AIInsightsWidget: React.FC<{ tenantId?: string }> = ({ tenantId }) => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadInsights = async () => {
    setLoading(true);
    try {
      const json = await dataApi({
        table: 'ai_insights',
        op: 'select',
        columns: '*',
      });
      if (json && json.data) {
        setInsights((json.data as AIInsight[]).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to load insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, []);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setRefreshing(true);
    setError('');
    try {
      // 1. Get session token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || localStorage.getItem('app_session_token') || '';
      
      // 2. Call the edge function
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-session-token': token,
        },
        body: JSON.stringify({ tenantId })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate insights');
      }
      
      // 3. Reload insights
      await loadInsights();
    } catch (err: any) {
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setRefreshing(false);
    }
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle size={18} className="text-red-400" />;
      case 'warning': return <AlertTriangle size={18} className="text-amber-400" />;
      default: return <Info size={18} className="text-blue-400" />;
    }
  };

  const getBgClass = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 border-red-500/20';
      case 'warning': return 'bg-amber-500/10 border-amber-500/20';
      default: return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <div className="glass-card-static rounded-2xl border border-[var(--glass-border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles size={20} className="text-indigo-400" />
          Predictive Insights
        </h3>
        <button
          onClick={handleGenerate}
          disabled={refreshing || !tenantId}
          className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-4">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : insights.length === 0 ? (
        <div className="text-center p-6 text-white/50 text-sm">
          No insights generated yet. Click "Run Analysis" to analyze workforce data.
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {insights.map(insight => (
            <div key={insight.id} className={`p-3 rounded-xl border flex gap-3 ${getBgClass(insight.severity)}`}>
              <div className="mt-0.5">{getIcon(insight.severity)}</div>
              <div>
                <p className="text-sm text-white/90">{insight.insight_text}</p>
                <span className="text-[10px] text-white/40 block mt-1">
                  {new Date(insight.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
