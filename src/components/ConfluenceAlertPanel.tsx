import { useCallback, useEffect, useState } from 'react';
import { BellRing, ChevronDown, ChevronUp, Mail, Smartphone } from 'lucide-react';
import type { ConfluenceAlertRecord, MarketClockStatus } from '../../shared/types';
import { getJsonSafely } from '../lib/safeFetchJson';
import { StockTechnicalChart } from './StockChartModal';

interface AlertChannelConfig {
  smsTarget: string;
  emailTarget: string;
  subject: string;
  emailConfigured: boolean;
  smsConfigured: boolean;
}

export function ConfluenceAlertPanel({
  scanner,
  matchedCount,
  isMarketOpen,
}: {
  scanner: 'scanner1' | 'scanner3';
  matchedCount: number;
  isMarketOpen?: boolean;
}) {
  const [alerts, setAlerts] = useState<ConfluenceAlertRecord[]>([]);
  const [config, setConfig] = useState<AlertChannelConfig | null>(null);
  const [clockOpen, setClockOpen] = useState<boolean>(Boolean(isMarketOpen));
  const [expanded, setExpanded] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await getJsonSafely<{
        alerts: ConfluenceAlertRecord[];
        config: AlertChannelConfig;
        clock?: MarketClockStatus;
      }>(`/api/alerts/history?scanner=${scanner}`);
      setAlerts(data.alerts ?? []);
      setConfig(data.config ?? null);
      if (data.clock) {
        setClockOpen(data.clock.isOpen);
      }
    } catch {
      // Non-blocking live feed status
    }
  }, [scanner]);

  useEffect(() => {
    if (typeof isMarketOpen === 'boolean') {
      setClockOpen(isMarketOpen);
    }
  }, [isMarketOpen]);

  useEffect(() => {
    void loadAlerts();
    const es = new EventSource('/api/alerts/stream');

    const handleAlert = (evt: MessageEvent) => {
      try {
        const record = JSON.parse(evt.data) as ConfluenceAlertRecord;
        if (record.scanner !== scanner) return;
        setAlerts((prev) => {
          const idx = prev.findIndex((a) => a.id === record.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = record;
            return next;
          }
          return [record, ...prev].slice(0, 50);
        });
      } catch {
        // Ignore malformed SSE chunk
      }
    };

    es.addEventListener('confluence-alert', handleAlert as EventListener);
    return () => {
      es.removeEventListener('confluence-alert', handleAlert as EventListener);
      es.close();
    };
  }, [scanner, loadAlerts]);

  return (
    <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
            <BellRing className={`w-4 h-4 ${clockOpen ? 'text-emerald-700' : 'text-slate-400'}`} />
            Intraday 1-Hour Confluence Alerts
          </span>
          <span
            className={`font-mono text-[11px] font-semibold ${
              clockOpen ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {clockOpen
              ? 'Active (Live Intraday 1h)'
              : 'Intraday Only · Paused Outside 09:15–15:30 IST'}
          </span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600 font-mono">
            <Smartphone className="w-3.5 h-3.5 text-slate-500" />
            {config?.smsTarget ?? '+91 - XXXXXXXXXX'}
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600 font-mono">
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            {config?.emailTarget ?? 'YOUR_SUPPORT_EMAIL@example.com'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-600 tabular-nums">
            Live 1h Matches: <strong className="text-slate-950">{matchedCount}</strong> · Dispatched:{' '}
            <strong className="text-emerald-700">{alerts.length}</strong>
          </span>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            {expanded ? 'Hide Alert Log' : 'View Alert Log'}
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <p className="text-xs text-slate-600">
            Operates strictly during intraday market hours (09:15–15:30 IST) on every 1-hour
            candle. Triggers <strong className="text-slate-900">once per stock or index</strong> on
            its first fresh 1-hour entry into the Daily Market Bias CEREBR zone (re-entries do not
            trigger alerts) alongside fresh 1-hour Twin Range Long/Short, 1-hour BBWP Early or
            Sustained Expansion (Upward Slope), and positive 1-hour PVO.
          </p>

          {alerts.length === 0 ? (
            <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
              {clockOpen
                ? `No symbols in ${scanner === 'scanner3' ? 'Scanner 3 Index Basket' : 'Scanner 1'} have matched all 4 intraday 1-hour confluence conditions yet. Live 1h candle monitoring continues.`
                : 'Intraday alert monitoring is currently paused outside market hours (09:15–15:30 IST). Alerts resume automatically when the market opens.'}
            </div>
          ) : (
            <div className="space-y-3 max-h-[32rem] overflow-y-auto">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-4 bg-white border border-slate-200 rounded-lg text-xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="font-display font-bold text-slate-950 text-sm">
                      {alert.subject}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {alert.matchedAtIst}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-xs">
                    {alert.body}
                  </pre>
                  {alert.chartSnapshot && alert.chartSnapshot.chartSeries.length > 0 ? (
                    <div className="pt-1">
                      <StockTechnicalChart stock={alert.chartSnapshot} mode="scanner1" compact />
                    </div>
                  ) : (
                    <img
                      src={alert.chartUrl}
                      alt={`${alert.symbol} Chart`}
                      className="w-full max-w-2xl rounded-lg border border-slate-200"
                    />
                  )}
                  <div className="pt-1 flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-500">
                    <span>
                      SMS ({alert.smsTarget}):{' '}
                      <strong
                        className={
                          alert.smsDelivery.status === 'sent'
                            ? 'text-emerald-700'
                            : alert.smsDelivery.status === 'failed'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                        }
                      >
                        {alert.smsDelivery.detail}
                      </strong>
                    </span>
                    <span>
                      Email ({alert.emailTarget}):{' '}
                      <strong
                        className={
                          alert.emailDelivery.status === 'sent'
                            ? 'text-emerald-700'
                            : alert.emailDelivery.status === 'failed'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                        }
                      >
                        {alert.emailDelivery.detail}
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
