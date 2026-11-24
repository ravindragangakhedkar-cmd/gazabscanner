import { X } from 'lucide-react';
import type { AnalyzedStock } from '../../shared/types';
import type {
  Scanner1GeminiAnalysis,
  Scanner2GeminiPivotAnalysis,
} from '../../server/geminiService';

function isScanner1Payload(
  res: Scanner1GeminiAnalysis | Scanner2GeminiPivotAnalysis,
): res is Scanner1GeminiAnalysis {
  return 'marketBiasInsight' in res;
}

export function AskGeminiModal({
  stock,
  loading,
  error,
  result,
  onClose,
}: {
  stock: AnalyzedStock;
  loading: boolean;
  error: string | null;
  result: Scanner1GeminiAnalysis | Scanner2GeminiPivotAnalysis | null;
  onClose: () => void;
}) {
  const unit = stock.isIndex ? '' : '₹';

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
              ASK Gemini · {stock.symbol} Weekly Pivot Scale
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Active {stock.isIndex ? 'Spot ' : ''}Price ({stock.priceBasis}): {unit}
              {stock.currentPrice.toFixed(2)} · {stock.weeklyPivots.priceZoneLabel} (
              {stock.weeklyPivots.scalePercent.toFixed(1)}% on S2–R2 scale)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            aria-label="Close ASK Gemini modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Visual Weekly Pivot Scale: S2 — S1 — PP — R1 — R2 */}
          <div className="p-5 rounded-xl bg-slate-950 text-white border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mb-3">
              <span>Weekly Pivot Scale (S2 — S1 — PP — R1 — R2)</span>
              <span className="font-mono text-emerald-400 font-semibold tabular-nums">
                Current Price: {unit}
                {stock.currentPrice.toFixed(2)} ({stock.weeklyPivots.priceZoneLabel})
              </span>
            </div>

            {/* Scale Progress & Price Marker */}
            <div className="relative h-3 bg-slate-800 rounded-full overflow-visible my-4">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 rounded-full opacity-75"
                style={{ width: `${stock.weeklyPivots.scalePercent}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-slate-950 shadow"
                style={{ left: `${stock.weeklyPivots.scalePercent}%` }}
                title={`Current Price ${unit}${stock.currentPrice.toFixed(2)} (${stock.weeklyPivots.scalePercent.toFixed(1)}%)`}
              />
            </div>

            <div className="grid grid-cols-5 gap-2 text-center font-mono tabular-nums pt-2">
              {[
                { label: 'S2', val: stock.weeklyPivots.s2, cls: 'text-rose-400' },
                { label: 'S1', val: stock.weeklyPivots.s1, cls: 'text-rose-300' },
                { label: 'PP', val: stock.weeklyPivots.pp, cls: 'text-amber-300' },
                { label: 'R1', val: stock.weeklyPivots.r1, cls: 'text-emerald-300' },
                { label: 'R2', val: stock.weeklyPivots.r2, cls: 'text-emerald-400' },
              ].map((lvl) => (
                <div key={lvl.label} className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className={`text-[11px] font-bold ${lvl.cls}`}>{lvl.label}</div>
                  <div className="text-xs font-semibold text-white mt-0.5">
                    {unit}
                    {lvl.val.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {loading && (
            <div className="py-8 text-center text-sm text-slate-500">
              Generating Gemini Weekly Pivot scale placement and Bullish / Bearish / Sideways
              interpretation for {stock.symbol}...
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3.5 text-sm">
              {/* Explicit Bullish / Bearish / Sideways AI Interpretation */}
              <div
                className={`p-4 rounded-lg border ${
                  result.trendBias === 'Bullish'
                    ? 'bg-emerald-50 border-emerald-200'
                    : result.trendBias === 'Bearish'
                      ? 'bg-rose-50 border-rose-200'
                      : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    AI Trend Interpretation
                  </span>
                  <span
                    className={`font-display text-sm font-extrabold ${
                      result.trendBias === 'Bullish'
                        ? 'text-emerald-800'
                        : result.trendBias === 'Bearish'
                          ? 'text-rose-800'
                          : 'text-amber-800'
                    }`}
                  >
                    {result.trendBias}
                  </span>
                </div>
                <p className="mt-1.5 text-slate-800 leading-relaxed">
                  {result.trendInterpretation}
                </p>
              </div>

              {/* Price Position on Weekly Pivot Scale */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-700">
                  Price Position on Weekly Pivot Scale
                </div>
                <p className="mt-1 text-slate-900 font-medium">{result.headline}</p>
                <p className="mt-1.5 text-slate-600 leading-relaxed">
                  {result.scalePositionSummary}
                </p>
              </div>

              {isScanner1Payload(result) ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700">
                        Market Bias, Twin Range &amp; BBWP ({stock.bbwpStatus})
                      </div>
                      <p className="mt-1.5 text-slate-600 leading-relaxed">
                        {result.marketBiasInsight}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700">
                        Entry, Target &amp; Stop Loss Plan
                      </div>
                      <p className="mt-1.5 text-slate-600 leading-relaxed">
                        {result.entryExitPlan}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200">
                    <div className="text-xs font-semibold text-amber-900">
                      Risk &amp; Invalidation
                    </div>
                    <p className="mt-1 text-amber-950 leading-relaxed">
                      {result.riskAndInvalidation}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700">Pivot Strategy</div>
                      <p className="mt-1.5 text-slate-600 leading-relaxed">
                        {result.pivotStrategy}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700">
                        EMA, BBWP ({stock.bbwpStatus}) &amp; PVO Read
                      </div>
                      <p className="mt-1.5 text-slate-600 leading-relaxed">
                        {result.emaAndVolatilityRead}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200">
                    <div className="text-xs font-semibold text-emerald-900">Key Levels to Watch</div>
                    <p className="mt-1 text-emerald-950 leading-relaxed">
                      {result.keyLevelsToWatch}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
