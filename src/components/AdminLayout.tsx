import React, { useEffect, useState } from 'react';
import SiteFooter from './SiteFooter';
import { 
  LayoutDashboard, 
  CalendarPlus, 
  Activity, 
  FileText, 
  LogOut, 
  Heart, 
  ShieldAlert, 
  Stethoscope, 
  Menu,
  DoorOpen,
  ClipboardCheck,
} from 'lucide-react';

interface AdminLayoutProps {
  activeTab: 'queue' | 'addQueue' | 'addAppoint' | 'addDoctor' | 'addRoom' | 'progress' | 'records' | 'emergencyProcedures';
  setActiveTab: (tab: AdminLayoutProps['activeTab']) => void;
  adminName?: string;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AdminLayout({
  activeTab,
  setActiveTab,
  adminName = "Admin User",
  onLogout,
  children,
}: AdminLayoutProps) {
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
    { id: 'queue', label: 'Queue Dashboard', icon: LayoutDashboard },
    { id: 'addQueue', label: 'Add Queue / Emergency', icon: ShieldAlert },
    { id: 'addAppoint', label: 'Appointments', icon: CalendarPlus },
    { id: 'addDoctor', label: 'Add Doctor Account', icon: Stethoscope },
    { id: 'addRoom', label: 'Add Room Account', icon: DoorOpen },
    { id: 'emergencyProcedures', label: 'Emergency Procedures', icon: ClipboardCheck },
    { id: 'progress', label: 'Progress Updates', icon: Activity },
    { id: 'records', label: 'Patient Records', icon: FileText },
  ] as const;

  return (
    <div className="flex h-[100dvh] bg-[#e2e8e6] font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-slate-900/40 md:hidden"
        />
      )}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 transition-transform duration-300 md:static md:z-auto md:shrink-0 md:overflow-hidden md:transition-[width] md:transform-none ${
        isSidebarOpen ? 'translate-x-0 md:w-64' : '-translate-x-full md:w-0'
      }`}>
        <aside className="flex h-full w-64 flex-col justify-between border-r border-slate-200 bg-white shadow-sm">
        <div>
          {/* Header Brand Badge */}
          <div className="p-4 flex items-center space-x-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Heart className="w-5 h-5 fill-current" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Hospital Queue</p>
              <h2 className="text-xs font-bold text-slate-800">Admin Portal</h2>
            </div>
          </div>

          {/* Logged in Admin Profile Badge */}
          <div className="m-4 p-3 bg-slate-100 rounded-xl flex items-center space-x-3 border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold">
              AD
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">{adminName}</h4>
              <p className="text-[10px] text-emerald-600 font-mono">Verified Admin</p>
            </div>
          </div>

          {/* Sidebar Menu Items */}
          <nav className="space-y-1 px-3">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
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

        {/* Logout Control */}
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

      {/* Main Panel Content Body */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex items-center space-x-3 border-b border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <button
            type="button"
            onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
            aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-expanded={isSidebarOpen}
            className="rounded-md p-1 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1b7a57]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-slate-800 capitalize">Admin Dashboard</h1>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-20 sm:p-4 sm:pb-20 md:p-6 md:pb-6">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}