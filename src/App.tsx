/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { TopNav, type AppPage } from './components/TopNav';
import { MarketTicker } from './components/MarketTicker';
import { HomePage } from './pages/HomePage';
import { Scanner1Page } from './pages/Scanner1Page';
import { Scanner2Page } from './pages/Scanner2Page';
import { Scanner3Page } from './pages/Scanner3Page';
import { Scanner4Page } from './pages/Scanner4Page';
import { Scanner5Page } from './pages/Scanner5Page';
import { Scanner6Page } from './pages/Scanner6Page';
import { BrokerConnectPage } from './pages/BrokerConnectPage';
import { PricingPage } from './pages/PricingPage';
import { ContactPage } from './pages/ContactPage';
import { OFFICIAL_MERCHANT_EMAIL } from '../shared/types';

function AppShell() {
  const [activePage, setActivePage] = useState<AppPage>('home');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopNav activePage={activePage} onNavigate={setActivePage} />
      <MarketTicker />

      <main className="flex-1">
        {activePage === 'home' && <HomePage onNavigate={setActivePage} />}
        {activePage === 'scanner1' && <Scanner1Page onNavigate={setActivePage} />}
        {activePage === 'scanner2' && <Scanner2Page onNavigate={setActivePage} />}
        {activePage === 'scanner3' && <Scanner3Page onNavigate={setActivePage} />}
        {activePage === 'scanner4' && <Scanner4Page onNavigate={setActivePage} />}
        {activePage === 'scanner5' && <Scanner5Page onNavigate={setActivePage} />}
        {activePage === 'scanner6' && <Scanner6Page onNavigate={setActivePage} />}
        {activePage === 'broker' && <BrokerConnectPage onNavigate={setActivePage} />}
        {activePage === 'pricing' && <PricingPage onNavigate={setActivePage} />}
        {activePage === 'contact' && <ContactPage />}
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 mt-auto">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span className="font-display font-bold text-slate-900">
              GazabPaisa Awesome Scanner
            </span>{' '}
            · India · Proprietor: GazabPaisa Support (+91 -
            XXXXXXXXXX) · Email:{' '}
            <a
              href={`mailto:${OFFICIAL_MERCHANT_EMAIL}`}
              className="font-semibold text-emerald-700 hover:underline"
            >
              {OFFICIAL_MERCHANT_EMAIL}
            </a>
          </div>
          <div>
            Disclaimer: No guarantee — technical analysis only to facilitate trading decisions.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
