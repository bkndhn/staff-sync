import React, { useState, useEffect } from 'react';
import { NavigationTab, User } from '../types';
import {
  BarChart3, Users, Calendar, DollarSign, Clock, Archive, LogOut,
  AlertTriangle, Settings as SettingsIcon, FileText, ScanFace,
  ShieldAlert, Shield, TrendingUp, Coffee, Sun, Moon,
  PanelLeftClose, PanelLeftOpen, UserCircle, Key, RefreshCw, Zap
} from 'lucide-react';
import { SyncBadge } from './SyncBadge';
import { statutoryPortalService, StatutoryPortalConfig, DEFAULT_STATUTORY_CONFIG } from '../services/statutoryPortalService';
import { hardResetAppCache } from '../lib/cacheService';

interface NavigationProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  user: User;
  onLogout: () => void;
  isDarkTheme?: boolean;
  toggleTheme?: () => void;
  statutoryScope?: 'statutory' | 'all';
  onStatutoryScopeChange?: (scope: 'statutory' | 'all') => void;
}

const Navigation: React.FC<NavigationProps> = ({
  activeTab, setActiveTab, user, onLogout, isDarkTheme = true, toggleTheme,
  statutoryScope = 'statutory', onStatutoryScopeChange,
}) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1'; } catch { return false; }
  });
  const [portalCfg, setPortalCfg] = useState<StatutoryPortalConfig>(() =>
    user.role === 'statutory_admin' ? statutoryPortalService.loadCached() : DEFAULT_STATUTORY_CONFIG
  );

  useEffect(() => {
    if (user.role === 'statutory_admin') {
      statutoryPortalService.load().then(setPortalCfg).catch(() => {});
    }
  }, [user.role]);

  useEffect(() => {
    try { localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0'); } catch {}
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '68px' : '232px');
  }, [collapsed]);

  useEffect(() => {
    // Initialize CSS var on mount
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '68px' : '232px');
    return () => { document.documentElement.style.setProperty('--sidebar-w', '0px'); };
  }, []);

  const getAvailableTabs = () => {
    if (user.role === 'staff') {
      return [{ id: 'My Portal' as NavigationTab, label: 'My Portal', icon: Users }];
    }
    if (user.role === 'statutory_admin') {
      const map: Array<{ id: NavigationTab; label: string; icon: any; key: keyof StatutoryPortalConfig['visiblePages'] }> = [
        { id: 'Dashboard', label: 'Dashboard', icon: BarChart3, key: 'dashboard' },
        { id: 'Staff Management', label: 'Staff', icon: Users, key: 'staff' },
        { id: 'Attendance', label: 'Attendance', icon: Calendar, key: 'attendance' },
        { id: 'Salary Management', label: 'Salary', icon: DollarSign, key: 'salary' },
        { id: 'Leave Management', label: 'Leave', icon: FileText, key: 'leave' },
        { id: 'Action Center', label: 'Action Center', icon: AlertTriangle, key: 'action_center' },
        { id: 'Settings', label: 'Settings', icon: SettingsIcon, key: 'settings' },
        { id: 'Profile', label: 'Profile', icon: UserCircle, key: 'settings' },
      ];
      return map.filter(t => portalCfg.visiblePages[t.key]).map(({ id, label, icon }) => ({ id, label, icon }));
    }
    if (user.role === 'admin' || user.role === 'super_admin') {
      return [
        { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
        { id: 'Workforce Insights' as NavigationTab, label: 'Insights', icon: TrendingUp },
        { id: 'Staff Management' as NavigationTab, label: 'Staff', icon: Users },
        { id: 'Shift Roster' as NavigationTab, label: 'Roster', icon: Calendar },
        { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
        { id: 'Break Management' as NavigationTab, label: 'Breaks', icon: Coffee },
        { id: 'Salary Management' as NavigationTab, label: 'Salary', icon: DollarSign },
        { id: 'Part-Time Staff' as NavigationTab, label: 'Part-Time', icon: Clock },
        { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
        { id: 'Old Staff Records' as NavigationTab, label: 'Archive', icon: Archive },
        { id: 'Audit Log' as NavigationTab, label: 'Audit Log', icon: ShieldAlert },
        { id: 'Permissions Matrix' as NavigationTab, label: 'Permissions', icon: Key },
        { id: 'Settings' as NavigationTab, label: 'Settings', icon: SettingsIcon },
        { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
      ];
    }
    if (user.role === 'floor_supervisor') {
      // Floor supervisor: attendance-focused, own floor only.
      return [
        { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
        { id: 'Staff Management' as NavigationTab, label: 'Staff', icon: Users },
        { id: 'Shift Roster' as NavigationTab, label: 'Roster', icon: Calendar },
        { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
        { id: 'Break Management' as NavigationTab, label: 'Breaks', icon: Coffee },
        { id: 'Part-Time Staff' as NavigationTab, label: 'Part-Time', icon: Clock },
        { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
        { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
      ];
    }
    return [
      { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
      { id: 'Workforce Insights' as NavigationTab, label: 'Insights', icon: TrendingUp },
      { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
      { id: 'Break Management' as NavigationTab, label: 'Breaks', icon: Coffee },
      { id: 'Part-Time Staff' as NavigationTab, label: 'Part-Time', icon: Clock },
      { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
      { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
    ];
  };

  const tabs = getAvailableTabs();


  const themeBtn = toggleTheme && (
    <button
      onClick={toggleTheme}
      title={isDarkTheme ? 'Switch to light' : 'Switch to dark'}
      className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
    >
      {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );

  const logoutBtn = (
    <button
      onClick={() => setShowLogoutModal(true)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
      title="Logout"
    >
      <LogOut size={18} />
      <span className="text-sm hidden sm:inline">Logout</span>
    </button>
  );

  // Statutory scope toggle removed — app always shows statutory staff only.
  const canToggleScope = false;
  const scopePill = null;
  void statutoryScope; void onStatutoryScopeChange;



  return (
    <>
      {/* ── Desktop/Tablet Sidebar ─────────────────────────────────────── */}
      <aside
        className={`hidden md:flex fixed top-0 left-0 h-screen z-40 flex-col nav-premium border-r border-white/10 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-[232px]'}`}
      >
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 h-16 border-b border-white/10`}>
          {!collapsed && <span className="text-sm font-bold text-gradient truncate">Staff Mgmt</span>}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-500/20 text-blue-700 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {!collapsed && <span className="truncate">{tab.label}</span>}
              </button>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="p-3 border-t border-white/10 text-xs text-white/40 truncate">
            {user.role === 'admin' || user.role === 'statutory_admin' || user.role === 'super_admin' ? 'Administrator' : user.role === 'staff' ? (user.staffName || 'Staff') : `${user.location || ''} Manager`.trim()}
          </div>
        )}
      </aside>

      {/* ── Desktop/Tablet Top Bar (theme + logout, always visible) ────── */}
      <div
        className="hidden md:flex fixed top-0 right-0 h-16 z-30 items-center justify-end gap-2 px-4 nav-premium border-b border-white/10"
        style={{ left: 'var(--sidebar-w, 232px)' }}
      >
        <SyncBadge />
        {scopePill}
        <div className="text-right hidden lg:block mr-2">
          <div className="text-xs font-medium text-white/80 leading-tight">
            {user.role === 'admin' || user.role === 'statutory_admin' || user.role === 'super_admin' ? 'Administrator' : user.role === 'staff' ? (user.staffName || 'Staff') : `${user.location || ''} Manager`.trim()}
          </div>
          <div className="text-[10px] text-white/40">{user.role === 'staff' ? 'Staff Portal' : user.email}</div>
        </div>
        <button
          type="button"
          onClick={hardResetAppCache}
          className="p-2 rounded-lg text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 transition-all text-xs flex items-center gap-1 font-semibold"
          title="Hard Reset App & Purge All Local Cache"
        >
          <Zap size={15} />
          <span className="hidden xl:inline">Hard Reset</span>
        </button>
        {themeBtn}
        {logoutBtn}
      </div>

      {/* ── Mobile Top Bar ─────────────────────────────────────────────── */}
      <nav className="md:hidden sticky top-0 z-50 px-3 py-2.5 nav-premium border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-bold text-gradient truncate">Staff Mgmt</h1>
          <div className="flex items-center gap-1">
            <SyncBadge />
            <button
              type="button"
              onClick={hardResetAppCache}
              className="p-2 rounded-lg text-amber-300 bg-amber-500/15"
              title="Hard Reset App & Clear Cache"
            >
              <Zap size={15} />
            </button>
            {themeBtn}
            <button
              onClick={() => setShowLogoutModal(true)}
              className="p-2 text-white/60 hover:text-red-400 rounded-lg bg-red-500/10"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation ───────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 mobile-nav safe-area-padding overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`.mobile-nav::-webkit-scrollbar { display: none; }`}</style>
        <div className="flex items-end px-1 pt-1 pb-1 w-max min-w-full justify-around gap-1" style={{ minHeight: '54px' }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`mobile-nav-item flex-shrink-0 min-w-[52px] ${isActive ? 'mobile-nav-item-active' : ''}`}
              >
                <Icon size={18} className={`transition-all ${isActive ? 'text-white' : 'text-white/50'}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[9px] font-semibold mt-0.5 ${isActive ? 'text-white' : 'text-white/50'}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="text-red-400" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirm Logout</h3>
                <p className="text-white/50 text-sm">You'll need to sign in again</p>
              </div>
            </div>
            <p className="text-white/70 mb-6">Are you sure you want to logout?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutModal(false)} className="flex-1 btn-ghost">Cancel</button>
              <button onClick={() => { setShowLogoutModal(false); onLogout(); }} className="flex-1 btn-premium btn-premium-danger">Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(Navigation);
