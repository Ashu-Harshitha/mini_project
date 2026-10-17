import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { useAppStore } from '@/store/useAppStore';

export const Layout: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full flex-shrink-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] h-full bg-white dark:bg-slate-900 shadow-2xl z-10 flex flex-col">
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => setMobileDrawerOpen(false)}
              className="h-full border-r-0"
            />
          </div>
        </div>
      )}

      {/* Right Main Column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TopBar onMobileMenuToggle={() => setMobileDrawerOpen(true)} />

        {/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-6 px-4 sm:px-6 lg:px-8 py-5">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>

        {/* Bottom Nav for screens < 768px */}
        <BottomNav />
      </div>
    </div>
  );
};
