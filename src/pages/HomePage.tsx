import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, CheckCircle2, Layers, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import type { AnalyzedStock } from '../../shared/types';
import type { AppPage } from '../components/TopNav';
import { StockTechnicalChart } from '../components/StockChartModal';
import { useAuth } from '../context/AuthContext';

export function HomePage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const { brokerSession, brokerToken } = useAuth();
  const [featuredStock, setFeaturedStock] = useState<AnalyzedStock | null>(null);
  const [heroImgError, setHeroImgError] = useState(false);

  useEffect(() => {
    if (!brokerSession?.connected || !brokerToken) {
      setFeaturedStock(null);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/market/scan?skipIntraday=1&_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'x-broker-session': brokerToken },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stocks?: AnalyzedStock[] } | null) => {
        if (!data?.stocks?.length) return;
        const pick =
          data.stocks.find(
            (s) => s.marketBiasSetup !== 'Neutral' && s.twinRangeSignal !== 'HOLD',
          ) ?? data.stocks[0];
        setFeaturedStock(pick);
      })
      .catch(() => {
        // Ignore aborted / offline requests
      });
    return () => {
      controller.abort();
    };
  }, [brokerSession?.connected, brokerToken]);

  return (
    <div className="bg-slate-50">
      {/* Hero Section */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14 lg:pt-14 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-semibold text-emerald-700">
              GazabPaisa Awesome Scanner · NSE Nifty 500 &amp; F&amp;O Analytics
            </p>
            <h1 className="mt-3 font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-950 leading-[1.12] text-balance">
              Precision entry and exit scanning built for disciplined traders.
            </h1>
            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
              GazabPaisa Awesome Scanner scans the entire Nifty 500 and F&amp;O universe on the
              daily timeframe—combining Market Bias support/resistance zones, Twin Range Filter
              signals, BBWP volatility compression, and Price Volume Oscillator momentum to help you
              select high-probability entry points, targets, and stop-loss levels.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('scanner1')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
              >
                Open Scanner 1
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scanner2')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Open Scanner 2
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scanner3')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Open Scanner 3
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scanner4')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Super Pivots
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scanner5')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Option Calls
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scanner6')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Option Puts
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-3 gap-4">
              <div>
                <div className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                  Nifty 500 + F&amp;O
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Daily universe coverage</div>
              </div>
              <div>
                <div className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                  LTP / Close
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Market-hours aware engine</div>
              </div>
              <div>
                <div className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                  3-Day Trial
                </div>
                <div className="text-xs text-slate-500 mt-0.5">₹99/mo or ₹499/yr plans</div>
              </div>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="lg:col-span-6">
            <div className="h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 bg-slate-950 relative">
              {!heroImgError ? (
                <img
                  src="/src/assets/images/hero_scanner_terminal_1795418679798.jpg"
                  alt="GazabPaisa Awesome Scanner trading desk showing Market Bias support zones and Twin Range entry markers"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full min-h-[340px] flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 text-white">
                  <BarChart3 className="w-12 h-12 text-emerald-400 mb-3" />
                  <p className="font-display text-lg font-semibold">
                    GazabPaisa Awesome Scanner Workstation
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Market Bias · Twin Range · BBWP · PVO · Weekly Pivots
                  </p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent p-5">
                <p className="text-xs font-medium text-emerald-300">
                  Broker Live Feed Integration
                </p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  Multi-indicator confluence for accurate NSE swing &amp; positional entries
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Scanning Capabilities */}
      <section className="border-t border-slate-200 bg-white py-14 lg:py-16">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-emerald-700">Scanning Methodology</p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 text-balance">
              Engineered to pinpoint support bounces, resistance dips, and volatility squeezes.
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-xs font-mono font-semibold text-slate-500">01</div>
              <h3 className="mt-2 font-display text-base font-bold text-slate-950">
                Market Bias Reversals
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Uses Market Bias zone detection to spot stocks bouncing off support or dipping from
                resistance zones.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-xs font-mono font-semibold text-slate-500">02</div>
              <h3 className="mt-2 font-display text-base font-bold text-slate-950">
                Twin Range Confirmation
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Twin Range Filter generates Buy and Sell triggers precisely when price reacts inside
                the Market Bias zone.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-xs font-mono font-semibold text-slate-500">03</div>
              <h3 className="mt-2 font-display text-base font-bold text-slate-950">
                BBWP &amp; PVO Filters
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Filters volatility compression and expansion phases via BBWP paired with Price
                Volume Oscillator positive momentum.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-xs font-mono font-semibold text-slate-500">04</div>
              <h3 className="mt-2 font-display text-base font-bold text-slate-950">
                Gemini AI &amp; Weekly Pivots
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Ask Gemini for setup validation, probable Entry/Target/Stop-Loss levels, and exact
                Weekly Pivot (PP, R1, R2, S1, S2) scale positioning.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Interactive Entry Point Chart Preview */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-4">
            <p className="text-xs font-semibold text-emerald-700">Live Chart Entry Preview</p>
            <h2 className="font-display text-2xl font-bold text-slate-950 tracking-tight">
              Visualizing probable entry, target, and stop-loss levels directly on NSE candles.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every candidate in Scanner 1 includes an interactive candlestick chart overlaying the
              Market Bias zone, Twin Range filter line, and computed Entry/Target/Stop-Loss levels.
            </p>
            {featuredStock && (
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-slate-950">
                    {featuredStock.symbol}
                  </span>
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    ₹{featuredStock.currentPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Market Bias Setup</span>
                  <span className="font-semibold text-slate-900">
                    {featuredStock.marketBiasSetup}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Twin Range Signal</span>
                  <span
                    className={`font-mono font-bold ${
                      featuredStock.twinRangeSignal === 'BUY'
                        ? 'text-emerald-700'
                        : featuredStock.twinRangeSignal === 'SELL'
                          ? 'text-rose-700'
                          : 'text-slate-700'
                    }`}
                  >
                    {featuredStock.twinRangeSignal}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 font-mono tabular-nums">
                  <div>
                    <div className="text-[11px] text-slate-500">Entry</div>
                    <div className="font-semibold text-slate-900">
                      ₹{featuredStock.entryPrice.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Target</div>
                    <div className="font-semibold text-emerald-700">
                      ₹{featuredStock.targetPrice.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Stop Loss</div>
                    <div className="font-semibold text-rose-700">
                      ₹{featuredStock.stopLoss.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('broker')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Connect Broker
              </button>
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                View Plans (From ₹99)
              </button>
            </div>
          </div>

          <div className="lg:col-span-8">
            {featuredStock ? (
              <StockTechnicalChart stock={featuredStock} mode="scanner1" compact />
            ) : (
              <div className="h-[340px] rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center p-6 text-center text-sm text-slate-400">
                <p>
                  {brokerSession?.connected && brokerToken
                    ? 'Fetching fresh chart data from broker...'
                    : 'Connect your broker via Multi Broker Connect to preview live stock charts.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Disclaimer Banner */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row items-start gap-4">
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-slate-950">
              Important Disclaimer
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              No guarantee of returns or profits. GazabPaisa Awesome Scanner provides quantitative
              and technical indicator analysis strictly to facilitate informed, independent trading
              decisions. Equity and F&amp;O trading involves substantial market risk; always verify
              position sizing and risk management before executing trades.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Live LTP used during NSE Market Hours (09:15–15:30 IST)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Official Last Closing Price used outside Market Hours
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Live One-to-One Demo Session Information */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-emerald-950 text-white border border-emerald-900 rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row items-start gap-4">
          <div className="p-2.5 rounded-lg bg-emerald-900 border border-emerald-800 text-emerald-300 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-base font-bold text-white">
              Live One-to-One Scanner Interpretation Demo Session
            </h3>
            <p className="mt-1.5 text-sm text-emerald-100 leading-relaxed">
              The information displayed by the Scanners is difficult to interpret and cannot be
              deciphered at the first shot. When you take GazabPaisa subscription, we conduct live
              one-to-one demo session with our client in order for the user to understand the
              meaning and interpretation of all the information provided by our Scanners. This will
              lead to much better understanding for our Users and make them profitable in their
              trading business.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
              >
                Explore Subscription Plans
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 border border-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
              >
                Schedule Demo / Contact Us
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
