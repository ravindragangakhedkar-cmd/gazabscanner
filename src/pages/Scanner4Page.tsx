import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart2, Link2, RefreshCw, Search } from 'lucide-react';
import type { AnalyzedStock, MarketClockStatus, SuperPivotTrend } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { AuthGatePage } from '../components/AuthGatePage';
import { StockChartModal } from '../components/StockChartModal';
import { getJsonSafely } from '../lib/safeFetchJson';
import type { AppPage } from '../components/TopNav';

const TREND_OPTIONS: Array<{ id: 'ALL' | SuperPivotTrend; label: string }> = [
  { id: 'ALL', label: 'All Trends' },
  { id: 'Strong Uptrend', label: 'Strong Uptrend' },
  { id: 'Uptrend', label: 'Uptrend' },
  { id: 'Sideways', label: 'Sideways' },
  { id: 'Downtrend', label: 'Downtrend' },
  { id: 'Severe Downtrend', label: 'Severe Downtrend' },
];

const EMPTY_TREND_COUNTS: Record<SuperPivotTrend, number> = {
  'Strong Uptrend': 0,
  Uptrend: 0,
  Sideways: 0,
  Downtrend: 0,
  'Severe Downtrend': 0,
};

export function Scanner4Page({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const { user, isVerified, hasScannerAccess, brokerToken, brokerSession } = useAuth();
  const isBrokerConnected = Boolean(brokerSession?.connected && brokerToken);

  const [trendFilter, setTrendFilter] = useState<'ALL' | SuperPivotTrend>('ALL');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'stocks' | 'indices'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [items, setItems] = useState<AnalyzedStock[]>([]);
  const [clock, setClock] = useState<MarketClockStatus | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalTracked, setTotalTracked] = useState(0);
  const [trendCounts, setTrendCounts] = useState<Record<SuperPivotTrend, number>>(EMPTY_TREND_COUNTS);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chartStock, setChartStock] = useState<AnalyzedStock | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFreshSuperPivots = useCallback(async () => {
    if (!isBrokerConnected || !brokerToken) {
      setItems([]);
      setLoadedCount(0);
      setTotalTracked(0);
      setTrendCounts(EMPTY_TREND_COUNTS);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Clear stale rows immediately so no old stock/index data remains in memory/UI
    setItems([]);
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        trendFilter,
        segmentFilter,
        _: String(Date.now()),
      });
      if (debouncedQuery) params.set('q', debouncedQuery);

      const json = await getJsonSafely<{
        items?: AnalyzedStock[];
        clock?: MarketClockStatus;
        loadedCount?: number;
        totalUniverseTracked?: number;
        trendCounts?: Record<SuperPivotTrend, number>;
      }>(
        `/api/market/scan-super-pivots?${params.toString()}`,
        { 'x-broker-session': brokerToken },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      setItems(json.items ?? []);
      setClock(json.clock ?? null);
      setLoadedCount(json.loadedCount ?? 0);
      setTotalTracked(json.totalUniverseTracked ?? 0);
      setTrendCounts(json.trendCounts ?? EMPTY_TREND_COUNTS);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch fresh Super Pivots data.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [isBrokerConnected, brokerToken, trendFilter, segmentFilter, debouncedQuery]);

  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected) {
      abortRef.current?.abort();
      setItems([]);
      setLoadedCount(0);
      setTotalTracked(0);
      setTrendCounts(EMPTY_TREND_COUNTS);
      setLoading(false);
      return;
    }
    void fetchFreshSuperPivots();
    return () => {
      abortRef.current?.abort();
    };
  }, [isVerified, hasScannerAccess, isBrokerConnected, fetchFreshSuperPivots]);

  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected || !clock?.isOpen) return;
    const timer = setInterval(() => {
      void fetchFreshSuperPivots();
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isVerified, hasScannerAccess, isBrokerConnected, clock?.isOpen, fetchFreshSuperPivots]);

  if (!user || !isVerified) {
    return (
      <AuthGatePage
        title="Sign in to unlock Scanner 4 — Super Pivots"
        subtitle="Verified Google / Gmail or Email authentication is required to scan Nifty 500, F&O stocks & NSE/BSE Indices across Daily, Weekly, and Monthly Pivot levels."
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
            continue accessing Super Pivots and all Scanners.
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

  const getTrendColorClass = (trend: SuperPivotTrend): string => {
    switch (trend) {
      case 'Strong Uptrend':
        return 'text-emerald-700 font-bold';
      case 'Uptrend':
        return 'text-emerald-600 font-semibold';
      case 'Severe Downtrend':
        return 'text-rose-700 font-bold';
      case 'Downtrend':
        return 'text-rose-600 font-semibold';
      default:
        return 'text-amber-700 font-semibold';
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Title & Live Session Meta */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Daily · Weekly · Monthly Pivot Confluence · Nifty 500, F&amp;O &amp; Indices (Nifty, Bank Nifty, FinNifty, Sensex)
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Scanner 4 — Super Pivots
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
                Freshly Scanned {loadedCount}/{totalTracked || '—'} Instruments
              </span>
            </>
          )}
          {isBrokerConnected ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchFreshSuperPivots()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Live Feed
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('broker')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Link2 className="w-3.5 h-3.5" />
              Connect Broker
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Filter Bar at Top */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Trend Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {TREND_OPTIONS.map((opt) => {
            const count = opt.id === 'ALL' ? loadedCount : trendCounts[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTrendFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  trendFilter === opt.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
                {isBrokerConnected ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Segment Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
          {[
            { id: 'all', label: 'Stocks & Indices' },
            { id: 'indices', label: 'Indices Only' },
            { id: 'stocks', label: 'Nifty 500 & F&O' },
          ].map((seg) => (
            <button
              key={seg.id}
              type="button"
              onClick={() => setSegmentFilter(seg.id as 'all' | 'stocks' | 'indices')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                segmentFilter === seg.id
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by stock or index name..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* Strictly Requested 7-Column Result Table */}
      <div className="mt-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">1. Stock Name</th>
                <th className="py-3 px-4 text-right">2. Price</th>
                <th className="py-3 px-4">3. Trend</th>
                <th className="py-3 px-4 text-right">4. Daily PP level</th>
                <th className="py-3 px-4 text-right">5. Weekly PP level</th>
                <th className="py-3 px-4 text-right">6. Monthly PP level</th>
                <th className="py-3 px-4 text-center">7. Chart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {!isBrokerConnected ? (
                <tr>
                  <td colSpan={7} className="py-16 px-4 text-center">
                    <p className="text-sm font-semibold text-slate-900">
                      No data loaded. Connect your broker via Multi Broker Connect to fetch live
                      prices and calculate Super Pivots across Nifty 500, F&amp;O stocks &amp; Indices.
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
                    <td colSpan={7} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center text-sm text-slate-500">
                    No stocks or indices match the selected Super Pivots filter on the latest
                    broker feed.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isUp = item.change >= 0;
                  const unit = item.isIndex ? '' : '₹';

                  return (
                    <tr key={item.symbol} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Stock Name */}
                      <td className="py-3 px-4">
                        <div className="font-display font-bold text-slate-950">{item.symbol}</div>
                        <div className="text-xs text-slate-500 max-w-[230px] truncate">
                          {item.companyName}
                          <span aria-hidden="true"> · </span>
                          <span>{item.isIndex ? 'Index' : 'NSE'}</span>
                        </div>
                      </td>

                      {/* 2. Price */}
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-950">
                          {unit}
                          {item.currentPrice.toFixed(2)}
                        </div>
                        <div
                          className={`text-[11px] ${isUp ? 'text-emerald-700' : 'text-rose-700'}`}
                        >
                          {isUp ? '+' : ''}
                          {item.changePercent.toFixed(2)}%
                        </div>
                      </td>

                      {/* 3. Trend */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`text-xs ${getTrendColorClass(item.superPivots.trend)}`}>
                          {item.superPivots.trend}
                        </span>
                      </td>

                      {/* 4. Daily PP level */}
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {unit}
                        {item.superPivots.daily.pp.toFixed(2)}
                      </td>

                      {/* 5. Weekly PP level */}
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {unit}
                        {item.superPivots.weekly.pp.toFixed(2)}
                      </td>

                      {/* 6. Monthly PP level */}
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {unit}
                        {item.superPivots.monthly.pp.toFixed(2)}
                      </td>

                      {/* 7. Chart */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setChartStock(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          Chart
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
          mode="scanner4"
          onClose={() => setChartStock(null)}
        />
      )}
    </div>
  );
}
