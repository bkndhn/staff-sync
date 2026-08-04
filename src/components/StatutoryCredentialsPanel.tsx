import React, { useState, useEffect } from 'react';
import { Save, ExternalLink, Lock } from 'lucide-react';
import { dataApi } from '../lib/dataApi';

interface StatutoryCredentials {
  url: string;
  username: string;
  password: string;
  notes: string;
}

export default function StatutoryCredentialsPanel() {
  const [credentials, setCredentials] = useState<StatutoryCredentials>({
    url: '',
    username: '',
    password: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await dataApi.from('app_settings').select('statutory_login_details').maybeSingle();
        if (data && data.statutory_login_details) {
          setCredentials(data.statutory_login_details as StatutoryCredentials);
        }
      } catch (err) {
        console.error('Error loading statutory credentials', err);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      // Upsert into app_settings - data-api logic will handle tenant isolation
      const { error } = await dataApi.from('app_settings').upsert({
        statutory_login_details: credentials
      });
      if (error) throw error;
      setMessage('Credentials saved securely');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message || 'Failed to save'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card-static p-5 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Lock size={20} className="text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">External Statutory Portal Credentials</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Securely store credentials for external portals (EPF, ESIC, etc.).
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Portal URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={credentials.url}
              onChange={(e) => setCredentials({ ...credentials, url: e.target.value })}
              className="input-premium flex-1"
              placeholder="https://unifiedportal-mem.epfindia.gov.in"
            />
            {credentials.url && (
              <a href={credentials.url} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 flex items-center justify-center" title="Open Link">
                <ExternalLink size={16} />
              </a>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Username / ID</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              className="input-premium"
              placeholder="Portal Username"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Password</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              className="input-premium"
              placeholder="Portal Password"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Notes</label>
          <textarea
            value={credentials.notes}
            onChange={(e) => setCredentials({ ...credentials, notes: e.target.value })}
            className="input-premium min-h-[80px]"
            placeholder="Any extra instructions, security Q&A, or contact details"
          />
        </div>
        
        <div className="flex items-center justify-between pt-2">
          <span className={`text-sm ${message.includes('Error') ? 'text-red-500' : 'text-emerald-500'}`}>
            {message}
          </span>
          <button
            type="submit"
            disabled={saving}
            className="btn-premium py-2 px-6"
          >
            <Save size={16} className="mr-2" />
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
        </div>
      </form>
    </div>
  );
}
