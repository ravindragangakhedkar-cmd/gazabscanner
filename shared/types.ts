export interface OhlcvBar {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketClockStatus {
  isOpen: boolean;
  priceBasis: 'LTP' | 'LAST_CLOSE';
  istTimeLabel: string;
  sessionLabel: string;
}

export interface TickerItem {
  id: string;
  label: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  unitPrefix: string;
  unitSuffix?: string;
}

export interface WeeklyPivots {
  weekHigh: number;
  weekLow: number;
  weekClose: number;
  pp: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
  priceZoneLabel: string;
  scalePercent: number;
}

export interface ChartSeriesPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  mbUpper: number;
  mbLower: number;
  mbBullish: boolean;
  twinFilter: number;
  twinSignal: 'BUY' | 'SELL' | null;
  ema10: number;
  ema20: number;
}

export type MarketBiasSetup = 'Bullish Bounce' | 'Bearish Dip' | 'Neutral';
export type TwinRangeSignal = 'BUY' | 'SELL' | 'HOLD';
export type BbwpStatus =
  | 'Early Expansion'
  | 'Sustained Expansion'
  | 'Fading Expansion'
  | 'Extreme Expansion'
  | 'Volatility Cooling'
  | 'Compression';

export interface Intraday1hConfluenceSnapshot {
  candle1hIso: string;
  candle1hIst: string;
  spotPrice1h: number;
  marketBias1hFreshZoneEntry: boolean;
  twinRange1hFreshSignal: 'Long' | 'Short' | null;
  bbwp1h: number;
  bbwp1hSlope: 'Upward' | 'Downward' | 'Flat';
  bbwp1hStatus: BbwpStatus;
  pvo1h: number;
  pvo1hPositive: boolean;
  confluenceMatched: boolean;
}

export interface PivotLevelSet {
  high: number;
  low: number;
  close: number;
  pp: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
}

export type SuperPivotTrend =
  | 'Strong Uptrend'
  | 'Uptrend'
  | 'Downtrend'
  | 'Severe Downtrend'
  | 'Sideways';

export interface SuperPivotData {
  daily: PivotLevelSet;
  weekly: PivotLevelSet;
  monthly: PivotLevelSet;
  trend: SuperPivotTrend;
}

export interface AnalyzedStock {
  symbol: string;
  yahooSymbol: string;
  companyName: string;
  sector: string;
  isFno: boolean;
  isNifty500: boolean;
  isIndex?: boolean;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  priceBasis: 'LTP' | 'LAST_CLOSE';
  bbwp: number;
  bbwpSma9: number;
  bbwpSlope: 'Upward' | 'Downward' | 'Flat';
  bbwpStatus: BbwpStatus;
  pvo: number;
  pvoSignal: number;
  pvoPositive: boolean;
  ema10: number;
  ema20: number;
  emaTrend: 'Fast EMA > Slow EMA' | 'Fast EMA < Slow EMA';
  marketBiasDirection: 'Bullish' | 'Bearish';
  marketBiasSetup: MarketBiasSetup;
  marketBiasZoneLow: number;
  marketBiasZoneHigh: number;
  marketBiasZonePosition: 'Inside' | 'Outside';
  marketBiasTrendType: 'Trend Continuation' | 'Trend Reversal';
  marketBiasOscillator: number;
  marketBiasFreshZoneEntry: boolean;
  twinRangeSignal: TwinRangeSignal;
  twinRangeFreshSignal: 'Long' | 'Short' | null;
  twinRangeFilter: number;
  confluenceMatched: boolean;
  intraday1h?: Intraday1hConfluenceSnapshot;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: string;
  weeklyPivots: WeeklyPivots;
  superPivots: SuperPivotData;
  chartSeries: ChartSeriesPoint[];
  lastUpdatedIso: string;
  dataSource: 'Broker + NSE Feed' | 'NSE Live Market Feed';
}

export interface OptionCallShortCoveringRow {
  symbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE';
  isIndex: boolean;
  expiry: string;
  spotPrice: number;
  atmStrikePrice: number;
  atmCallSymbol: string;
  callPriceStart: number | null;
  callPriceEnd: number | null;
  callPriceChangePercent: number | null;
  atmCallOiChangePercent: number | null;
  qualifiesShortCovering: boolean;
  statusLabel: string;
  intervalLabel: string;
  dataSource: 'Nubra Broker Live 1h' | 'Nubra Option Chain + 1h Feed';
}

export interface OptionCallShortCoveringScanResponse {
  items: OptionCallShortCoveringRow[];
  clock: MarketClockStatus;
  totalUniverseTracked: number;
  loadedCount: number;
  qualifyingCount: number;
  callIncreaseCount: number;
  callOiDecreaseCount: number;
  intervalLabel: string;
}

export interface OptionPutShortCoveringRow {
  symbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE';
  isIndex: boolean;
  expiry: string;
  spotPrice: number;
  atmStrikePrice: number;
  atmPutSymbol: string;
  putPriceStart: number | null;
  putPriceEnd: number | null;
  putPriceChangePercent: number | null;
  atmPutOiChangePercent: number | null;
  qualifiesShortCovering: boolean;
  statusLabel: string;
  intervalLabel: string;
  dataSource: 'Nubra Broker Live 1h' | 'Nubra Option Chain + 1h Feed';
}

export interface OptionPutShortCoveringScanResponse {
  items: OptionPutShortCoveringRow[];
  clock: MarketClockStatus;
  totalUniverseTracked: number;
  loadedCount: number;
  qualifyingCount: number;
  putIncreaseCount: number;
  putOiDecreaseCount: number;
  intervalLabel: string;
}

export interface BrokerSessionInfo {
  connected: boolean;
  maskedMobile: string;
  clientCode: string;
  mode: 'live-api' | 'sandbox-verified';
  provider?: 'nubra' | 'broker';
  nubraLiveAuth?: boolean;
  connectedAtIso: string;
}

export const OFFICIAL_MERCHANT_EMAIL = 'YOUR_SUPPORT_EMAIL@example.com';

export interface UserProfileDoc {
  uid: string;
  email: string;
  displayName: string;
  subscriptionTier: 'trial' | 'monthly' | 'yearly';
  subscriptionStatus: 'active' | 'expired';
  trialEndsAt: unknown;
  planPurchasedAt?: unknown;
  googlePlayOrderId?: string;
  paymentLinkedAccount?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AlertChannelDelivery {
  status: 'sent' | 'pending-config' | 'failed';
  provider: string;
  detail: string;
}

export interface AlertChartSnapshot {
  symbol: string;
  companyName: string;
  isIndex: boolean;
  marketBiasDirection: 'Bullish' | 'Bearish';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  weeklyPivots: WeeklyPivots;
  chartSeries: ChartSeriesPoint[];
}

export interface ConfluenceAlertRecord {
  id: string;
  scanner: 'scanner1' | 'scanner3';
  symbol: string;
  companyName: string;
  isIndex: boolean;
  candle1hIso: string;
  candle1hIst: string;
  matchedAtIso: string;
  matchedAtIst: string;
  subject: string;
  body: string;
  marketBiasStatus: string;
  marketBiasClassification: 'Trend Continuation' | 'Trend Reversal';
  twinRangeSignal: 'Long' | 'Short';
  bbwpValue: number;
  bbwpStatus: BbwpStatus;
  bbwpSlope: 'Upward' | 'Downward' | 'Flat';
  pvoValue: number;
  activePrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  chartUrl: string;
  chartSnapshot?: AlertChartSnapshot;
  smsTarget: string;
  emailTarget: string;
  smsDelivery: AlertChannelDelivery;
  emailDelivery: AlertChannelDelivery;
}
