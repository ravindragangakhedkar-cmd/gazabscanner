import { X } from 'lucide-react';
import type { AnalyzedStock } from '../../shared/types';

export function WeeklyPivotAnalysisModal({
  stock,
  onClose,
}: {
  stock: AnalyzedStock;
  onClose: () => void;
}) {
  const unit = stock.isIndex ? '' : '₹';
  const unitSuffix = stock.isIndex ? ' pts' : '';
  const wp = stock.weeklyPivots;
  const spotPrice = stock.intraday1h?.spotPrice1h ?? stock.currentPrice;
  const span = Math.max(wp.r2 - wp.s2, 0.01);

  const pctFor = (price: number) =>
    Math.min(100, Math.max(0, Math.round(((price - wp.s2) / span) * 1000) / 10));

  const spotPct = pctFor(spotPrice);

  const levels = [
    { key: 'S2', label: 'Weekly S2', val: wp.s2, pct: pctFor(wp.s2), cls: 'text-rose-400' },
    { key: 'S1', label: 'Weekly S1', val: wp.s1, pct: pctFor(wp.s1), cls: 'text-rose-300' },
    { key: 'PP', label: 'Weekly PP', val: wp.pp, pct: pctFor(wp.pp), cls: 'text-amber-300' },
    { key: 'R1', label: 'Weekly R1', val: wp.r1, pct: pctFor(wp.r1), cls: 'text-emerald-300' },
    { key: 'R2', label: 'Weekly R2', val: wp.r2, pct: pctFor(wp.r2), cls: 'text-emerald-400' },
  ];

  const zoneBadgeColor =
    spotPrice >= wp.pp
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : 'bg-rose-50 border-rose-200 text-rose-900';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-950">
              Weekly Pivot Analysis · {stock.symbol} ({stock.companyName})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              Current {stock.isIndex ? 'Index ' : ''}Spot Price ({stock.priceBasis}): {unit}
              {spotPrice.toFixed(2)}
              {unitSuffix}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            aria-label="Close analysis modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Current Spot Position Summary */}
          <div className={`p-4 rounded-xl border ${zoneBadgeColor}`}>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Current Spot Price Position on Weekly Scale
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-lg font-bold">{wp.priceZoneLabel}</span>
              <span className="font-mono text-xs font-semibold tabular-nums">
                {spotPct.toFixed(1)}% on S2–R2 Scale ({unit}
                {spotPrice.toFixed(2)}
                {unitSuffix})
              </span>
            </div>
          </div>

          {/* Visual Proportional Scale: S2 — S1 — PP — R1 — R2 */}
          <div className="p-5 rounded-xl bg-slate-950 text-white border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mb-4">
              <span>Weekly Pivot Scale (S2 to R2)</span>
              <span className="font-mono text-sky-400 font-semibold tabular-nums">
                Spot: {unit}
                {spotPrice.toFixed(2)}
                {unitSuffix}
              </span>
            </div>

            <div className="relative pt-7 pb-8 px-2">
              {/* Track */}
              <div className="relative h-3 bg-slate-800 rounded-full">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 rounded-full opacity-80"
                  style={{ width: `${spotPct}%` }}
                />

                {/* Pivot Level Ticks */}
                {levels.map((lvl) => (
                  <div
                    key={lvl.key}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                    style={{ left: `${lvl.pct}%` }}
                  >
                    <div className="w-0.5 h-5 bg-slate-400/70 mx-auto" />
                    <div
                      className={`mt-1.5 text-[10px] font-mono font-bold text-center whitespace-nowrap ${lvl.cls}`}
                    >
                      {lvl.key}
                    </div>
                  </div>
                ))}

                {/* Current Spot Price Marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                  style={{ left: `${spotPct}%` }}
                >
                  <div className=" -top-7 left-1/2 -translate-x-1/2 absolute px-1.5 py-0.5 rounded bg-sky-500 text-slate-950 font-mono text-[10px] font-bold whitespace-nowrap shadow">
                    {unit}
                    {spotPrice.toFixed(2)}
                  </div>
                  <div className="w-4 h-4 rounded-full bg-white border-2 border-sky-400 shadow-lg" />
                </div>
              </div>
            </div>

            {/* Exact 5 Levels Readout: S2, S1, PP, R1, R2 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center font-mono tabular-nums pt-2">
              {levels.map((lvl) => {
                const diff = spotPrice - lvl.val;
                return (
                  <div
                    key={lvl.key}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    <div className={`text-[11px] font-bold ${lvl.cls}`}>{lvl.label}</div>
                    <div className="text-xs font-semibold text-white mt-1">
                      {unit}
                      {lvl.val.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prior Completed Week Reference */}
          <div className="grid grid-cols-3 gap-3 text-center bg-slate-50 border border-slate-200 rounded-xl p-3.5 font-mono text-xs tabular-nums">
            <div>
              <div className="text-slate-500">Prev Week High</div>
              <div className="font-semibold text-slate-950 mt-0.5">
                {unit}
                {wp.weekHigh.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Prev Week Low</div>
              <div className="font-semibold text-slate-950 mt-0.5">
                {unit}
                {wp.weekLow.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Prev Week Close</div>
              <div className="font-semibold text-slate-950 mt-0.5">
                {unit}
                {wp.weekClose.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
