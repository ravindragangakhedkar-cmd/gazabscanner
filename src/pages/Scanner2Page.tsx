import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart2, Link2, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { AnalyzedStock, MarketClockStatus } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { AuthGatePage } from '../components/AuthGatePage';
import { StockChartModal } from '../components/StockChartModal';
import { AskGeminiModal } from '../components/AskGeminiModal';
import { buildCompactStockPayload, getJsonSafely, postJsonSafely } from '../lib/safeFetchJson';
import type { Scanner2GeminiPivotAnalysis } from '../../server/geminiService';
import type { AppPage } from '../components/TopNav';

export function Scanner2Page({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const { user, isVerified, hasScannerAccess, brokerToken, brokerSession } = useAuth();
  const isBrokerConnected = Boolean(brokerSession?.connected && brokerToken);

  // Initial state: Any EMA selected; BBWP 0-30 & PVO Positive unchecked at start
  const [emaFilter, setEmaFilter] = useState<'any' | 'gt' | 'lt'>('any');
  const [bbwp0To30, setBbwp0To30] = useState(false);
  const [pvoPositive, setPvoPositive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [stocks, setStocks] = useState<AnalyzedStock[]>([]);
  const [clock, setClock] = useState<MarketClockStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [chartStock, setChartStock] = useState<AnalyzedStock | null>(null);
  const [geminiStock, setGeminiStock] = useState<AnalyzedStock | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiResult, setGeminiResult] = useState<Scanner2GeminiPivotAnalysis | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFreshScannerData = useCallback(async () => {
    if (!isBrokerConnected || !brokerToken) {
      setStocks([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStocks([]);
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        emaFilter,
        skipIntraday: '1',
        _: String(Date.now()),
      });
      if (bbwp0To30) params.set('bbwpMax', '30');
      if (pvoPositive) params.set('pvoPositive', '1');
      if (debouncedQuery) params.set('q', debouncedQuery);

      const json = await getJsonSafely<{
        stocks?: AnalyzedStock[];
        clock?: MarketClockStatus;
      }>(`/api/market/scan?${params.toString()}`, { 'x-broker-session': brokerToken }, controller.signal);

      if (controller.signal.aborted) return;
      setStocks(json.stocks ?? []);
      setClock(json.clock ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch fresh NSE scanner feed.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [isBrokerConnected, brokerToken, emaFilter, bbwp0To30, pvoPositive, debouncedQuery]);

  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected) {
      abortRef.current?.abort();
      setStocks([]);
      setLoading(false);
      return;
    }
    void fetchFreshScannerData();
    return () => {
      abortRef.current?.abort();
    };
  }, [isVerified, hasScannerAccess, isBrokerConnected, fetchFreshScannerData]);

  const handleAskGemini = async (stock: AnalyzedStock) => {
    setGeminiStock(stock);
    setGeminiLoading(true);
    setGeminiResult(null);
    setGeminiError(null);
    try {
      const json = await postJsonSafely<{ analysis: Scanner2GeminiPivotAnalysis }>(
        '/api/gemini/scanner2-pivot',
        { stock: buildCompactStockPayload(stock) },
      );
      setGeminiResult(json.analysis);
    } catch (err) {
      setGeminiError(err instanceof Error ? err.message : 'Unable to fetch Gemini pivot analysis.');
    } finally {
      setGeminiLoading(false);
    }
  };

  if (!user || !isVerified) {
    return (
      <AuthGatePage
        title="Sign in to unlock Scanner 2"
        subtitle="Verified Google / Gmail or Email authentication is required to run Daily EMA, BBWP 0–30, PVO, and Weekly Pivot Gemini analysis."
      />
    );
  }

  if (!hasScannerAccess) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-slate-950">
            Your 3-Day Free Trial Has Ended
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Subscribe to Monthly (₹99) or Yearly (₹499) via Google Play Store checkout to continue
            using Scanner 2.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
          >
            Choose Subscription Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Daily Timeframe · Entire Nifty 500 &amp; F&amp;O · Weekly Pivot Scale via ASK Gemini
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Scanner 2 — Daily EMA, BBWP Compression &amp; Weekly Pivots
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-600">
          <span>
            {isBrokerConnected
              ? (clock?.sessionLabel ?? 'Broker Connected · Live Feed')
              : 'Broker Disconnected · Table Vacant'}
          </span>
          {isBrokerConnected && (
            <>
              <span aria-hidden="true">·</span>
              <span>{stocks.length} Matches</span>
            </>
          )}
          {isBrokerConnected ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchFreshScannerData()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Live Feed
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('broker')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              Connect Broker
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Filter Bar at Top */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-5">
        <div
          className="flex flex-wrap items-center gap-4"
          role="radiogroup"
          aria-label="EMA trend filter"
        >
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="emaFilter"
              checked={emaFilter === 'gt'}
              onChange={() => setEmaFilter('gt')}
              className="w-4 h-4 text-emerald-700 border-slate-300 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">
              Daily Fast EMA &gt; Slow EMA
            </span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="emaFilter"
              checked={emaFilter === 'lt'}
              onChange={() => setEmaFilter('lt')}
              className="w-4 h-4 text-emerald-700 border-slate-300 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">
              Daily Fast EMA &lt; Slow EMA
            </span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="emaFilter"
              checked={emaFilter === 'any'}
              onChange={() => setEmaFilter('any')}
              className="w-4 h-4 text-emerald-700 border-slate-300 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">Any EMA</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bbwp0To30}
              onChange={(e) => setBbwp0To30(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">BBWP 0–30</span>
          </label>

          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pvoPositive}
              onChange={(e) => setPvoPositive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">
              Price Volume Oscillator Positive
            </span>
          </label>
        </div>
      </div>

      {/* Quick Symbol Search */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Nifty 500 / F&O stock..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* Scanner 2 Results Table (Strictly Vacant Until Broker Connected) */}
      <div className="mt-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Stock Name</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4 text-right">BBWP</th>
                <th className="py-3 px-4">BBWP Status</th>
                <th className="py-3 px-4 text-right">PVO</th>
                <th className="py-3 px-4">Daily EMA Trend</th>
                <th className="py-3 px-4 text-center">Chart</th>
                <th className="py-3 px-4 text-center">ASK Gemini (Weekly Pivots)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {!isBrokerConnected ? (
                <tr>
                  <td colSpan={8} className="py-16 px-4 text-center">
                    <p className="text-sm font-semibold text-slate-900">
                      No data loaded. Connect your broker via Multi Broker Connect to fetch live
                      prices and run indicators.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('broker')}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Open Multi Broker Connect
                    </button>
                  </td>
                </tr>
              ) : loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td colSpan={8} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : stocks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-sm text-slate-500">
                    No stocks match the selected EMA, BBWP 0–30, and PVO criteria on the latest
                    broker feed.
                  </td>
                </tr>
              ) : (
                stocks.map((stock) => {
                  const isUp = stock.change >= 0;
                  const isEmaBullish = stock.ema10 >= stock.ema20;
                  return (
                    <tr key={stock.symbol} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-display font-bold text-slate-950">{stock.symbol}</div>
                        <div className="text-xs text-slate-500">
                          {stock.companyName} · {stock.isFno ? 'F&O' : 'Nifty 500'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-950">
                          ₹{stock.currentPrice.toFixed(2)}
                        </div>
                        <div
                          className={`text-[11px] ${isUp ? 'text-emerald-700' : 'text-rose-700'}`}
                        >
                          {isUp ? '+' : ''}
                          {stock.changePercent.toFixed(2)}% ({stock.priceBasis})
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        <span
                          className={
                            stock.bbwp <= 30 ? 'font-semibold text-emerald-700' : 'text-slate-700'
                          }
                        >
                          {stock.bbwp.toFixed(1)}%
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div
                          className={`text-xs font-semibold whitespace-nowrap ${
                            stock.bbwpStatus === 'Sustained Expansion'
                              ? 'text-emerald-700'
                              : stock.bbwpStatus === 'Early Expansion'
                                ? 'text-sky-700'
                                : stock.bbwpStatus === 'Fading Expansion'
                                  ? 'text-amber-700'
                                  : stock.bbwpStatus === 'Extreme Expansion'
                                    ? 'text-rose-700'
                                    : 'text-slate-600'
                          }`}
                        >
                          {stock.bbwpStatus}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 tabular-nums whitespace-nowrap">
                          Slope: {stock.bbwpSlope}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        <span
                          className={
                            stock.pvoPositive ? 'font-semibold text-emerald-700' : 'text-rose-700'
                          }
                        >
                          {stock.pvo >= 0 ? '+' : ''}
                          {stock.pvo.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div
                          className={`text-xs font-semibold ${
                            isEmaBullish ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {stock.emaTrend}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                          Fast ₹{stock.ema10.toFixed(1)} · Slow ₹{stock.ema20.toFixed(1)}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setChartStock(stock)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          Chart
                        </button>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => void handleAskGemini(stock)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          ASK Gemini
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {chartStock && (
        <StockChartModal
          stock={chartStock}
          mode="scanner2"
          onClose={() => setChartStock(null)}
        />
      )}

      {geminiStock && (
        <AskGeminiModal
          stock={geminiStock}
          loading={geminiLoading}
          error={geminiError}
          result={geminiResult}
          onClose={() => setGeminiStock(null)}
        />
      )}
    </div>
  );
}
