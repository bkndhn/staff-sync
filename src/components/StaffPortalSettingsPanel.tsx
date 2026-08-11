import React, { useState, useEffect } from 'react';
import { Settings, Save, AlertCircle, Check, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { userPreferencesService } from '../services/userPreferencesService';

interface StaffPortalSettingsPanelProps {
  tenantId?: string;
}

export const StaffPortalSettingsPanel: React.FC<StaffPortalSettingsPanelProps> = ({ tenantId }) => {
  const [slug, setSlug] = useState('');
  const [originalSlug, setOriginalSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Availability check states
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  
  // Super admin / Client admin toggle states
  const [staffLoginEnabled, setStaffLoginEnabled] = useState(true);
  const [portalAllowedBySuperAdmin, setPortalAllowedBySuperAdmin] = useState(true);

  useEffect(() => {
    loadTenantSettings();
  }, [tenantId]);

  const loadTenantSettings = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Load slug and super admin permission from the tenants table
      const { data, error } = await supabase
        .from('tenants')
        .select('slug, staff_portal_enabled')
        .eq('id', tenantId)
        .single();
        
      if (error) throw error;
      
      setSlug(data.slug || '');
      setOriginalSlug(data.slug || '');
      setPortalAllowedBySuperAdmin(data.staff_portal_enabled !== false);
      
      // Load client admin's preference for this specific setting
      const isEnabled = await userPreferencesService.getPreference<boolean>('staffLoginEnabled', true);
      setStaffLoginEnabled(isEnabled);
    } catch (err: any) {
      console.error('Error loading tenant settings:', err);
      setError('Failed to load portal settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!slug || slug === originalSlug || !tenantId) {
      setAvailability('idle');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      setAvailability('idle');
      return;
    }

    setAvailability('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('get_tenant_by_slug', { p_slug: slug.trim() });
        if (data && data.id !== tenantId) {
          setAvailability('taken');
        } else {
          setAvailability('available');
        }
      } catch (err) {
        setAvailability('idle');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slug, originalSlug, tenantId]);

  const handleSaveSlug = async () => {
    if (!slug.trim()) {
      setError('Slug cannot be empty');
      return;
    }
    
    // Slug basic validation
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError('Slug can only contain lowercase letters, numbers, and hyphens');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Call the RPC to safely update slug and enforce uniqueness
      const { data, error } = await supabase.rpc('update_tenant_slug', {
        p_tenant_id: tenantId,
        p_new_slug: slug.trim()
      });

      if (error) {
        if (error.message.includes('Slug already in use') || error.code === '23505') {
           setError('This slug is already taken. Please choose another one.');
        } else {
           throw error;
        }
      } else {
        setSuccess('Staff Portal URL updated successfully!');
        setOriginalSlug(slug.trim());
      }
    } catch (err: any) {
      console.error('Error saving slug:', err);
      setError(err?.message || 'Failed to update URL');
    } finally {
      setSaving(false);
    }
  };
  
  const handleToggleStaffLogin = async (newValue: boolean) => {
     setStaffLoginEnabled(newValue);
     await userPreferencesService.setPreference('staffLoginEnabled', newValue);
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm animate-pulse">Loading portal settings...</div>;
  }

  if (!tenantId) {
    return <div className="text-[var(--text-muted)] text-sm">Please select a tenant to configure Staff Portal.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Staff Self-Service Toggle */}
      <div className={`glass-card-static p-4 rounded-xl flex items-center justify-between gap-4 border border-gray-100 dark:border-white/10 shadow-sm transition-all ${!portalAllowedBySuperAdmin ? 'opacity-60 grayscale' : 'hover:shadow'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${staffLoginEnabled && portalAllowedBySuperAdmin ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 text-gray-400 dark:bg-white/5'}`}>
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[var(--text-primary)] text-sm">Staff Self-Service Login</h3>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${staffLoginEnabled && portalAllowedBySuperAdmin ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'}`}>
                {staffLoginEnabled && portalAllowedBySuperAdmin ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {portalAllowedBySuperAdmin 
                ? 'Allow staff members to log in to the portal to view their own salary, attendance, and hikes' 
                : 'Super Admin has disabled Staff Portal access for your organisation.'}
            </p>
          </div>
        </div>
        
        <button
          type="button"
          role="switch"
          aria-checked={staffLoginEnabled && portalAllowedBySuperAdmin}
          disabled={!portalAllowedBySuperAdmin}
          onClick={() => handleToggleStaffLogin(!staffLoginEnabled)}
          style={{
            position: 'relative',
            width: '50px',
            height: '26px',
            minWidth: '50px',
            maxWidth: '50px',
            minHeight: '26px',
            maxHeight: '26px',
            borderRadius: '13px',
            padding: '2px',
            backgroundColor: staffLoginEnabled && portalAllowedBySuperAdmin ? '#10b981' : '#cbd5e1',
            border: 'none',
            cursor: portalAllowedBySuperAdmin ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s ease',
            display: 'inline-flex',
            alignItems: 'center',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        >
          <span
            style={{
              display: 'block',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
              transform: staffLoginEnabled && portalAllowedBySuperAdmin ? 'translateX(24px)' : 'translateX(0px)',
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
      </div>

      {/* Staff Portal Link Configuration */}
      <div className={`glass-card-static p-4 rounded-xl border border-gray-100 dark:border-white/10 ${!portalAllowedBySuperAdmin ? 'opacity-60 pointer-events-none' : ''}`}>
        <h3 className="font-semibold text-[var(--text-primary)] text-sm mb-1">Staff Portal Web Link</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">Customize the unique URL slug where your staff will log in.</p>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex flex-col gap-1">
             <div className="flex items-center gap-1 w-full bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-lg overflow-hidden px-3 py-2">
               <span className="text-sm text-[var(--text-muted)] font-mono whitespace-nowrap">
                 {window.location.origin}/
               </span>
               <input
                 type="text"
                 value={slug}
                 onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                 className="bg-transparent border-none outline-none text-sm text-[var(--text-primary)] font-mono w-full min-w-0 p-0 m-0 focus:ring-0"
                 placeholder="your-company-name"
               />
               
               {/* Availability Indicator */}
               {availability === 'checking' && <div className="w-4 h-4 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin shrink-0" />}
               {availability === 'available' && <Check size={16} className="text-emerald-500 shrink-0" title="URL is available" />}
               {availability === 'taken' && <AlertCircle size={16} className="text-red-500 shrink-0" title="URL is already taken" />}
             </div>
             
             {availability === 'taken' && (
               <p className="text-[10px] text-red-500 mt-1 font-medium px-1">This URL is already taken.</p>
             )}
             {availability === 'available' && (
               <p className="text-[10px] text-emerald-500 mt-1 font-medium px-1">This URL is available!</p>
             )}
          </div>
          
          <button
            onClick={handleSaveSlug}
            disabled={saving || slug === originalSlug || !slug.trim() || availability === 'taken' || availability === 'checking'}
            className="btn-premium flex items-center justify-center gap-2 px-4 py-2 sm:py-0 whitespace-nowrap disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save URL'}
          </button>
        </div>
        
        <div className="mt-2 text-xs text-[var(--text-muted)]">
           Current link: <a href={`${window.location.origin}/${originalSlug}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{window.location.origin}/{originalSlug}</a>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
        </div>
      )}
      
      {success && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <Check className="text-emerald-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-emerald-600 dark:text-emerald-400 text-sm">{success}</span>
        </div>
      )}
    </div>
  );
};

export default StaffPortalSettingsPanel;
