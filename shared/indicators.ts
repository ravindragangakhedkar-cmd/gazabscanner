import type {
  AnalyzedStock,
  BbwpStatus,
  ChartSeriesPoint,
  Intraday1hConfluenceSnapshot,
  MarketBiasSetup,
  MarketClockStatus,
  OhlcvBar,
  PivotLevelSet,
  SuperPivotData,
  SuperPivotTrend,
  TwinRangeSignal,
  WeeklyPivots,
} from './types.ts';
import type { StockUniverseEntry } from './nifty500Universe.ts';

export function getNSEMarketClockStatus(now: Date = new Date()): MarketClockStatus {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  const isWeekday = !['Sat', 'Sun'].includes(weekday);
  const minutesOfDay = hour * 60 + minute;
  const marketOpenMinutes = 9 * 60 + 15; // 09:15 IST
  const marketCloseMinutes = 15 * 60 + 30; // 15:30 IST
  const isOpen = isWeekday && minutesOfDay >= marketOpenMinutes && minutesOfDay <= marketCloseMinutes;

  const paddedHour = String(hour).padStart(2, '0');
  const paddedMinute = String(minute).padStart(2, '0');

  return {
    isOpen,
    priceBasis: isOpen ? 'LTP' : 'LAST_CLOSE',
    istTimeLabel: `${weekday} ${paddedHour}:${paddedMinute} IST`,
    sessionLabel: isOpen
      ? 'Market Open · Using Live LTP'
      : 'Market Closed · Using Last Closing Price',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function computeSMA(values: number[], period: number): number[] {
  const out: number[] = [];
  let runningSum = 0;
  for (let i = 0; i < values.length; i++) {
    runningSum += values[i];
    if (i >= period) {
      runningSum -= values[i - period];
      out.push(runningSum / period);
    } else {
      out.push(runningSum / (i + 1));
    }
  }
  return out;
}

/**
 * BBWP Indicator:
 * - Basis SMA(20), Standard Deviation = 2
 * - Lookback Period = 100 days
 * - Smoothed with SMA(7)
 */
export function computeBBWPSeries(closes: number[]): number[] {
  const bbLen = 20;
  const stdMult = 2;
  const lookback = 100;
  const smaSmooth = 7;

  const bbw: number[] = closes.map((_, idx) => {
    const start = Math.max(0, idx - bbLen + 1);
    const slice = closes.slice(start, idx + 1);
    const mean = slice.reduce((acc, v) => acc + v, 0) / slice.length;
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    return mean > 0 ? (2 * stdMult * sd) / mean : 0;
  });

  const rawPercentile: number[] = bbw.map((val, idx) => {
    const start = Math.max(0, idx - lookback);
    const window = bbw.slice(start, idx);
    if (window.length === 0) return 50;
    let belowOrEqual = 0;
    for (let j = 0; j < window.length; j++) {
      if (window[j] <= val) belowOrEqual++;
    }
    return (belowOrEqual / window.length) * 100;
  });

  return computeSMA(rawPercentile, smaSmooth).map((v) =>
    Math.min(100, Math.max(0, round2(v))),
  );
}

export function classifyBBWPStatus(
  bbwpSeries: number[],
  bbwpSma9Series: number[],
  idx: number,
): {
  bbwpSma9: number;
  bbwpSlope: 'Upward' | 'Downward' | 'Flat';
  bbwpStatus: BbwpStatus;
} {
  const curr = bbwpSeries[idx] ?? 0;
  const prev = bbwpSeries[Math.max(0, idx - 1)] ?? curr;
  const prev2 = bbwpSeries[Math.max(0, idx - 2)] ?? prev;
  const sma9Curr = round2(bbwpSma9Series[idx] ?? curr);
  const sma9Prev = round2(bbwpSma9Series[Math.max(0, idx - 1)] ?? sma9Curr);

  const delta = round2(curr - prev);
  const multiDelta = round2(curr - prev2);
  let bbwpSlope: 'Upward' | 'Downward' | 'Flat' = 'Flat';
  if (delta > 0.05 || (delta >= 0 && multiDelta > 0.15)) {
    bbwpSlope = 'Upward';
  } else if (delta < -0.05 || (delta <= 0 && multiDelta < -0.15)) {
    bbwpSlope = 'Downward';
  }

  const crossedOverOrAboveSma9 =
    curr >= sma9Curr || (prev <= sma9Prev && curr > sma9Curr);

  let bbwpStatus: BbwpStatus;
  if (curr >= 85 && curr <= 100 && bbwpSlope === 'Downward') {
    bbwpStatus = 'Fading Expansion';
  } else if (curr >= 20 && curr <= 70 && crossedOverOrAboveSma9 && bbwpSlope === 'Upward') {
    bbwpStatus = 'Sustained Expansion';
  } else if (curr >= 0 && curr <= 20 && curr < sma9Curr) {
    bbwpStatus = 'Early Expansion';
  } else if (curr >= 85) {
    bbwpStatus = 'Extreme Expansion';
  } else if (curr > 70) {
    bbwpStatus = bbwpSlope === 'Downward' ? 'Volatility Cooling' : 'Extreme Expansion';
  } else if (curr > 20) {
    bbwpStatus = 'Volatility Cooling';
  } else {
    bbwpStatus = 'Compression';
  }

  return { bbwpSma9: sma9Curr, bbwpSlope, bbwpStatus };
}

/**
 * Price Volume Oscillator (12, 9, 6):
 * Fast EMA(6) vs Slow EMA(12) on Price*Volume, Signal EMA(9)
 */
export function computePVOSeries(bars: OhlcvBar[]): {
  pvo: number[];
  signal: number[];
} {
  const pv = bars.map((b) => Math.max(1, b.close * Math.max(1, b.volume)));
  const emaFast = computeEMA(pv, 6);
  const emaSlow = computeEMA(pv, 12);
  const pvo = pv.map((_, i) => {
    const slow = emaSlow[i];
    if (!slow || slow === 0) return 0;
    return ((emaFast[i] - slow) / slow) * 100;
  });
  const signal = computeEMA(pvo, 9);
  return { pvo, signal };
}

/**
 * Market Bias (CEREBR by Professor X):
 * Period = 100, Smoothing = 50, Oscillator Period = 7, Show HA Candles = Disabled
 */
export function computeMarketBias(bars: OhlcvBar[]) {
  const period = 100;
  const smoothing = 50;
  const oscPeriod = 7;

  const opens = bars.map((b) => b.open);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);

  const mbOpen = computeEMA(computeEMA(opens, period), smoothing);
  const mbHigh = computeEMA(computeEMA(highs, period), smoothing);
  const mbLow = computeEMA(computeEMA(lows, period), smoothing);
  const mbClose = computeEMA(computeEMA(closes, period), smoothing);

  const rawOsc = closes.map((_, i) => {
    const span = Math.max(mbHigh[i] - mbLow[i], 0.0001);
    return (100 * (mbClose[i] - mbOpen[i])) / span;
  });
  const osc = computeEMA(rawOsc, oscPeriod);

  return { mbOpen, mbHigh, mbLow, mbClose, osc };
}

/**
 * Twin Range Filter (by Coltin):
 * Fast Period = 27, Fast Range = 1.6
 * Slow Period = 55, Slow Range = 2.0
 */
function computeSmoothRange(values: number[], period: number, multiplier: number): number[] {
  const absDiff: number[] = [0];
  for (let i = 1; i < values.length; i++) {
    absDiff.push(Math.abs(values[i] - values[i - 1]));
  }
  const avrng = computeEMA(absDiff, period);
  const wper = period * 2 - 1;
  const smooth = computeEMA(avrng, wper);
  return smooth.map((v) => v * multiplier);
}

export function computeTwinRangeFilter(closes: number[]) {
  const smrng1 = computeSmoothRange(closes, 27, 1.6);
  const smrng2 = computeSmoothRange(closes, 55, 2.0);
  const smrng = closes.map((_, i) => (smrng1[i] + smrng2[i]) / 2);

  const filt: number[] = [closes[0] ?? 0];
  const upward: number[] = [0];
  const downward: number[] = [0];
  const signals: Array<'BUY' | 'SELL' | null> = [null];
  let condIni = 0;

  for (let i = 1; i < closes.length; i++) {
    const prevFilt = filt[i - 1];
    let nextFilt = prevFilt;
    if (closes[i] > prevFilt) {
      nextFilt = closes[i] - smrng[i] < prevFilt ? prevFilt : closes[i] - smrng[i];
    } else {
      nextFilt = closes[i] + smrng[i] > prevFilt ? prevFilt : closes[i] + smrng[i];
    }
    filt.push(nextFilt);

    const up = nextFilt > prevFilt ? upward[i - 1] + 1 : nextFilt < prevFilt ? 0 : upward[i - 1];
    const down = nextFilt < prevFilt ? downward[i - 1] + 1 : nextFilt > prevFilt ? 0 : downward[i - 1];
    upward.push(up);
    downward.push(down);

    const longCond = closes[i] > nextFilt && up > 0;
    const shortCond = closes[i] < nextFilt && down > 0;

    let sig: 'BUY' | 'SELL' | null = null;
    if (longCond && condIni !== 1) {
      sig = 'BUY';
      condIni = 1;
    } else if (shortCond && condIni !== -1) {
      sig = 'SELL';
      condIni = -1;
    }
    signals.push(sig);
  }

  return { filt, upward, downward, signals };
}

export function computeATR14(bars: OhlcvBar[]): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    trs.push(tr);
  }
  const slice = trs.slice(-14);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function computeWeeklyPivots(bars: OhlcvBar[], activePrice: number): WeeklyPivots {
  // Group bars by ISO week key and take the last completed week (or previous 5-bar block)
  const getWeekKey = (ts: number) => {
    const d = new Date(ts);
    const temp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = temp.getUTCDay() || 7;
    temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${temp.getUTCFullYear()}-W${weekNo}`;
  };

  const weekMap = new Map<string, OhlcvBar[]>();
  for (const bar of bars) {
    const key = getWeekKey(bar.timestamp);
    const list = weekMap.get(key) ?? [];
    list.push(bar);
    weekMap.set(key, list);
  }

  const weekKeys = Array.from(weekMap.keys());
  const prevWeekBars =
    weekKeys.length >= 2
      ? weekMap.get(weekKeys[weekKeys.length - 2])!
      : bars.slice(-10, -5);

  const refBars = prevWeekBars.length > 0 ? prevWeekBars : bars.slice(-5);
  const weekHigh = Math.max(...refBars.map((b) => b.high));
  const weekLow = Math.min(...refBars.map((b) => b.low));
  const weekClose = refBars[refBars.length - 1].close;

  const pp = (weekHigh + weekLow + weekClose) / 3;
  const r1 = 2 * pp - weekLow;
  const s1 = 2 * pp - weekHigh;
  const r2 = pp + (weekHigh - weekLow);
  const s2 = pp - (weekHigh - weekLow);

  let priceZoneLabel = 'Near Central Pivot (PP)';
  if (activePrice >= r2) priceZoneLabel = 'Above R2 Breakout Zone';
  else if (activePrice >= r1) priceZoneLabel = 'Between R1 and R2';
  else if (activePrice >= pp) priceZoneLabel = 'Between PP and R1';
  else if (activePrice >= s1) priceZoneLabel = 'Between S1 and PP';
  else if (activePrice >= s2) priceZoneLabel = 'Between S2 and S1';
  else priceZoneLabel = 'Below S2 Breakdown Zone';

  const span = Math.max(r2 - s2, 0.01);
  const scalePercent = Math.min(100, Math.max(0, round2(((activePrice - s2) / span) * 100)));

  return {
    weekHigh: round2(weekHigh),
    weekLow: round2(weekLow),
    weekClose: round2(weekClose),
    pp: round2(pp),
    r1: round2(r1),
    r2: round2(r2),
    s1: round2(s1),
    s2: round2(s2),
    priceZoneLabel,
    scalePercent,
  };
}

function buildFloorPivotSet(high: number, low: number, close: number): PivotLevelSet {
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  return {
    high: round2(high),
    low: round2(low),
    close: round2(close),
    pp: round2(pp),
    r1: round2(r1),
    r2: round2(r2),
    s1: round2(s1),
    s2: round2(s2),
  };
}

export function computeDailyPivots(bars: OhlcvBar[]): PivotLevelSet {
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : bars[bars.length - 1];
  return buildFloorPivotSet(prevBar.high, prevBar.low, prevBar.close);
}

export function computeMonthlyPivots(bars: OhlcvBar[]): PivotLevelSet {
  const monthFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  });
  const monthMap = new Map<string, OhlcvBar[]>();
  for (const bar of bars) {
    const key = monthFmt.format(new Date(bar.timestamp)).slice(0, 7);
    const list = monthMap.get(key) ?? [];
    list.push(bar);
    monthMap.set(key, list);
  }

  const monthKeys = Array.from(monthMap.keys());
  const prevMonthBars =
    monthKeys.length >= 2
      ? monthMap.get(monthKeys[monthKeys.length - 2])!
      : bars.length >= 42
        ? bars.slice(-42, -21)
        : bars.slice(-21);

  const refBars = prevMonthBars.length > 0 ? prevMonthBars : bars;
  const monthHigh = Math.max(...refBars.map((b) => b.high));
  const monthLow = Math.min(...refBars.map((b) => b.low));
  const monthClose = refBars[refBars.length - 1].close;

  return buildFloorPivotSet(monthHigh, monthLow, monthClose);
}

export function classifySuperPivots(
  bars: OhlcvBar[],
  weeklyPivots: WeeklyPivots,
  activePrice: number,
): SuperPivotData {
  const daily = computeDailyPivots(bars);
  const weekly: PivotLevelSet = {
    high: weeklyPivots.weekHigh,
    low: weeklyPivots.weekLow,
    close: weeklyPivots.weekClose,
    pp: weeklyPivots.pp,
    r1: weeklyPivots.r1,
    r2: weeklyPivots.r2,
    s1: weeklyPivots.s1,
    s2: weeklyPivots.s2,
  };
  const monthly = computeMonthlyPivots(bars);

  const dPp = daily.pp;
  const wPp = weekly.pp;
  const mPp = monthly.pp;

  const spread = Math.max(dPp, wPp, mPp) - Math.min(dPp, wPp, mPp);
  const spreadRatio = spread / Math.max(activePrice, 1);

  let trend: SuperPivotTrend;
  if (dPp > weekly.r1 && wPp > monthly.r1) {
    trend = 'Strong Uptrend';
  } else if (dPp < weekly.s1 && wPp < monthly.s1) {
    trend = 'Severe Downtrend';
  } else if (spreadRatio < 0.004) {
    trend = 'Sideways';
  } else if (dPp > wPp && wPp > mPp) {
    trend = 'Uptrend';
  } else if (dPp < wPp && wPp < mPp) {
    trend = 'Downtrend';
  } else {
    trend = 'Sideways';
  }

  return {
    daily,
    weekly,
    monthly,
    trend,
  };
}

function format1hCandleIst(timestampMs: number): string {
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestampMs));
  return `${formatted} IST`;
}

function toIstDateKey(timestampMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestampMs));
}

export function evaluateIntraday1hConfluence(
  rawBars1h: OhlcvBar[],
  dailyMbLower: number,
  dailyMbUpper: number,
  liveLtp: number | null,
  clock: MarketClockStatus,
): Intraday1hConfluenceSnapshot | undefined {
  // Alert message feature operates strictly during intraday market hours on every 1h candle
  if (!clock.isOpen || rawBars1h.length < 60) {
    return undefined;
  }

  const bars1h = rawBars1h.map((b) => ({ ...b }));
  const last1hIdx = bars1h.length - 1;
  const spotPrice1h =
    liveLtp && liveLtp > 0 ? round2(liveLtp) : round2(bars1h[last1hIdx].close);

  if (liveLtp && liveLtp > 0) {
    bars1h[last1hIdx].close = liveLtp;
    bars1h[last1hIdx].high = Math.max(bars1h[last1hIdx].high, liveLtp);
    bars1h[last1hIdx].low = Math.min(bars1h[last1hIdx].low, liveLtp);
  }

  const closes1h = bars1h.map((b) => b.close);
  const bbwp1hSeries = computeBBWPSeries(closes1h);
  const bbwp1hSma9Series = computeSMA(bbwp1hSeries, 9);
  const {
    bbwpSlope: bbwp1hSlope,
    bbwpStatus: bbwp1hStatus,
  } = classifyBBWPStatus(bbwp1hSeries, bbwp1hSma9Series, last1hIdx);
  const bbwp1h = round2(bbwp1hSeries[last1hIdx] ?? 0);

  const { pvo: pvo1hSeries } = computePVOSeries(bars1h);
  const pvo1h = round2(pvo1hSeries[last1hIdx] ?? 0);
  const pvo1hPositive = pvo1h > 0;

  const twin1h = computeTwinRangeFilter(closes1h);
  const latest1hSignal = twin1h.signals[last1hIdx];
  const twinRange1hFreshSignal: 'Long' | 'Short' | null =
    latest1hSignal === 'BUY' ? 'Long' : latest1hSignal === 'SELL' ? 'Short' : null;

  // Condition 1: Fresh/first 1h candle entry ONLY into Daily Market Bias CEREBR zone (re-entry never triggers)
  const curr1h = bars1h[last1hIdx];
  const prev1h = bars1h[last1hIdx - 1];
  const todayIst = toIstDateKey(curr1h.timestamp);

  const zoneTolLow = dailyMbLower * 0.997;
  const zoneTolHigh = dailyMbUpper * 1.003;
  const barTouchesDailyZone = (bar: OhlcvBar) =>
    bar.low <= zoneTolHigh && bar.high >= zoneTolLow;

  const curr1hTouchesDailyZone =
    barTouchesDailyZone(curr1h) || (spotPrice1h >= zoneTolLow && spotPrice1h <= zoneTolHigh);
  const prev1hOutsideDailyZone =
    prev1h != null && (prev1h.close < dailyMbLower || prev1h.close > dailyMbUpper);

  // Check if price already entered the Daily Market Bias CEREBR zone in an earlier 1h candle today
  let alreadyEnteredBeforeCurrentBar = false;
  for (let i = 0; i < last1hIdx; i++) {
    const b = bars1h[i];
    const barDate = toIstDateKey(b.timestamp);
    if (barDate === todayIst) {
      if (barTouchesDailyZone(b)) {
        alreadyEnteredBeforeCurrentBar = true;
        break;
      }
    }
  }

  // Also ensure the prior session's closing 1h bar wasn't already resting inside the zone
  const prevSessionBars = bars1h
    .slice(0, last1hIdx)
    .filter((b) => toIstDateKey(b.timestamp) !== todayIst);
  const prevSessionLastBar = prevSessionBars[prevSessionBars.length - 1];
  const prevSessionClosedInside =
    prevSessionLastBar != null &&
    prevSessionLastBar.close >= dailyMbLower &&
    prevSessionLastBar.close <= dailyMbUpper;

  const marketBias1hFreshZoneEntry =
    curr1hTouchesDailyZone &&
    prev1hOutsideDailyZone &&
    !alreadyEnteredBeforeCurrentBar &&
    !prevSessionClosedInside;

  // Condition 3: 1h BBWP shows Early Expansion or Sustained Expansion with Upward Slope
  const bbwp1hConfluenceOk =
    (bbwp1hStatus === 'Early Expansion' || bbwp1hStatus === 'Sustained Expansion') &&
    bbwp1hSlope === 'Upward';

  const confluenceMatched =
    clock.isOpen &&
    marketBias1hFreshZoneEntry &&
    twinRange1hFreshSignal !== null &&
    bbwp1hConfluenceOk &&
    pvo1hPositive;

  return {
    candle1hIso: new Date(curr1h.timestamp).toISOString(),
    candle1hIst: format1hCandleIst(curr1h.timestamp),
    spotPrice1h,
    marketBias1hFreshZoneEntry,
    twinRange1hFreshSignal,
    bbwp1h,
    bbwp1hSlope,
    bbwp1hStatus,
    pvo1h,
    pvo1hPositive,
    confluenceMatched,
  };
}

export function analyzeStockData(
  entry: StockUniverseEntry,
  rawBars: OhlcvBar[],
  liveLtp: number | null,
  previousClose: number,
  clock: MarketClockStatus,
  brokerConnected: boolean,
  rawBars1h?: OhlcvBar[],
): AnalyzedStock | null {
  if (rawBars.length < 30) return null;

  // Apply Market Hours rule:
  // Live market hours -> use LTP for calculations; off-market hours -> use last closing price.
  const bars = rawBars.map((b) => ({ ...b }));
  const lastIdx = bars.length - 1;
  const activePrice =
    clock.isOpen && liveLtp && liveLtp > 0 ? liveLtp : bars[lastIdx].close;

  if (clock.isOpen && liveLtp && liveLtp > 0) {
    bars[lastIdx].close = liveLtp;
    bars[lastIdx].high = Math.max(bars[lastIdx].high, liveLtp);
    bars[lastIdx].low = Math.min(bars[lastIdx].low, liveLtp);
  }

  const closes = bars.map((b) => b.close);
  const bbwpSeries = computeBBWPSeries(closes);
  const bbwpSma9Series = computeSMA(bbwpSeries, 9);
  const { bbwpSma9, bbwpSlope, bbwpStatus } = classifyBBWPStatus(
    bbwpSeries,
    bbwpSma9Series,
    lastIdx,
  );
  const { pvo, signal: pvoSig } = computePVOSeries(bars);
  const ema10Series = computeEMA(closes, 10);
  const ema20Series = computeEMA(closes, 20);
  const mb = computeMarketBias(bars);
  const twin = computeTwinRangeFilter(closes);
  const atr14 = computeATR14(bars);

  const bbwp = bbwpSeries[lastIdx];
  const pvoVal = round2(pvo[lastIdx]);
  const pvoSignalVal = round2(pvoSig[lastIdx]);
  const ema10 = round2(ema10Series[lastIdx]);
  const ema20 = round2(ema20Series[lastIdx]);

  const mbUpper = Math.max(mb.mbOpen[lastIdx], mb.mbClose[lastIdx], mb.mbHigh[lastIdx]);
  const mbLower = Math.min(mb.mbOpen[lastIdx], mb.mbClose[lastIdx], mb.mbLow[lastIdx]);
  const mbCoreHigh = Math.max(mb.mbOpen[lastIdx], mb.mbClose[lastIdx]);
  const mbCoreLow = Math.min(mb.mbOpen[lastIdx], mb.mbClose[lastIdx]);
  const mbBullish = mb.mbClose[lastIdx] >= mb.mbOpen[lastIdx];

  // Determine if stock is bouncing off Market Bias support (uptrend) or dipping from resistance (downtrend)
  const recentBars = bars.slice(-6);
  const recentLowMin = Math.min(...recentBars.map((b) => b.low));
  const recentHighMax = Math.max(...recentBars.map((b) => b.high));
  const zoneTolerance = activePrice * 0.035;

  const prevClose = bars[lastIdx - 1]?.close ?? activePrice;
  const reversingUp = activePrice > prevClose || activePrice > bars[lastIdx].open;
  const reversingDown = activePrice < prevClose || activePrice < bars[lastIdx].open;

  let marketBiasSetup: MarketBiasSetup = 'Neutral';
  if (
    mbBullish &&
    recentLowMin <= mbUpper + zoneTolerance &&
    activePrice >= mbLower - zoneTolerance * 0.5 &&
    (reversingUp || activePrice > twin.filt[lastIdx])
  ) {
    marketBiasSetup = 'Bullish Bounce';
  } else if (
    !mbBullish &&
    recentHighMax >= mbLower - zoneTolerance &&
    activePrice <= mbUpper + zoneTolerance * 0.5 &&
    (reversingDown || activePrice < twin.filt[lastIdx])
  ) {
    marketBiasSetup = 'Bearish Dip';
  }

  // Daily values for Scanner 1/2/3 table display; Intraday-only 1h candle evaluation for Alerts & fresh matches
  const dailyMbLow = round2(mbLower);
  const dailyMbHigh = round2(mbUpper);
  const intraday1h =
    clock.isOpen && rawBars1h && rawBars1h.length >= 60
      ? evaluateIntraday1hConfluence(rawBars1h, dailyMbLow, dailyMbHigh, liveLtp, clock)
      : undefined;

  const marketBiasFreshZoneEntry = intraday1h?.marketBias1hFreshZoneEntry ?? false;
  const twinRangeFreshSignal: 'Long' | 'Short' | null =
    intraday1h?.twinRange1hFreshSignal ?? null;
  const confluenceMatched = Boolean(clock.isOpen && intraday1h?.confluenceMatched);

  // Twin Range latest active daily display signal
  const latestSignal = twin.signals[lastIdx];
  let twinRangeSignal: TwinRangeSignal = 'HOLD';
  if (latestSignal) {
    twinRangeSignal = latestSignal;
  } else if (twin.upward[lastIdx] > 0 && activePrice >= twin.filt[lastIdx]) {
    twinRangeSignal = 'BUY';
  } else if (twin.downward[lastIdx] > 0 && activePrice <= twin.filt[lastIdx]) {
    twinRangeSignal = 'SELL';
  }

  // Daily Market Bias CEREBR zone Inside vs Outside check
  const dailyZoneTolLow = dailyMbLow * 0.997;
  const dailyZoneTolHigh = dailyMbHigh * 1.003;
  const isInsideDailyZone =
    (activePrice >= dailyZoneTolLow && activePrice <= dailyZoneTolHigh) ||
    Boolean(intraday1h?.marketBias1hFreshZoneEntry);
  const marketBiasZonePosition: 'Inside' | 'Outside' = isInsideDailyZone ? 'Inside' : 'Outside';

  // Market Bias CEREBR Trend Continuation vs Trend Reversal check
  const effectiveDirectionalSignal: 'Long' | 'Short' =
    twinRangeFreshSignal ??
    (twinRangeSignal === 'BUY'
      ? 'Long'
      : twinRangeSignal === 'SELL'
        ? 'Short'
        : activePrice >= twin.filt[lastIdx]
          ? 'Long'
          : 'Short');
  const alignsWithMarketBias =
    (mbBullish && effectiveDirectionalSignal === 'Long') ||
    (!mbBullish && effectiveDirectionalSignal === 'Short');
  const marketBiasTrendType: 'Trend Continuation' | 'Trend Reversal' = alignsWithMarketBias
    ? 'Trend Continuation'
    : 'Trend Reversal';

  const pvoPositive = pvoVal > 0;

  const twinFilterVal = round2(twin.filt[lastIdx]);
  const safeAtr = Math.max(atr14, activePrice * 0.012);

  let entryPrice = round2(activePrice);
  let stopLoss = round2(activePrice - safeAtr * 1.5);
  let targetPrice = round2(activePrice + safeAtr * 3.0);

  if (effectiveDirectionalSignal === 'Short') {
    entryPrice = round2(activePrice);
    stopLoss = round2(Math.max(mbCoreHigh + safeAtr * 0.6, twinFilterVal + safeAtr * 1.1, activePrice + safeAtr));
    const risk = Math.max(stopLoss - entryPrice, safeAtr);
    targetPrice = round2(Math.max(0.05, entryPrice - risk * 2.0));
  } else {
    entryPrice = round2(activePrice);
    stopLoss = round2(Math.max(0.05, Math.min(mbCoreLow - safeAtr * 0.6, twinFilterVal - safeAtr * 1.1, activePrice - safeAtr)));
    const risk = Math.max(entryPrice - stopLoss, safeAtr);
    targetPrice = round2(entryPrice + risk * 2.0);
  }

  const change = round2(activePrice - previousClose);
  const changePercent = previousClose > 0 ? round2((change / previousClose) * 100) : 0;

  const chartSliceStart = Math.max(0, bars.length - 75);
  const chartSeries: ChartSeriesPoint[] = [];
  for (let i = chartSliceStart; i < bars.length; i++) {
    chartSeries.push({
      date: bars[i].date,
      open: round2(bars[i].open),
      high: round2(bars[i].high),
      low: round2(bars[i].low),
      close: round2(bars[i].close),
      volume: bars[i].volume,
      mbUpper: round2(Math.max(mb.mbOpen[i], mb.mbClose[i], mb.mbHigh[i])),
      mbLower: round2(Math.min(mb.mbOpen[i], mb.mbClose[i], mb.mbLow[i])),
      mbBullish: mb.mbClose[i] >= mb.mbOpen[i],
      twinFilter: round2(twin.filt[i]),
      twinSignal: twin.signals[i],
      ema10: round2(ema10Series[i]),
      ema20: round2(ema20Series[i]),
    });
  }

  const weeklyPivots = computeWeeklyPivots(bars, activePrice);
  const superPivots = classifySuperPivots(bars, weeklyPivots, activePrice);

  return {
    symbol: entry.symbol,
    yahooSymbol: entry.yahooSymbol ?? `${entry.symbol}.NS`,
    companyName: entry.companyName,
    sector: entry.sector,
    isFno: entry.isFno,
    isNifty500: entry.isNifty500,
    isIndex: Boolean(entry.isIndex),
    currentPrice: round2(activePrice),
    previousClose: round2(previousClose),
    change,
    changePercent,
    priceBasis: clock.priceBasis,
    bbwp,
    bbwpSma9,
    bbwpSlope,
    bbwpStatus,
    pvo: pvoVal,
    pvoSignal: pvoSignalVal,
    pvoPositive,
    ema10,
    ema20,
    emaTrend: ema10 >= ema20 ? 'Fast EMA > Slow EMA' : 'Fast EMA < Slow EMA',
    marketBiasDirection: mbBullish ? 'Bullish' : 'Bearish',
    marketBiasSetup,
    marketBiasZoneLow: dailyMbLow,
    marketBiasZoneHigh: dailyMbHigh,
    marketBiasZonePosition,
    marketBiasTrendType,
    marketBiasOscillator: round2(mb.osc[lastIdx]),
    marketBiasFreshZoneEntry,
    twinRangeSignal,
    twinRangeFreshSignal,
    twinRangeFilter: twinFilterVal,
    confluenceMatched,
    intraday1h,
    entryPrice,
    targetPrice,
    stopLoss,
    riskRewardRatio: '1 : 2.0',
    weeklyPivots,
    superPivots,
    chartSeries,
    lastUpdatedIso: new Date().toISOString(),
    dataSource: brokerConnected ? 'Broker + NSE Feed' : 'NSE Live Market Feed',
  };
}
