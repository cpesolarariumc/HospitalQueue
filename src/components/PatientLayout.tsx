import React, { useEffect, useState } from 'react';
import logo from '../assets/logo.png';
import SiteFooter from './SiteFooter';
import { 
  Clock, 
  Calendar, 
  CircleDot, 
  FileText, 
  ClipboardList, 
  LogOut, 
  User, 
  Menu 
} from 'lucide-react';

interface PatientLayoutProps {
  activeTab: 'queue' | 'appointment' | 'progress' | 'records' | 'prescriptions';
  setActiveTab: (tab: any) => void;
  patientName?: string;
  accountNo?: string;
  profileOpen?: boolean;
  onLogout: () => void;
  onProfileClick?: () => void;
  children: React.ReactNode;
}

export default function PatientLayout({
  activeTab,
  setActiveTab,
  patientName = "Mr./Mrs. LastName",
  accountNo = "Account #",
  profileOpen = false,
  onLogout,
  onProfileClick,
  children,
}: PatientLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      setIsSidebarOpen(event.matches);
    };

    desktopQuery.addEventListener('change', handleBreakpointChange);
    return () => desktopQuery.removeEventListener('change', handleBreakpointChange);
  }, []);

  const menuItems = [
    { id: 'queue', label: 'Queue', icon: Clock },
    { id: 'appointment', label: 'Appointment', icon: Calendar },
    { id: 'progress', label: 'Progress', icon: CircleDot },
    { id: 'records', label: 'Records', icon: FileText },
    { id: 'prescriptions', label: 'Prescriptions', icon: ClipboardList },
  ];

  return (
    <div className="flex h-[100dvh] bg-[#e2e8e6] font-sans overflow-hidden">
      {/* Sidebar */}
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/40 md:hidden"
        />
      )}
      <div className={`fixed inset-y-0 left-0 z-[60] w-64 transition-transform duration-300 md:static md:z-auto md:shrink-0 md:overflow-hidden md:transition-[width] md:transform-none ${
        isSidebarOpen ? 'translate-x-0 md:w-64' : '-translate-x-full md:w-0'
      }`}>
        <aside className="w-64 h-full bg-white border-r border-slate-200 flex flex-col justify-between shadow-sm">
          <div>
            {/* Logo / Company Name */}
            <div className="p-4 flex items-center space-x-3 border-b border-slate-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100">
                <img
                  src={logo}
                  alt="OmniQueue Health logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-800">OmniQueue Health</h2>
              </div>
            </div>

            {/* User Profile Badge (Clicking triggers profile modal) */}
            <div
              onClick={() => {
                onProfileClick?.();
                if (window.matchMedia('(max-width: 767px)').matches) {
                  setIsSidebarOpen(false);
                }
              }}
              className="m-4 p-3 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center space-x-3 border border-slate-200 cursor-pointer transition"
            >
              <div className="w-10 h-10 rounded-full bg-slate-400 text-white flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">{patientName}</h4>
                <p className="text-[10px] text-slate-500 font-mono">{accountNo}</p>
              </div>
            </div>

            {/* Navigation Menu */}
            <nav className="space-y-1 px-3">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = !profileOpen && activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      if (window.matchMedia('(max-width: 767px)').matches) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                      isActive
                        ? 'bg-[#1b7a57] text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Logout Button */}
          <div className="p-4 border-t border-slate-100">
            <button
              onClick={onLogout}
              className="w-full flex items-center space-x-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl text-sm font-semibold transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Log out</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex items-center space-x-3 border-b border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <button
            type="button"
            onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
            aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-expanded={isSidebarOpen}
            className="p-1 rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1b7a57]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-full bg-pink-100 object-contain md:hidden" />
            <h1 className="truncate text-lg font-bold capitalize text-slate-800">
              {profileOpen ? 'Profile' : activeTab}
            </h1>
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-20 sm:p-4 sm:pb-20 md:p-6 md:pb-6">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}