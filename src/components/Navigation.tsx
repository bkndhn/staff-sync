import React, { useState } from 'react';
import { NavigationTab, User } from '../types';
import {
  BarChart3,
  Users,
  Calendar,
  DollarSign,
  Clock,
  Archive,
  LogOut,
  AlertTriangle,
  Settings as SettingsIcon,
  FileText,
  ScanFace,
  MoreHorizontal,
  X,
  ShieldAlert,
} from 'lucide-react';
import { SyncBadge } from './SyncBadge';

interface NavigationProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  user: User;
  onLogout: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, user, onLogout }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogoutClick = () => setShowLogoutModal(true);
  const handleLogoutConfirm = () => { setShowLogoutModal(false); onLogout(); };
  const handleLogoutCancel = () => setShowLogoutModal(false);

  const getAvailableTabs = () => {
    if (user.role === 'staff') {
      return [
        { id: 'My Portal' as NavigationTab, label: 'My Portal', icon: Users },
      ];
    }
    if (user.role === 'admin') {
      return [
        { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
        { id: 'Staff Management' as NavigationTab, label: 'Staff', icon: Users },
        { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
        { id: 'Face Attendance' as NavigationTab, label: 'Face', icon: ScanFace },
        { id: 'Salary Management' as NavigationTab, label: 'Salary', icon: DollarSign },
        { id: 'Part-Time Staff' as NavigationTab, label: 'Part-Time', icon: Clock },
        { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
        { id: 'Old Staff Records' as NavigationTab, label: 'Archive', icon: Archive },
        { id: 'Audit Log' as NavigationTab, label: 'Audit Log', icon: ShieldAlert },
        { id: 'Settings' as NavigationTab, label: 'Settings', icon: SettingsIcon },
      ];
    }
    // Manager
    return [
      { id: 'Dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3 },
      { id: 'Attendance' as NavigationTab, label: 'Attendance', icon: Calendar },
      { id: 'Face Attendance' as NavigationTab, label: 'Face', icon: ScanFace },
      { id: 'Part-Time Staff' as NavigationTab, label: 'Part-Time', icon: Clock },
      { id: 'Leave Management' as NavigationTab, label: 'Leave', icon: FileText },
    ];
  };

  const tabs = getAvailableTabs();
  const handleTabSelect = (tab: NavigationTab) => {
    setActiveTab(tab);
  };

  return (
    <>
      {/* ── Desktop Navigation ─────────────────────────────────────────────── */}
      <div className="hidden md:block nav-premium px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-gradient">Staff Management</h1>
            <nav className="flex items-center gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <SyncBadge />
            <div className="text-right">
              <div className="text-sm font-medium text-white">
                {user.role === 'admin' ? 'Administrator' : user.role === 'staff' ? (user.staffName || 'Staff') : `${user.location} Manager`}
              </div>
              <div className="text-xs text-white/50">{user.role === 'staff' ? 'Staff Portal' : user.email}</div>
            </div>
            <button
              onClick={handleLogoutClick}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut size={18} />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Top Bar ─────────────────────────────────────────────────── */}
      <nav className="md:hidden sticky top-0 z-50 px-3 py-2.5 nav-premium">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-gradient truncate max-w-[140px]">Staff Management</h1>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <div className="text-right hidden sm:block">
              <div className="text-[10px] font-bold text-white/40 uppercase tracking-tight">
                {user.role === 'admin' ? 'Role' : user.role === 'staff' ? 'Staff' : 'Location'}
              </div>
              <div className="text-xs font-semibold text-white">
                {user.role === 'admin' ? 'Admin' : user.role === 'staff' ? (user.staffName || 'Staff') : user.location}
              </div>
            </div>
            <button
              onClick={handleLogoutClick}
              className="p-2 text-white/50 hover:text-red-400 rounded-lg transition-all duration-200 active:scale-90 bg-red-500/10"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation ───────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 mobile-nav safe-area-padding overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`.mobile-nav::-webkit-scrollbar { display: none; }`}</style>
        <div className="flex items-end px-2 pt-2 pb-2 w-max min-w-full justify-around gap-2" style={{ minHeight: '68px' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
                className={`mobile-nav-item flex-shrink-0 min-w-[60px] ${isActive ? 'mobile-nav-item-active' : ''}`}
              >
                <Icon
                  size={22}
                  className={`transition-all duration-300 ${isActive ? 'text-white' : 'text-white/50'}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className={`text-[10px] font-semibold mt-1 transition-all duration-300 ${isActive ? 'text-white' : 'text-white/50'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Logout Confirmation Modal ───────────────────────────────────────── */}
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
            <p className="text-white/70 mb-6">Are you sure you want to logout from the Staff Management System?</p>
            <div className="flex gap-3">
              <button onClick={handleLogoutCancel} className="flex-1 btn-ghost">Cancel</button>
              <button onClick={handleLogoutConfirm} className="flex-1 btn-premium btn-premium-danger">Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(Navigation);