import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { MarketClockStatus, TickerItem } from '../../shared/types';

function formatInrNumber(val: number): string {
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: val >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function MarketTicker({
  onClockUpdate,
}: {
  onClockUpdate?: (clock: MarketClockStatus) => void;
}) {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [clock, setClock] = useState<MarketClockStatus | null>(null);

  useEffect(() => {
    let active = true;

    const loadTicker = async () => {
      try {
        const res = await fetch('/api/market/ticker');
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: TickerItem[];
          clock: MarketClockStatus;
        };
        if (!active) return;
        if (Array.isArray(data.items) && data.items.length > 0) {
          setItems(data.items);
        }
        if (data.clock) {
          setClock(data.clock);
          onClockUpdate?.(data.clock);
        }
      } catch {
        // Silent retry on next poll
      }
    };

    void loadTicker();
    const timer = setInterval(() => {
      void loadTicker();
    }, 60000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [onClockUpdate]);

  const renderGroup = (prefix: string) =>
    items.map((item) => {
      const isUp = item.change >= 0;
      return (
        <div
          key={`${prefix}-${item.id}`}
          className="inline-flex items-center gap-2.5 px-5 border-r border-slate-800 whitespace-nowrap shrink-0"
        >
          <span className="text-xs font-medium text-slate-300">{item.label}</span>
          <span className="font-mono text-xs font-semibold text-white tabular-nums">
            {item.unitPrefix}
            {formatInrNumber(item.price)}
            {item.unitSuffix ?? ''}
          </span>
          <span
            className={`inline-flex items-center gap-1 font-mono text-xs font-medium tabular-nums ${
              isUp ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isUp ? (
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-3 h-3" aria-hidden="true" />
            )}
            {isUp ? '+' : ''}
            {formatInrNumber(item.change)} ({isUp ? '+' : ''}
            {item.changePercent.toFixed(2)}%)
          </span>
        </div>
      );
    });

  return (
    <div className="bg-slate-950 text-white border-b border-slate-800 h-10 flex items-center overflow-hidden">
      <div className="flex-1 overflow-hidden relative">
        {items.length > 0 ? (
          <div className="ticker-track items-center">
            <div className="flex items-center">{renderGroup('a')}</div>
            <div className="flex items-center" aria-hidden="true">
              {renderGroup('b')}
            </div>
          </div>
        ) : (
          <div className="px-6 text-xs text-slate-400">
            Loading live Nifty, Bank Nifty, Crude Oil, Gold, Silver &amp; India VIX quotes...
          </div>
        )}
      </div>

      {clock && (
        <div className="hidden md:flex items-center px-4 h-full bg-slate-900 border-l border-slate-800 text-xs font-mono text-slate-300 whitespace-nowrap shrink-0">
          {clock.isOpen ? 'NSE LIVE · LTP' : 'OFF-MARKET · LAST CLOSE'} · {clock.istTimeLabel}
        </div>
      )}
    </div>
  );
}
