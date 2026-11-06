import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Activity, FileText, Calendar, LogOut, Stethoscope, Menu } from 'lucide-react';

interface DoctorLayoutProps {
  activeTab: 'queue' | 'progress' | 'records' | 'appointment';
  setActiveTab: (tab: any) => void;
  doctorName?: string;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function DoctorLayout({ activeTab, setActiveTab, doctorName = "Dr. Smith", onLogout, children }: DoctorLayoutProps) {
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
    { id: 'queue', label: 'Live Queue', icon: LayoutDashboard },
    { id: 'progress', label: 'Progress Updates', icon: Activity },
    { id: 'appointment', label: 'Appointment Calendar', icon: Calendar },
    { id: 'records', label: 'Patient Records', icon: FileText },
  ];

  return (
    <div className="flex h-[100dvh] bg-[#e2e8e6] font-sans overflow-hidden">
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
          <div className="p-4 flex items-center space-x-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Hospital Portal</p>
              <h2 className="text-xs font-bold text-slate-800">Doctor Dashboard</h2>
            </div>
          </div>

          <div className="m-4 p-3 bg-slate-100 rounded-xl flex items-center space-x-3 border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xs">
              DR
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">{doctorName}</h4>
              <p className="text-[10px] text-teal-600 font-mono">Specialist</p>
            </div>
          </div>

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
                    isActive ? 'bg-[#1b7a57] text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

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
          <h1 className="text-lg font-bold text-slate-800 capitalize">Doctor Workspace</h1>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}