import { useEffect, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, FileText, Heart, LogOut, Menu } from 'lucide-react';
import SiteFooter from './SiteFooter';

export type RoomTab = 'emergency' | 'progress' | 'records';

interface RoomLayoutProps {
  activeTab: RoomTab;
  setActiveTab: (tab: RoomTab) => void;
  roomName: string;
  showEmergencyQueue: boolean;
  showPatientRecords: boolean;
  onLogout: () => void;
  children: ReactNode;
}

export default function RoomLayout({
  activeTab,
  setActiveTab,
  roomName,
  showEmergencyQueue,
  showPatientRecords,
  onLogout,
  children,
}: RoomLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => setIsSidebarOpen(event.matches);
    desktopQuery.addEventListener('change', handleBreakpointChange);
    return () => desktopQuery.removeEventListener('change', handleBreakpointChange);
  }, []);

  const menuItems = [
    ...(showEmergencyQueue
      ? [{ id: 'emergency' as const, label: 'Emergency Queue', icon: AlertTriangle }]
      : []),
    { id: 'progress' as const, label: 'Progress Updates', icon: Activity },
    ...(showPatientRecords
      ? [{ id: 'records' as const, label: 'Patient Records', icon: FileText }]
      : []),
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#e2e8e6] font-sans">
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
            <div className="flex items-center space-x-3 border-b border-slate-100 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Heart className="h-5 w-5 fill-current" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-400">Hospital Portal</p>
                <h2 className="text-xs font-bold text-slate-800">Room Dashboard</h2>
              </div>
            </div>

            <div className="m-4 flex items-center space-x-3 rounded-xl border border-slate-200 bg-slate-100 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">RM</div>
              <div className="min-w-0">
                <h4 className="truncate text-xs font-bold text-slate-800">{roomName}</h4>
                <p className="font-mono text-[10px] text-emerald-700">Room Staff</p>
              </div>
            </div>

            <nav className="space-y-1 px-3">
              {menuItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(id);
                    if (window.matchMedia('(max-width: 767px)').matches) setIsSidebarOpen(false);
                  }}
                  className={`flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    activeTab === id ? 'bg-[#1b7a57] text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="border-t border-slate-100 p-4">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center space-x-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
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
          <h1 className="text-lg font-bold capitalize text-slate-800">Room Workspace</h1>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-20 sm:p-4 sm:pb-20 md:p-6 md:pb-6">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
