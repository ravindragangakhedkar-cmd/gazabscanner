import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export type AppPage =
  | 'home'
  | 'scanner1'
  | 'scanner2'
  | 'scanner3'
  | 'scanner4'
  | 'scanner5'
  | 'scanner6'
  | 'broker'
  | 'pricing'
  | 'contact'
  | 'auth';

interface TopNavProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}

const NAV_ITEMS: Array<{ id: AppPage; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'scanner1', label: 'Scanner 1' },
  { id: 'scanner2', label: 'Scanner 2' },
  { id: 'scanner3', label: 'Scanner 3' },
  { id: 'scanner4', label: 'Super Pivots' },
  { id: 'scanner5', label: 'Option Calls' },
  { id: 'scanner6', label: 'Option Puts' },
  { id: 'broker', label: 'Broker Connect' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact Us' },
];

export function TopNav({ activePage, onNavigate }: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (page: AppPage) => {
    setMobileOpen(false);
    onNavigate(page);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Single-element wordmark */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
        >
          GazabPaisa
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden lg:flex items-center gap-3 xl:gap-4" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`relative py-2 text-xs xl:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded ${
                  isActive ? 'text-slate-950 font-semibold' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-emerald-600" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline-flex items-center px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 rounded-lg">Open Access</span>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="lg:hidden p-2 text-slate-700 hover:text-slate-950 rounded-lg border border-slate-200"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <div className="pt-2 border-t border-slate-100">
            <div className="px-3 py-2 text-xs font-semibold text-emerald-800">Open Access — no sign-in required</div>
          </div>
        </div>
      )}
    </header>
  );
}
