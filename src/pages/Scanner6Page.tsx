import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw, Search } from 'lucide-react';
import type {
  MarketClockStatus,
  OptionPutShortCoveringRow,
  OptionPutShortCoveringScanResponse,
} from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { AuthGatePage } from '../components/AuthGatePage';
import { getJsonSafely } from '../lib/safeFetchJson';
import type { AppPage } from '../components/TopNav';

type FilterMode = 'qualifying' | 'all';
type SegmentFilter = 'all' | 'stocks' | 'indices';

export function Scanner6Page({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const { user, isVerified, hasScannerAccess, brokerToken, brokerSession } = useAuth();
  const isBrokerConnected = Boolean(brokerSession?.connected && brokerToken);

  const [filterMode, setFilterMode] = useState<FilterMode>('qualifying');
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [items, setItems] = useState<OptionPutShortCoveringRow[]>([]);
  const [clock, setClock] = useState<MarketClockStatus | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalTracked, setTotalTracked] = useState(0);
  const [putIncreaseCount, setPutIncreaseCount] = useState(0);
  const [intervalLabel, setIntervalLabel] = useState('1-Hour Candle');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFreshOptionPuts = useCallback(async () => {
    if (!isBrokerConnected || !brokerToken) {
      setItems([]);
      setLoadedCount(0);
      setTotalTracked(0);
      setPutIncreaseCount(0);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Keep table strictly fresh with no stale option data retained in UI memory
    setItems([]);
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        filterMode,
        segmentFilter,
        _: String(Date.now()),
      });
      if (debouncedQuery) params.set('q', debouncedQuery);

      const json = await getJsonSafely<OptionPutShortCoveringScanResponse>(
        `/api/market/scan-option-put-short-covering?${params.toString()}`,
        { 'x-broker-session': brokerToken },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      setItems(json.items ?? []);
      setClock(json.clock ?? null);
      setLoadedCount(json.loadedCount ?? 0);
      setTotalTracked(json.totalUniverseTracked ?? 0);
      setPutIncreaseCount(json.putIncreaseCount ?? 0);
      setIntervalLabel(json.intervalLabel ?? '1-Hour Candle');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to fetch fresh Option Puts data from Nubra.',
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [isBrokerConnected, brokerToken, filterMode, segmentFilter, debouncedQuery]);

  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected) {
      abortRef.current?.abort();
      setItems([]);
      setLoadedCount(0);
      setTotalTracked(0);
      setPutIncreaseCount(0);
      setLoading(false);
      return;
    }
    void fetchFreshOptionPuts();
    return () => {
      abortRef.current?.abort();
    };
  }, [isVerified, hasScannerAccess, isBrokerConnected, fetchFreshOptionPuts]);

  // Auto-scan every 1-hour candle when market is open to align with 1h option interval & keep load low
  useEffect(() => {
    if (!isVerified || !hasScannerAccess || !isBrokerConnected || !clock?.isOpen) return;
    const timer = setInterval(() => {
      void fetchFreshOptionPuts();
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isVerified, hasScannerAccess, isBrokerConnected, clock?.isOpen, fetchFreshOptionPuts]);

  if (!user || !isVerified) {
    return (
      <AuthGatePage
        title="Sign in to unlock Option Puts"
        subtitle="Verified Google / Gmail or Email authentication is required to scan Nifty F&O stocks and Nifty, Bank Nifty, Sensex & FinNifty every 1h candle via Nubra Broker."
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
            continue accessing the Option Puts scanner.
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
            Nubra Broker Option Chain · 1-Hour Candle Scan · Nifty F&amp;O Stocks &amp; Nifty, Bank
            Nifty, Sensex, FinNifty
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Option Puts
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-600">
          <span>
            {isBrokerConnected
              ? (clock?.sessionLabel ?? 'Nubra Option Feed Connected')
              : 'Broker Disconnected · Table Vacant'}
          </span>
          {isBrokerConnected && (
            <>
              <span aria-hidden="true">·</span>
              <span>{intervalLabel}</span>
              <span aria-hidden="true">·</span>
              <span>
                Scanned {loadedCount}/{totalTracked || '—'}
              </span>
            </>
          )}
          {isBrokerConnected ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchFreshOptionPuts()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Nubra Feed
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

      {/* Horizontal Filter Bar */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Put Price Scan Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setFilterMode('qualifying')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'qualifying'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ATM Put &gt; +2%
            {isBrokerConnected ? ` (${putIncreaseCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'all'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Scanned F&amp;O
            {isBrokerConnected ? ` (${loadedCount})` : ''}
          </button>
        </div>

        {/* Segment Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
          {[
            { id: 'all', label: 'F&O Stocks & Indices' },
            { id: 'indices', label: 'Nifty / BankNifty / Sensex / FinNifty' },
            { id: 'stocks', label: 'Nifty F&O Stocks' },
          ].map((seg) => (
            <button
              key={seg.id}
              type="button"
              onClick={() => setSegmentFilter(seg.id as SegmentFilter)}
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
            placeholder="Filter by F&O stock or index name..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
        <div className="text-xs text-slate-500 font-mono">
          Scan: ATM Put &gt; +2% (1h) · Option Buildup via ATM Put OI %
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* Strictly Requested 8-Column Result Table */}
      <div className="mt-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">1. Stock or Index name</th>
                <th className="py-3 px-4 text-right">2. Price</th>
                <th className="py-3 px-4 text-right">3. ATM Strike Price</th>
                <th className="py-3 px-4 text-right">4. Put Price change in Percent</th>
                <th className="py-3 px-4 text-right">5. ATM Put Price start of the interval</th>
                <th className="py-3 px-4 text-right">6. ATM Put Price at the end of the interval</th>
                <th className="py-3 px-4 text-right">7. ATM Put OI % Change during the interval</th>
                <th className="py-3 px-4">8. Option Buildup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {!isBrokerConnected ? (
                <tr>
                  <td colSpan={8} className="py-16 px-4 text-center">
                    <p className="text-sm font-semibold text-slate-900">
                      No data loaded. Connect your broker via Multi Broker Connect to extract live
                      ATM option strikes and scan Option Puts from Nubra Broker.
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
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <p className="text-sm text-slate-600">
                      {filterMode === 'qualifying'
                        ? 'No F&O stocks or indices had ATM Put > +2% in the latest 1h Nubra interval.'
                        : 'No F&O stocks or indices match the selected filter on the latest Nubra Broker feed.'}
                    </p>
                    {filterMode === 'qualifying' && loadedCount > 0 && (
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFilterMode('all')}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          Show All Scanned ({loadedCount})
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const unit = item.isIndex ? '' : '₹';
                  const putUp = (item.putPriceChangePercent ?? 0) > 2;
                  const oiPos =
                    item.atmPutOiChangePercent !== null && item.atmPutOiChangePercent > 0;
                  const oiNeg =
                    item.atmPutOiChangePercent !== null && item.atmPutOiChangePercent < 0;

                  return (
                    <tr
                      key={`${item.exchange}:${item.symbol}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* 1. Stock or Index name */}
                      <td className="py-3 px-4">
                        <div className="font-display font-bold text-slate-950">{item.symbol}</div>
                        <div className="text-xs text-slate-500 max-w-[230px] truncate">
                          {item.atmPutSymbol}
                          <span aria-hidden="true"> · </span>
                          <span>{item.exchange}</span>
                        </div>
                      </td>

                      {/* 2. Price */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-950 tabular-nums whitespace-nowrap">
                        {unit}
                        {item.spotPrice.toFixed(2)}
                      </td>

                      {/* 3. ATM Strike Price */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {unit}
                        {item.atmStrikePrice.toLocaleString('en-IN')}
                      </td>

                      {/* 4. Put Price change in Percent */}
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                          putUp
                            ? 'text-emerald-700'
                            : (item.putPriceChangePercent ?? 0) >= 0
                              ? 'text-slate-900'
                              : 'text-rose-700'
                        }`}
                      >
                        {item.putPriceChangePercent !== null
                          ? `${item.putPriceChangePercent >= 0 ? '+' : ''}${item.putPriceChangePercent.toFixed(2)}%`
                          : '—'}
                      </td>

                      {/* 5. ATM Put Price start of the interval */}
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                        {item.putPriceStart !== null ? `₹${item.putPriceStart.toFixed(2)}` : '—'}
                      </td>

                      {/* 6. ATM Put Price at the end of the interval */}
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-950 tabular-nums whitespace-nowrap">
                        {item.putPriceEnd !== null ? `₹${item.putPriceEnd.toFixed(2)}` : '—'}
                      </td>

                      {/* 7. ATM Put OI % Change during the interval */}
                      <td
                        className={`py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                          oiPos
                            ? 'text-emerald-700'
                            : oiNeg
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {item.atmPutOiChangePercent !== null
                          ? `${item.atmPutOiChangePercent >= 0 ? '+' : ''}${item.atmPutOiChangePercent.toFixed(2)}%`
                          : '—'}
                      </td>

                      {/* 8. Option Buildup */}
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            oiPos
                              ? 'text-emerald-700'
                              : oiNeg
                                ? 'text-amber-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {item.statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
