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
} from 'lucide-react';

interface NavigationProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  user: User;
  onLogout: () => void;
}

// How many tabs to pin in the bottom bar (rest go in "More" drawer)
const PINNED_COUNT = 4;

const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, user, onLogout }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);

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
  // Keep the active tab always visible: if it's in overflow, swap it into pinned
  const pinnedTabs = (() => {
    const pinned = tabs.slice(0, PINNED_COUNT);
    const overflow = tabs.slice(PINNED_COUNT);
    const activeInOverflow = overflow.findIndex(t => t.id === activeTab);
    if (activeInOverflow !== -1) {
      // Swap last pinned with the active overflow tab
      const swapped = [...pinned];
      swapped[PINNED_COUNT - 1] = overflow[activeInOverflow];
      return swapped;
    }
    return pinned;
  })();

  const overflowTabs = tabs.filter(t => !pinnedTabs.some(p => p.id === t.id));
  const hasOverflow = overflowTabs.length > 0;

  const handleTabSelect = (tab: NavigationTab) => {
    setActiveTab(tab);
    setShowMoreDrawer(false);
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
            <div className="text-right">
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 mobile-nav safe-area-padding">
        <div className="flex justify-around items-end px-2 pt-2 pb-2" style={{ minHeight: '68px' }}>
          {pinnedTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
                className={`mobile-nav-item ${isActive ? 'mobile-nav-item-active' : ''}`}
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

          {/* More button — only shown when overflow tabs exist */}
          {hasOverflow && (
            <button
              onClick={() => setShowMoreDrawer(true)}
              className={`mobile-nav-item ${overflowTabs.some(t => t.id === activeTab) ? 'mobile-nav-item-active' : ''}`}
            >
              <MoreHorizontal
                size={22}
                className={`transition-all duration-300 ${overflowTabs.some(t => t.id === activeTab) ? 'text-white' : 'text-white/50'}`}
                strokeWidth={2}
              />
              <span className={`text-[10px] font-semibold mt-1 ${overflowTabs.some(t => t.id === activeTab) ? 'text-white' : 'text-white/50'}`}>
                More
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── "More" Slide-up Drawer ─────────────────────────────────────────── */}
      {showMoreDrawer && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMoreDrawer(false)}
          />
          {/* Drawer panel */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[70] rounded-t-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(15,15,30,0.98) 0%, rgba(25,25,50,0.98) 100%)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-bold text-white/80 uppercase tracking-widest">All Pages</span>
              <button
                onClick={() => setShowMoreDrawer(false)}
                className="p-2 rounded-xl bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-all active:scale-90"
              >
                <X size={18} />
              </button>
            </div>

            {/* Grid of ALL tabs so user can jump to any page */}
            <div className="grid grid-cols-3 gap-3 px-4 pb-6 pt-2"
              style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabSelect(tab.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 active:scale-95"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(99,102,241,0.4) 0%, rgba(139,92,246,0.4) 100%)'
                        : 'rgba(255,255,255,0.05)',
                      border: isActive ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center"
                      style={{
                        background: isActive
                          ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                          : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <Icon size={20} className={isActive ? 'text-white' : 'text-white/60'} strokeWidth={isActive ? 2.5 : 2} />
                    </div>
                    <span className={`text-[11px] font-semibold text-center leading-tight ${isActive ? 'text-white' : 'text-white/60'}`}>
                      {tab.label}
                    </span>
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    )}
                  </button>
                );
              })}

              {/* Logout tile inside drawer for quick access */}
              <button
                onClick={() => { setShowMoreDrawer(false); handleLogoutClick(); }}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 active:scale-95"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-red-500/20">
                  <LogOut size={20} className="text-red-400" strokeWidth={2} />
                </div>
                <span className="text-[11px] font-semibold text-red-400 text-center leading-tight">Logout</span>
              </button>
            </div>
          </div>
        </>
      )}

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