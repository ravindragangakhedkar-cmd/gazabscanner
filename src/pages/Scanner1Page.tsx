import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart2, LineChart, Link2, RefreshCw, Search } from 'lucide-react';
import type { AnalyzedStock, MarketClockStatus } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { AuthGatePage } from '../components/AuthGatePage';
import { StockChartModal } from '../components/StockChartModal';
import { WeeklyPivotAnalysisModal } from '../components/WeeklyPivotAnalysisModal';
import { ConfluenceAlertPanel } from '../components/ConfluenceAlertPanel';
import { getJsonSafely } from '../lib/safeFetchJson';
import type { AppPage } from '../components/TopNav';

export function Scanner1Page({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const { user, isVerified, hasScannerAccess, brokerToken, brokerSession } = useAuth();
  const isBrokerConnected = Boolean(brokerSession?.connected && brokerToken);

  // Horizontal filters at top — strictly unchecked at the beginning per spec
  const [bbwp0To50, setBbwp0To50] = useState(false);
  const [pvoPositive, setPvoPositive] = useState(false);

  const [setupFilter, setSetupFilter] = useState<
    'all-setups' | 'bounce' | 'dip' | 'confluence' | 'universe'
  >('all-setups');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');

  const [stocks, setStocks] = useState<AnalyzedStock[]>([]);
  const [clock, setClock] = useState<MarketClockStatus | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalTracked, setTotalTracked] = useState(0);
  const [confluenceMatchedCount, setConfluenceMatchedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chartStock, setChartStock] = useState<AnalyzedStock | null>(null);
  const [analysisStock, setAnalysisStock] = useState<AnalyzedStock | null>(null);

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
      setLoadedCount(0);
      setTotalTracked(0);
      setConfluenceMatchedCount(0);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Clear stale rows immediately so no old data stays in memory/UI
    setStocks([]);
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        setupFilter,
        _: String(Date.now()),
      });
      if (bbwp0To50) params.set('bbwpMax', '50');
      if (pvoPositive) params.set('pvoPositive', '1');
      if (debouncedQuery) params.set('q', debouncedQuery);

      const json = await getJsonSafely<{
        stocks?: AnalyzedStock[];
        clock?: MarketClockStatus;
        loadedCount?: number;
        totalUniverseTracked?: number;
        confluenceMatchedCount?: number;
      }>(`/api/market/scan?${params.toString()}`, { 'x-broker-session': brokerToken }, controller.signal);

      if (controller.signal.aborted) return;
      setStocks(json.stocks ?? []);
      setClock(json.clock ?? null);
      setLoadedCount(json.loadedCount ?? 0);
      setTotalTracked(json.totalUniverseTracked ?? 0);
      setConfluenceMatchedCount(json.confluenceMatchedCount ?? 0);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch fresh NSE scanner feed.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [isBrokerConnected, brokerToken, bbwp0To50, pvoPositive, setupFilter, debouncedQuery]);

  // Fetch fresh server data whenever broker connects OR any filter changes; stay empty if disconnected
  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected) {
      abortRef.current?.abort();
      setStocks([]);
      setLoadedCount(0);
      setTotalTracked(0);
      setConfluenceMatchedCount(0);
      setLoading(false);
      return;
    }
    void fetchFreshScannerData();
    return () => {
      abortRef.current?.abort();
    };
  }, [isVerified, hasScannerAccess, isBrokerConnected, fetchFreshScannerData]);

  // Refresh on every 1h candle during open NSE hours to minimize Broker Connect & server load
  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected || !clock?.isOpen) return;
    const timer = setInterval(() => {
      void fetchFreshScannerData();
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isVerified, hasScannerAccess, isBrokerConnected, clock?.isOpen, fetchFreshScannerData]);

  const handleAddCustomSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSymbol.trim() || !isBrokerConnected || !brokerToken) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStocks([]);
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getJsonSafely<{ stock: AnalyzedStock }>(
        `/api/market/stock/${encodeURIComponent(customSymbol.trim())}?_=${Date.now()}`,
        { 'x-broker-session': brokerToken },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setStocks([data.stock]);
      setLoadedCount(1);
      setCustomSymbol('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Unable to scan symbol.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  if (!user || !isVerified) {
    return (
      <AuthGatePage
        title="Sign in to unlock Scanner 1"
        subtitle="Verified Google / Gmail or Email authentication is required to scan Nifty 500 & F&O stocks with Market Bias & Twin Range."
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
            Select a Monthly (₹99) or Yearly (₹499) package via Google Play Store checkout to
            continue scanning Nifty 500 &amp; F&amp;O stocks.
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
      {/* Page Title & Live Session Meta */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Daily Timeframe · Nifty 500 + F&amp;O · Market Bias + Twin Range
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Scanner 1 — Market Bias &amp; Twin Range Reversals
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
              <span>
                Freshly Scanned {loadedCount}/{totalTracked || '—'} NSE Stocks
              </span>
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
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bbwp0To50}
              onChange={(e) => setBbwp0To50(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">BBWP 0–50</span>
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'all-setups', label: 'Active Setups' },
              { id: 'bounce', label: 'Bullish Bounce' },
              { id: 'dip', label: 'Bearish Dip' },
              { id: 'confluence', label: `Confluence Alerts (${confluenceMatchedCount})` },
              { id: 'universe', label: 'All Scanned' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setSetupFilter(
                    tab.id as 'all-setups' | 'bounce' | 'dip' | 'confluence' | 'universe',
                  )
                }
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  setupFilter === tab.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Zero-Lag Intraday 1h Confluence Alert Monitor */}
      <ConfluenceAlertPanel
        scanner="scanner1"
        matchedCount={confluenceMatchedCount}
        isMarketOpen={Boolean(clock?.isOpen)}
      />

      {/* Search & Custom NSE Symbol Lookup */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter results by stock name or symbol..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <form onSubmit={(e) => void handleAddCustomSymbol(e)} className="flex items-center gap-2">
          <input
            type="text"
            value={customSymbol}
            onChange={(e) => setCustomSymbol(e.target.value)}
            disabled={!isBrokerConnected}
            placeholder="Scan any NSE symbol (e.g. ZOMATO)"
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={loading || !isBrokerConnected}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            Scan Symbol
          </button>
        </form>
      </div>

      {errorMsg && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* Clean 9-Column Final Results Table (Strictly Vacant Until Broker Connected) */}
      <div className="mt-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">1. Stock</th>
                <th className="py-3 px-3 text-right">2. Price</th>
                <th className="py-3 px-3 text-center">3. Market Bias Zone</th>
                <th className="py-3 px-3">4. Market Bias Trend</th>
                <th className="py-3 px-3 text-center">5. Twin Range Signal</th>
                <th className="py-3 px-3">6. BBWP Value &amp; Status</th>
                <th className="py-3 px-3 text-right">7. PVO Value</th>
                <th className="py-3 px-3 text-right">8. Entry / Target / Stop Loss</th>
                <th className="py-3 px-3 text-center">9. Chart</th>
                <th className="py-3 px-4 text-center">10. Analysis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {!isBrokerConnected ? (
                <tr>
                  <td colSpan={10} className="py-16 px-4 text-center">
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
                    <td colSpan={10} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : stocks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 px-4 text-center text-sm text-slate-500">
                    No Nifty 500 / F&amp;O stocks match the selected filter combination on the latest
                    broker feed. Try unchecking a filter or switching to &ldquo;All Scanned&rdquo;.
                  </td>
                </tr>
              ) : (
                stocks.map((stock) => {
                  const isUp = stock.change >= 0;
                  const twinLabel =
                    stock.twinRangeFreshSignal ??
                    (stock.twinRangeSignal === 'BUY'
                      ? 'Long'
                      : stock.twinRangeSignal === 'SELL'
                        ? 'Short'
                        : 'Hold');
                  const isInside = stock.marketBiasZonePosition === 'Inside';
                  const isContinuation = stock.marketBiasTrendType === 'Trend Continuation';

                  return (
                    <tr key={stock.symbol} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Stock */}
                      <td className="py-3 px-4">
                        <div className="font-display font-bold text-slate-950">{stock.symbol}</div>
                        <div className="text-xs text-slate-500 max-w-[190px] truncate">
                          {stock.companyName}
                        </div>
                      </td>

                      {/* 2. Price */}
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-950">
                          ₹{stock.currentPrice.toFixed(2)}
                        </div>
                        <div
                          className={`text-[11px] ${isUp ? 'text-emerald-700' : 'text-rose-700'}`}
                        >
                          {isUp ? '+' : ''}
                          {stock.changePercent.toFixed(2)}%
                        </div>
                      </td>

                      {/* 3. Market Bias CEREBR Daily Zone (Inside or Outside) */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            isInside ? 'text-emerald-700' : 'text-slate-600'
                          }`}
                        >
                          {stock.marketBiasZonePosition}
                        </span>
                      </td>

                      {/* 4. Market Bias CEREBR Trend Continuation or Trend Reversal */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            isContinuation ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {stock.marketBiasTrendType}
                        </span>
                      </td>

                      {/* 5. Twin Range Long / Short Signal */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`text-xs font-mono font-bold ${
                            twinLabel === 'Long'
                              ? 'text-emerald-700'
                              : twinLabel === 'Short'
                                ? 'text-rose-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {twinLabel}
                        </span>
                      </td>

                      {/* 6. BBWP Value & Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {stock.bbwp.toFixed(1)}%
                        </div>
                        <div
                          className={`text-xs font-semibold ${
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
                      </td>

                      {/* 7. PVO Value */}
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <span
                          className={
                            stock.pvoPositive ? 'font-semibold text-emerald-700' : 'text-rose-700'
                          }
                        >
                          {stock.pvo >= 0 ? '+' : ''}
                          {stock.pvo.toFixed(2)}
                        </span>
                      </td>

                      {/* 8. Suggest Entry, Target Price & Stop Loss */}
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <div className="text-slate-900">
                          Entry:{' '}
                          <span className="font-semibold">₹{stock.entryPrice.toFixed(2)}</span>
                        </div>
                        <div className="text-emerald-700">
                          Target: ₹{stock.targetPrice.toFixed(2)} ·{' '}
                          <span className="text-rose-700">SL: ₹{stock.stopLoss.toFixed(2)}</span>
                        </div>
                      </td>

                      {/* 9. Chart */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setChartStock(stock)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          Chart
                        </button>
                      </td>

                      {/* 10. Analysis (Weekly PP, R1, R2, S1, S2 & Spot Position) */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setAnalysisStock(stock)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <LineChart className="w-3.5 h-3.5" />
                          Analysis
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

      {/* Chart Modal */}
      {chartStock && (
        <StockChartModal
          stock={chartStock}
          mode="scanner1"
          onClose={() => setChartStock(null)}
        />
      )}

      {/* Weekly Pivot Analysis Modal */}
      {analysisStock && (
        <WeeklyPivotAnalysisModal
          stock={analysisStock}
          onClose={() => setAnalysisStock(null)}
        />
      )}
    </div>
  );
}
