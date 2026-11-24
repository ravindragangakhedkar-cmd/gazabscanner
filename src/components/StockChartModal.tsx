import { useState } from 'react';
import { X } from 'lucide-react';
import type { AlertChartSnapshot, AnalyzedStock, ChartSeriesPoint } from '../../shared/types';

export function StockTechnicalChart({
  stock,
  mode = 'scanner1',
  compact = false,
}: {
  stock: AnalyzedStock | AlertChartSnapshot;
  mode?: 'scanner1' | 'scanner2' | 'scanner4';
  compact?: boolean;
}) {
  const series = stock.chartSeries;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (series.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 bg-slate-950 rounded-xl">
        Chart bars unavailable.
      </div>
    );
  }

  const width = 920;
  const height = compact ? 310 : 420;
  const padLeft = 18;
  const padRight = 76;
  const padTop = 20;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const superPivots = 'superPivots' in stock ? stock.superPivots : undefined;

  const allValues: number[] = [];
  for (const pt of series) {
    allValues.push(pt.high, pt.low, pt.ema10, pt.ema20);
    if (mode === 'scanner1' || mode === 'scanner2') {
      allValues.push(pt.mbUpper, pt.mbLower, pt.twinFilter);
    }
  }
  if (mode === 'scanner1') {
    allValues.push(stock.entryPrice, stock.targetPrice, stock.stopLoss);
  } else if (mode === 'scanner2') {
    allValues.push(stock.weeklyPivots.r1, stock.weeklyPivots.s1);
  } else if (mode === 'scanner4' && superPivots) {
    allValues.push(superPivots.daily.pp, superPivots.weekly.pp, superPivots.monthly.pp);
  }

  const minPrice = Math.min(...allValues) * 0.992;
  const maxPrice = Math.max(...allValues) * 1.008;
  const priceSpan = Math.max(maxPrice - minPrice, 0.01);

  const yForPrice = (p: number) => padTop + ((maxPrice - p) / priceSpan) * plotH;
  const stepX = plotW / Math.max(series.length, 1);
  const candleW = Math.max(3, Math.min(9, stepX * 0.62));

  // Build Market Bias ribbon polygon
  const mbTopPts = series
    .map((pt, i) => `${(padLeft + i * stepX + stepX / 2).toFixed(1)},${yForPrice(pt.mbUpper).toFixed(1)}`)
    .join(' ');
  const mbBottomPts = [...series]
    .reverse()
    .map((pt, revIdx) => {
      const i = series.length - 1 - revIdx;
      return `${(padLeft + i * stepX + stepX / 2).toFixed(1)},${yForPrice(pt.mbLower).toFixed(1)}`;
    })
    .join(' ');

  const twinPath = series
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${(padLeft + i * stepX + stepX / 2).toFixed(1)} ${yForPrice(pt.twinFilter).toFixed(1)}`,
    )
    .join(' ');

  const ema10Path = series
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${(padLeft + i * stepX + stepX / 2).toFixed(1)} ${yForPrice(pt.ema10).toFixed(1)}`,
    )
    .join(' ');

  const ema20Path = series
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${(padLeft + i * stepX + stepX / 2).toFixed(1)} ${yForPrice(pt.ema20).toFixed(1)}`,
    )
    .join(' ');

  const activePoint: ChartSeriesPoint =
    hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : series[series.length - 1];

  const yTicks = 5;
  const gridLevels = Array.from({ length: yTicks }, (_, idx) => {
    const ratio = idx / (yTicks - 1);
    const val = maxPrice - ratio * priceSpan;
    return { val, y: yForPrice(val) };
  });

  const latestBiasBullish = stock.marketBiasDirection === 'Bullish';
  const unit = stock.isIndex ? '' : '₹';

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 text-slate-200">
      {/* Chart Readout Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
          <span className="font-display font-bold text-sm text-white">
            {stock.isIndex ? stock.symbol : `${stock.symbol}.NS`}
          </span>
          <span className="text-slate-400">{activePoint.date}</span>
          <span>O {activePoint.open.toFixed(2)}</span>
          <span>H {activePoint.high.toFixed(2)}</span>
          <span>L {activePoint.low.toFixed(2)}</span>
          <span className="text-white font-semibold">C {activePoint.close.toFixed(2)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
          {mode === 'scanner4' && superPivots ? (
            <>
              <span className="text-emerald-400">
                Daily PP: {unit}
                {superPivots.daily.pp.toFixed(2)}
              </span>
              <span className="text-amber-300">
                Weekly PP: {unit}
                {superPivots.weekly.pp.toFixed(2)}
              </span>
              <span className="text-sky-400">
                Monthly PP: {unit}
                {superPivots.monthly.pp.toFixed(2)}
              </span>
            </>
          ) : (
            <>
              <span className={latestBiasBullish ? 'text-emerald-400' : 'text-rose-400'}>
                Market Bias Zone: {unit}
                {activePoint.mbLower.toFixed(1)}–{unit}
                {activePoint.mbUpper.toFixed(1)}
              </span>
              {mode === 'scanner1' && (
                <span className="text-sky-400">
                  Twin Range: {unit}
                  {activePoint.twinFilter.toFixed(1)}
                </span>
              )}
            </>
          )}
          <span className="text-amber-400">
            Daily EMA(10): {unit}
            {activePoint.ema10.toFixed(1)}
          </span>
          <span className="text-fuchsia-400">
            Daily EMA(20): {unit}
            {activePoint.ema20.toFixed(1)}
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Horizontal grid & Y axis price ticks */}
          {gridLevels.map((g, idx) => (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={g.y}
                x2={width - padRight}
                y2={g.y}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <text
                x={width - padRight + 8}
                y={g.y + 4}
                fill="#94a3b8"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {unit}
                {g.val.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Market Bias Support / Resistance Shaded Zone */}
          {mode !== 'scanner4' && (
            <polygon
              points={`${mbTopPts} ${mbBottomPts}`}
              fill={latestBiasBullish ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)'}
              stroke={latestBiasBullish ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)'}
              strokeWidth="1"
            />
          )}

          {/* Scanner 1 Target / Entry / SL Lines */}
          {mode === 'scanner1' && (
            <g>
              <line
                x1={padLeft}
                y1={yForPrice(stock.targetPrice)}
                x2={width - padRight}
                y2={yForPrice(stock.targetPrice)}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
              <text
                x={padLeft + 6}
                y={yForPrice(stock.targetPrice) - 5}
                fill="#34d399"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                TARGET {unit}
                {stock.targetPrice.toFixed(2)}
              </text>

              <line
                x1={padLeft}
                y1={yForPrice(stock.entryPrice)}
                x2={width - padRight}
                y2={yForPrice(stock.entryPrice)}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
              <text
                x={padLeft + 6}
                y={yForPrice(stock.entryPrice) - 5}
                fill="#fbbf24"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                ENTRY {unit}
                {stock.entryPrice.toFixed(2)}
              </text>

              <line
                x1={padLeft}
                y1={yForPrice(stock.stopLoss)}
                x2={width - padRight}
                y2={yForPrice(stock.stopLoss)}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
              <text
                x={padLeft + 6}
                y={yForPrice(stock.stopLoss) + 12}
                fill="#fb7185"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                STOP LOSS {unit}
                {stock.stopLoss.toFixed(2)}
              </text>
            </g>
          )}

          {/* Scanner 2 Weekly Pivot Lines */}
          {mode === 'scanner2' && (
            <g>
              {[
                { label: 'R1', val: stock.weeklyPivots.r1, color: '#34d399' },
                { label: 'PP', val: stock.weeklyPivots.pp, color: '#fbbf24' },
                { label: 'S1', val: stock.weeklyPivots.s1, color: '#fb7185' },
              ].map((lvl) => (
                <g key={lvl.label}>
                  <line
                    x1={padLeft}
                    y1={yForPrice(lvl.val)}
                    x2={width - padRight}
                    y2={yForPrice(lvl.val)}
                    stroke={lvl.color}
                    strokeDasharray="4 4"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                  <text
                    x={padLeft + 6}
                    y={yForPrice(lvl.val) - 4}
                    fill={lvl.color}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Weekly {lvl.label} {unit}
                    {lvl.val.toFixed(2)}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Scanner 4 Super Pivots Lines (Daily PP, Weekly PP, Monthly PP) */}
          {mode === 'scanner4' && superPivots && (
            <g>
              {[
                { label: 'Daily PP', val: superPivots.daily.pp, color: '#34d399' },
                { label: 'Weekly PP', val: superPivots.weekly.pp, color: '#fbbf24' },
                { label: 'Monthly PP', val: superPivots.monthly.pp, color: '#38bdf8' },
              ].map((lvl) => (
                <g key={lvl.label}>
                  <line
                    x1={padLeft}
                    y1={yForPrice(lvl.val)}
                    x2={width - padRight}
                    y2={yForPrice(lvl.val)}
                    stroke={lvl.color}
                    strokeDasharray="4 4"
                    strokeWidth="1.4"
                    opacity="0.85"
                  />
                  <text
                    x={padLeft + 6}
                    y={yForPrice(lvl.val) - 4}
                    fill={lvl.color}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {lvl.label} {unit}
                    {lvl.val.toFixed(2)}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Candles + Twin Range Signal Triangles */}
          {series.map((pt, i) => {
            const cx = padLeft + i * stepX + stepX / 2;
            const isGreen = pt.close >= pt.open;
            const candleColor = isGreen ? '#10b981' : '#f43f5e';
            const bodyTop = yForPrice(Math.max(pt.open, pt.close));
            const bodyBottom = yForPrice(Math.min(pt.open, pt.close));
            const bodyH = Math.max(2, bodyBottom - bodyTop);

            return (
              <g
                key={pt.date}
                onMouseEnter={() => setHoverIdx(i)}
                className="cursor-crosshair"
              >
                <rect
                  x={padLeft + i * stepX}
                  y={padTop}
                  width={stepX}
                  height={plotH}
                  fill="transparent"
                />
                <line
                  x1={cx}
                  y1={yForPrice(pt.high)}
                  x2={cx}
                  y2={yForPrice(pt.low)}
                  stroke={candleColor}
                  strokeWidth="1.2"
                />
                <rect
                  x={cx - candleW / 2}
                  y={bodyTop}
                  width={candleW}
                  height={bodyH}
                  fill={candleColor}
                  rx="1"
                />
                {pt.twinSignal === 'BUY' && (
                  <polygon
                    points={`${cx},${yForPrice(pt.low) + 6} ${cx - 5},${yForPrice(pt.low) + 15} ${cx + 5},${yForPrice(pt.low) + 15}`}
                    fill="#10b981"
                  />
                )}
                {pt.twinSignal === 'SELL' && (
                  <polygon
                    points={`${cx},${yForPrice(pt.high) - 6} ${cx - 5},${yForPrice(pt.high) - 15} ${cx + 5},${yForPrice(pt.high) - 15}`}
                    fill="#f43f5e"
                  />
                )}
              </g>
            );
          })}

          {/* Twin Range Filter Line (Scanner 1 & 3) + Daily EMA(10) & Daily EMA(20) on all charts */}
          {mode === 'scanner1' && (
            <path d={twinPath} fill="none" stroke="#38bdf8" strokeWidth="1.8" />
          )}
          <path d={ema10Path} fill="none" stroke="#f59e0b" strokeWidth="1.7" />
          <path d={ema20Path} fill="none" stroke="#e879f9" strokeWidth="1.7" />

          {/* Hover vertical guide */}
          {hoverIdx !== null && (
            <line
              x1={padLeft + hoverIdx * stepX + stepX / 2}
              y1={padTop}
              x2={padLeft + hoverIdx * stepX + stepX / 2}
              y2={height - padBottom}
              stroke="#475569"
              strokeDasharray="2 2"
            />
          )}

          {/* X-axis sparse date ticks */}
          {[0, Math.floor(series.length / 2), series.length - 1].map((idx) => {
            const pt = series[idx];
            if (!pt) return null;
            return (
              <text
                key={pt.date}
                x={padLeft + idx * stepX + stepX / 2}
                y={height - 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {pt.date}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function StockChartModal({
  stock,
  mode,
  onClose,
}: {
  stock: AnalyzedStock;
  mode: 'scanner1' | 'scanner2' | 'scanner4';
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-5xl w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">
              {stock.symbol} · {stock.companyName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'scanner4'
                ? `Super Pivots · ${stock.superPivots.trend} · Daily, Weekly & Monthly PP · Daily EMA(10) & EMA(20)`
                : mode === 'scanner2'
                  ? 'Daily Timeframe · Daily EMA(10) & EMA(20) · Weekly Pivots'
                  : 'Daily Timeframe · Market Bias · Twin Range · Daily EMA(10) & EMA(20)'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            aria-label="Close chart modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 bg-slate-50">
          <StockTechnicalChart stock={stock} mode={mode} />
        </div>
      </div>
    </div>
  );
}
