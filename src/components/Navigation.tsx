import React, { useState, useEffect } from 'react';
import { NavigationTab, User } from '../types';
import {
  BarChart3, Users, Calendar, DollarSign, Clock, Archive, LogOut,
  AlertTriangle, Settings as SettingsIcon, FileText, ScanFace,
  ShieldAlert, Shield, TrendingUp, Coffee, Sun, Moon,
  PanelLeftClose, PanelLeftOpen, UserCircle, RefreshCw, Zap, IndianRupee, Megaphone, Receipt,
  LayoutGrid, X } from 'lucide-react';
import { SyncBadge } from './SyncBadge';
import { statutoryPortalService, StatutoryPortalConfig, DEFAULT_STATUTORY_CONFIG } from '../services/statutoryPortalService';
import { hardResetAppCache } from '../lib/cacheService';
import { useUserPreference } from '../hooks/useUserPreference';

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
  const [collapsed, setCollapsed, collapsedLoading] = useUserPreference<boolean>(
    'sidebarCollapsed',
    false
  );
  const [portalCfg, setPortalCfg] = useState<StatutoryPortalConfig>(DEFAULT_STATUTORY_CONFIG);

  useEffect(() => {
    if (user.role === 'statutory_admin') {
      statutoryPortalService.load().then(setPortalCfg).catch(() => {});
    }
  }, [user.role]);

  useEffect(() => {
    if (!collapsedLoading) {
      document.documentElement.style.setProperty('--sidebar-w', collapsed ? '68px' : '232px');
    }
  }, [collapsed, collapsedLoading]);

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
        { id: 'Payroll Management', label: 'Payroll', icon: DollarSign, key: 'salary' },
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
        
        { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
        { id: 'Break Management' as NavigationTab, label: 'Breaks', icon: Coffee },
        { id: 'Payroll Management' as NavigationTab, label: 'Payroll', icon: DollarSign },
        { id: 'Flex Staff' as NavigationTab, label: 'Flex', icon: Clock },
        { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
        { id: 'Loan Requests' as NavigationTab, label: 'Loans', icon: IndianRupee },
        { id: 'Expense Claims' as NavigationTab, label: 'Expenses', icon: Receipt },
        { id: 'Petty Cash' as NavigationTab, label: 'Petty Cash', icon: IndianRupee },
        { id: 'Face Attendance' as NavigationTab, label: 'Face Punch', icon: ScanFace },
        { id: 'Old Staff Records' as NavigationTab, label: 'Archive', icon: Archive },
        { id: 'Action Center' as NavigationTab, label: 'Action Center', icon: AlertTriangle },
        { id: 'Audit Log' as NavigationTab, label: 'Audit Log', icon: ShieldAlert },
        { id: 'Announcements' as NavigationTab, label: 'Announcements', icon: Megaphone },
        { id: 'Settings' as NavigationTab, label: 'Settings', icon: SettingsIcon },
        { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
      ];
    }
    if (user.role === 'floor_supervisor') {
      // Zone supervisor: own-floor attendance only — no staff management or roster.
      return [
        { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
        { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
        { id: 'Break Management' as NavigationTab, label: 'Breaks', icon: Coffee },
        { id: 'Flex Staff' as NavigationTab, label: 'Flex', icon: Clock },
        { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
        { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
      ];
    }
    if (user.role === 'supervisor') {
      return [
        { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
        { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
        { id: 'Break Management' as NavigationTab, label: 'Breaks', icon: Coffee },
        { id: 'Flex Staff' as NavigationTab, label: 'Flex', icon: Clock },
        { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
        { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
      ];
    }
    if (user.role === 'petty_cash_manager') {
      return [
        { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
        { id: 'Petty Cash' as NavigationTab, label: 'Petty Cash', icon: IndianRupee },
        { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
      ];
    }
    return [
      { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
      { id: 'Workforce Insights' as NavigationTab, label: 'Insights', icon: TrendingUp },
      { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
      { id: 'Break Management' as NavigationTab, label: 'Breaks', icon: Coffee },
      { id: 'Flex Staff' as NavigationTab, label: 'Flex', icon: Clock },
      { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
      { id: 'Loan Requests' as NavigationTab, label: 'Loans', icon: IndianRupee },
      { id: 'Petty Cash' as NavigationTab, label: 'Petty Cash', icon: IndianRupee },
      { id: 'Face Attendance' as NavigationTab, label: 'Face Punch', icon: ScanFace },
      { id: 'Announcements' as NavigationTab, label: 'Announcements', icon: Megaphone },
      { id: 'Profile' as NavigationTab, label: 'Profile', icon: UserCircle },
    ];
  };

  const tabs = getAvailableTabs();

  // Mobile Navigation: Split into 4 primary tabs + "More" bottom sheet
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  // Preferred order for top 4 primary tabs on mobile
  const PRIMARY_PRIORITY_ORDER: NavigationTab[] = [
    'Dashboard',
    'Attendance',
    'Staff Management',
    'Petty Cash',
    'Payroll Management',
    'Flex Staff',
    'Break Management',
    'Workforce Insights',
    'Leave Management',
  ];

  const { primaryTabs, secondaryTabs } = React.useMemo(() => {
    if (tabs.length <= 5) {
      return { primaryTabs: tabs, secondaryTabs: [] };
    }
    // Pick the top 4 available tabs according to priority order
    const prioritized: typeof tabs = [];
    for (const tabId of PRIMARY_PRIORITY_ORDER) {
      const found = tabs.find(t => t.id === tabId);
      if (found && !prioritized.some(p => p.id === found.id)) {
        prioritized.push(found);
        if (prioritized.length === 5) break;
      }
    }
    // Fill up to 4 if not reached
    for (const t of tabs) {
      if (prioritized.length >= 5) break;
      if (!prioritized.some(p => p.id === t.id)) {
        prioritized.push(t);
      }
    }
    // All other tabs go to secondary (More sheet)
    const secondary = tabs.filter(t => !prioritized.some(p => p.id === t.id));
    return { primaryTabs: prioritized, secondaryTabs: secondary };
  }, [tabs]);

  const isMoreActive = secondaryTabs.some(t => t.id === activeTab);


  const themeBtn = toggleTheme && (
    <button
      onClick={toggleTheme}
      title={isDarkTheme ? 'Switch to light' : 'Switch to dark'}
      className="p-2 rounded-lg text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all"
    >
      {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );

  const logoutBtn = (
    <button
      onClick={() => setShowLogoutModal(true)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 dark:text-white/70 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-all"
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
                <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
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
      <nav className="md:hidden sticky top-0 z-40 px-3 py-2.5 nav-premium border-b border-slate-200/80 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-bold text-gradient truncate">Staff Mgmt</h1>
          <div className="flex items-center gap-1">
            <SyncBadge />
            <button
              type="button"
              onClick={hardResetAppCache}
              className="p-2 rounded-lg text-amber-600 dark:text-amber-300 bg-amber-500/15"
              title="Hard Reset App & Clear Cache"
            >
              <Zap size={15} />
            </button>
            {themeBtn}
            <button
              onClick={() => setShowLogoutModal(true)}
              className="p-2 text-slate-600 dark:text-white/60 hover:text-red-500 dark:hover:text-red-400 rounded-lg bg-red-500/10"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation (docked grid, 4 primary tabs + More) ── */}
      {tabs.length > 1 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 mobile-nav safe-area-padding pb-[env(safe-area-inset-bottom,0.5rem)] border-t border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-lg">
          <div className="grid items-center px-0.5 pt-1 pb-0.5 w-full h-14" style={{ gridTemplateColumns: `repeat(${primaryTabs.length + (secondaryTabs.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}>
            {primaryTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setShowMoreSheet(false);
                    setActiveTab(tab.id);
                  }}
                  className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-blue-500/15 dark:bg-blue-500/25 scale-105' : ''}`}>
                    <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full font-medium">{tab.label}</span>
                </button>
              );
            })}

            {secondaryTabs.length > 0 && (
              <button
                onClick={() => setShowMoreSheet(prev => !prev)}
                className={`relative flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all ${
                  isMoreActive || showMoreSheet
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className={`p-1 rounded-xl transition-all ${isMoreActive || showMoreSheet ? 'bg-blue-500/15 dark:bg-blue-500/25 scale-105' : ''}`}>
                  <LayoutGrid size={20} strokeWidth={isMoreActive ? 2.5 : 2} />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full font-medium">More</span>
                {isMoreActive && (
                  <span className="absolute top-1 right-2.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile "More" Bottom Sheet Drawer ── */}
      {showMoreSheet && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowMoreSheet(false)}
          />

          {/* Drawer content */}
          <div className="relative z-10 w-full max-h-[82vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl p-4 pb-[calc(env(safe-area-inset-bottom,1rem)+1.5rem)] animate-in slide-in-from-bottom duration-200">
            {/* Drag handle */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <LayoutGrid size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">All Navigation</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {user.role === 'admin' || user.role === 'super_admin'
                      ? 'Administrator'
                      : user.role === 'petty_cash_manager'
                      ? `Petty Cash Handler (${user.location || ''})`
                      : user.role === 'staff'
                      ? (user.staffName || 'Staff Portal')
                      : `${user.location || ''} Manager`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMoreSheet(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Grid of Secondary Tabs */}
            <div className="py-3">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5 px-1">
                More Modules
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {secondaryTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setShowMoreSheet(false);
                      }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-2xl transition-all active:scale-95 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className={`p-2 rounded-xl mb-1.5 ${isActive ? 'bg-white/20 text-white' : 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'}`}>
                        <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                      </div>
                      <span className={`text-[11px] text-center font-medium leading-tight truncate w-full ${isActive ? 'text-white font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
                Quick Actions
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreSheet(false);
                    hardResetAppCache();
                  }}
                  className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-medium text-xs border border-amber-500/20 transition-all"
                >
                  <Zap size={16} />
                  <span>Hard Reset</span>
                </button>

                {toggleTheme && (
                  <button
                    type="button"
                    onClick={() => {
                      toggleTheme();
                    }}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium text-xs border border-slate-200 dark:border-slate-700 transition-all"
                  >
                    {isDarkTheme ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-400" />}
                    <span>{isDarkTheme ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMoreSheet(false);
                  setShowLogoutModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 font-medium text-xs border border-red-500/20 transition-all mt-1"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
