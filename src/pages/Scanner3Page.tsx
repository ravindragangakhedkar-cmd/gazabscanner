import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, LineChart, Link2, RefreshCw, RotateCcw } from 'lucide-react';
import type {
  AnalyzedStock,
  MarketBiasSetup,
  MarketClockStatus,
  TwinRangeSignal,
} from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { AuthGatePage } from '../components/AuthGatePage';
import { StockChartModal } from '../components/StockChartModal';
import { WeeklyPivotAnalysisModal } from '../components/WeeklyPivotAnalysisModal';
import { ConfluenceAlertPanel } from '../components/ConfluenceAlertPanel';
import { getJsonSafely } from '../lib/safeFetchJson';
import type { AppPage } from '../components/TopNav';

export function Scanner3Page({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const { user, isVerified, hasScannerAccess, brokerToken, brokerSession } = useAuth();
  const isBrokerConnected = Boolean(brokerSession?.connected && brokerToken);

  // All filters placed at the top — unfiltered/unchecked initially so all 4 indices display after Broker Connect
  const [marketBiasFilter, setMarketBiasFilter] = useState<'ALL' | MarketBiasSetup>('ALL');
  const [twinRangeFilter, setTwinRangeFilter] = useState<'ALL' | TwinRangeSignal>('ALL');
  const [bbwp0To50, setBbwp0To50] = useState(false);
  const [pvoPositive, setPvoPositive] = useState(false);

  const [allIndices, setAllIndices] = useState<AnalyzedStock[]>([]);
  const [indices, setIndices] = useState<AnalyzedStock[]>([]);
  const [clock, setClock] = useState<MarketClockStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chartStock, setChartStock] = useState<AnalyzedStock | null>(null);
  const [analysisStock, setAnalysisStock] = useState<AnalyzedStock | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchFreshIndexBasket = useCallback(async () => {
    if (!isBrokerConnected || !brokerToken) {
      setAllIndices([]);
      setIndices([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Clear stale rows immediately so no old data stays in memory/UI
    setIndices([]);
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        marketBiasFilter,
        twinRangeFilter,
        _: String(Date.now()),
      });
      if (bbwp0To50) params.set('bbwp0To50', '1');
      if (pvoPositive) params.set('pvoPositive', '1');

      const json = await getJsonSafely<{
        allIndices?: AnalyzedStock[];
        indices?: AnalyzedStock[];
        clock?: MarketClockStatus;
      }>(
        `/api/market/scan-indices?${params.toString()}`,
        { 'x-broker-session': brokerToken },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      setAllIndices(json.allIndices ?? json.indices ?? []);
      setIndices(json.indices ?? []);
      setClock(json.clock ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch fresh Index Basket.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [isBrokerConnected, brokerToken, marketBiasFilter, twinRangeFilter, bbwp0To50, pvoPositive]);

  // Fetch fresh server data whenever broker connects OR any filter changes; stay empty if disconnected
  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected) {
      abortRef.current?.abort();
      setAllIndices([]);
      setIndices([]);
      setLoading(false);
      return;
    }
    void fetchFreshIndexBasket();
    return () => {
      abortRef.current?.abort();
    };
  }, [isVerified, hasScannerAccess, isBrokerConnected, fetchFreshIndexBasket]);

  // Refresh on every 1h candle during open NSE hours to minimize Broker Connect & server load
  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected || !clock?.isOpen) return;
    const timer = setInterval(() => {
      void fetchFreshIndexBasket();
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isVerified, hasScannerAccess, isBrokerConnected, clock?.isOpen, fetchFreshIndexBasket]);

  const confluenceMatchedCount = useMemo(
    () => allIndices.filter((idx) => idx.confluenceMatched).length,
    [allIndices],
  );

  const hasActiveFilters =
    marketBiasFilter !== 'ALL' || twinRangeFilter !== 'ALL' || bbwp0To50 || pvoPositive;

  const resetFilters = () => {
    setMarketBiasFilter('ALL');
    setTwinRangeFilter('ALL');
    setBbwp0To50(false);
    setPvoPositive(false);
  };

  if (!user || !isVerified) {
    return (
      <AuthGatePage
        title="Sign in to unlock Scanner 3 (Index Basket)"
        subtitle="Scanner 3 is restricted to registered users. Authenticate with Google / Gmail or verified Email to scan Nifty, Bank Nifty, FinNifty, and Sensex."
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
            continue accessing Scanner 3 Index Basket.
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
      {/* Page Title & Live Broker / Market Hours Status */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Daily Timeframe · Index Basket (Nifty, Bank Nifty, FinNifty, Sensex) · Market Bias +
            Twin Range
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Scanner 3 — Live Index Basket Scanner
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-600">
          <span>
            {isBrokerConnected
              ? (clock?.sessionLabel ?? 'Broker Connected · Live Feed')
              : 'Broker Disconnected · Table Vacant'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {isBrokerConnected
              ? `Broker Connected (${brokerSession?.clientCode ?? 'Live Feed'})`
              : 'Not Connected'}
          </span>
          {isBrokerConnected ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchFreshIndexBasket()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Live Indices
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

      {/* Horizontal Filter Bar at Top (Market Bias, Twin Range, BBWP, PVO) */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <span>Market Bias</span>
            <select
              value={marketBiasFilter}
              onChange={(e) => setMarketBiasFilter(e.target.value as 'ALL' | MarketBiasSetup)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="ALL">All Setups</option>
              <option value="Bullish Bounce">Bullish Bounce</option>
              <option value="Bearish Dip">Bearish Dip</option>
              <option value="Neutral">Neutral</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <span>Twin Range</span>
            <select
              value={twinRangeFilter}
              onChange={(e) => setTwinRangeFilter(e.target.value as 'ALL' | TwinRangeSignal)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="ALL">All Signals</option>
              <option value="BUY">Long</option>
              <option value="SELL">Short</option>
              <option value="HOLD">Hold</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bbwp0To50}
              onChange={(e) => setBbwp0To50(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">BBWP 0–50</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pvoPositive}
              onChange={(e) => setPvoPositive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">PVO Positive</span>
          </label>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Show All Indices
          </button>
        )}
      </div>

      {/* Zero-Lag Intraday 1h Confluence Alert Monitor */}
      <ConfluenceAlertPanel
        scanner="scanner3"
        matchedCount={confluenceMatchedCount}
        isMarketOpen={Boolean(clock?.isOpen)}
      />

      {/* Live Index Basket Spot Strip (Only Shown Once Broker Connected) */}
      {isBrokerConnected && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading && allIndices.length === 0
            ? ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'].map((sym) => (
                <div
                  key={sym}
                  className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse"
                >
                  <div className="h-4 w-24 bg-slate-100 rounded mb-2" />
                  <div className="h-6 w-32 bg-slate-100 rounded" />
                </div>
              ))
            : allIndices.map((idx) => {
                const isUp = idx.change >= 0;
                return (
                  <div
                    key={idx.symbol}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-display font-bold text-sm text-slate-950">
                        {idx.symbol}
                      </div>
                      <div className="text-xs text-slate-500">{idx.companyName}</div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-base font-bold text-slate-950">
                        {idx.currentPrice.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          isUp ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isUp ? '+' : ''}
                        {idx.change.toFixed(2)} ({isUp ? '+' : ''}
                        {idx.changePercent.toFixed(2)}%) · {idx.priceBasis}
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      )}

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
                <th className="py-3 px-4">1. Index</th>
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
                      index prices and run indicators.
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
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td colSpan={10} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : indices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 px-4 text-center text-sm text-slate-500">
                    No indices in the basket match the selected Market Bias, Twin Range, BBWP, or
                    PVO filters on the latest broker feed. Click &ldquo;Show All Indices&rdquo; to
                    view the full basket.
                  </td>
                </tr>
              ) : (
                indices.map((stock) => {
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
                      {/* 1. Index */}
                      <td className="py-3 px-4">
                        <div className="font-display font-bold text-slate-950">{stock.symbol}</div>
                        <div className="text-xs text-slate-500 max-w-[200px] truncate">
                          {stock.companyName}
                        </div>
                      </td>

                      {/* 2. Price */}
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-950">
                          {stock.currentPrice.toFixed(2)}
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
                          <span className="font-semibold">{stock.entryPrice.toFixed(2)}</span>
                        </div>
                        <div className="text-emerald-700">
                          Target: {stock.targetPrice.toFixed(2)} ·{' '}
                          <span className="text-rose-700">SL: {stock.stopLoss.toFixed(2)}</span>
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
