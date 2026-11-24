import { getNSEMarketClockStatus } from '../shared/indicators.ts';
import {
  INDEX_BASKET_UNIVERSE,
  NIFTY_500_FNO_UNIVERSE,
  type StockUniverseEntry,
} from '../shared/nifty500Universe.ts';
import type {
  MarketClockStatus,
  OptionCallShortCoveringRow,
  OptionCallShortCoveringScanResponse,
  OptionPutShortCoveringRow,
  OptionPutShortCoveringScanResponse,
} from '../shared/types.ts';
import { getNubraCredentialsForSession } from './brokerService.ts';

export interface OptionShortCoveringFilters {
  filterMode?: 'qualifying' | 'call-gt-2' | 'all';
  segmentFilter?: 'all' | 'indices' | 'stocks';
  q?: string;
}

export interface OptionPutShortCoveringFilters {
  filterMode?: 'qualifying' | 'put-gt-2' | 'all';
  segmentFilter?: 'all' | 'indices' | 'stocks';
  q?: string;
}

interface NubraRefdataRow {
  ref_id: number;
  stock_name: string;
  asset: string;
  expiry?: number;
  exchange: 'NSE' | 'BSE';
  derivative_type: 'STOCK' | 'FUT' | 'OPT';
  asset_type?: string;
}

interface NubraOptionContract {
  ref_id?: number;
  symbol?: string;
  sp?: number;
  ltp?: number | null;
  ltpchg?: number | null;
  iv?: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  oi?: number | null;
  prev_oi?: number | null;
  volume?: number | null;
  ts?: number;
}

interface NubraOptionChainPayload {
  chain?: {
    asset?: string;
    exchange?: 'NSE' | 'BSE';
    expiry?: string;
    atm?: number;
    cp?: number;
    all_expiries?: string[];
    ce?: NubraOptionContract[];
    pe?: NubraOptionContract[];
    underlying_instrument?: {
      ltp?: number;
      prev_close?: number;
    };
  };
  error?: string;
}

interface Yahoo1hCandle {
  timestamp: number;
  open: number;
  close: number;
}

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Cache-Control': 'no-cache',
};

function getSafeNubraBaseUrl(): string {
  const configured = process.env.NUBRA_API_BASE_URL?.trim() || 'https://api.nubra.io';
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      return 'https://api.nubra.io';
    }
    const allowedHosts = new Set(['api.nubra.io', 'uatapi.nubra.io']);
    if (!allowedHosts.has(parsed.hostname)) {
      return 'https://api.nubra.io';
    }
    return parsed.origin;
  } catch {
    return 'https://api.nubra.io';
  }
}

function getTodayIstStrings(): { isoDate: string; yyyymmdd: string; yyyymmddNum: number } {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return {
    isoDate: `${y}-${m}-${d}`,
    yyyymmdd: `${y}${m}${d}`,
    yyyymmddNum: Number(`${y}${m}${d}`),
  };
}

function format1hWindowIst(startTsMs: number, endTsMs: number): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  const datePart = new Date(endTsMs).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  });
  return `${datePart}, ${fmt(startTsMs)} – ${fmt(endTsMs)} IST`;
}

let cachedRefdataDay: {
  isoDate: string;
  nseFnoAssets: Set<string>;
  nearFuturesByKey: Map<string, string>;
} | null = null;

async function fetchNubraRefdataFuturesMap(
  nubraBase: string,
  isoDate: string,
  yyyymmddNum: number,
  headers: Record<string, string>,
): Promise<{
  nseFnoAssets: Set<string>;
  nearFuturesByKey: Map<string, string>;
}> {
  if (cachedRefdataDay && cachedRefdataDay.isoDate === isoDate && cachedRefdataDay.nseFnoAssets.size > 0) {
    return {
      nseFnoAssets: cachedRefdataDay.nseFnoAssets,
      nearFuturesByKey: cachedRefdataDay.nearFuturesByKey,
    };
  }

  const nseFnoAssets = new Set<string>();
  const nearFuturesByKey = new Map<string, { stockName: string; expiry: number }>();

  const loadExchange = async (exchange: 'NSE' | 'BSE') => {
    try {
      const res = await fetch(`${nubraBase}/refdata/refdata/${isoDate}?exchange=${exchange}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { refdata?: NubraRefdataRow[] };
      for (const row of json.refdata ?? []) {
        if (row.derivative_type === 'FUT') {
          if (exchange === 'NSE') nseFnoAssets.add(row.asset);
          const exp = row.expiry ?? 99999999;
          if (exp < yyyymmddNum) continue;
          const key = `${exchange}:${row.asset}`;
          const prev = nearFuturesByKey.get(key);
          if (!prev || exp < prev.expiry) {
            nearFuturesByKey.set(key, { stockName: row.stock_name, expiry: exp });
          }
        }
      }
    } catch {
      // Non-fatal; individual option chains still resolve cleanly
    }
  };

  await Promise.all([loadExchange('NSE'), loadExchange('BSE')]);

  const outMap = new Map<string, string>();
  for (const [k, v] of nearFuturesByKey.entries()) {
    outMap.set(k, v.stockName);
  }
  if (nseFnoAssets.size > 0) {
    cachedRefdataDay = { isoDate, nseFnoAssets, nearFuturesByKey: outMap };
  }
  return { nseFnoAssets, nearFuturesByKey: outMap };
}

async function fetchYahoo1hLatestWindow(yahooSymbol: string): Promise<Yahoo1hCandle | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1h&_=${Date.now()}`;
  try {
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const tsList = result?.timestamp ?? [];
    const opens = result?.indicators?.quote?.[0]?.open ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const valid: Yahoo1hCandle[] = [];
    for (let i = 0; i < tsList.length; i++) {
      const o = opens[i];
      const c = closes[i];
      if (o == null || c == null) continue;
      valid.push({ timestamp: tsList[i] * 1000, open: o, close: c });
    }
    if (valid.length === 0) return null;

    const last = valid[valid.length - 1];
    // Combine NSE closing 15-min stub (15:15–15:30 IST) with preceding 1h candle when applicable
    if (valid.length >= 2) {
      const prev = valid[valid.length - 2];
      const d = new Date(last.timestamp);
      const istMin = (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
      if (istMin === 15 * 60 + 15 && last.timestamp - prev.timestamp <= 70 * 60 * 1000) {
        return {
          timestamp: prev.timestamp,
          open: prev.open,
          close: last.close,
        };
      }
    }
    return last;
  } catch {
    return null;
  }
}

async function fetchNubra1hTimeseriesMetrics(
  nubraBase: string,
  headers: Record<string, string>,
  exchange: 'NSE' | 'BSE',
  contractSymbol: string,
  derivativeType: 'OPT' | 'FUT',
): Promise<{
  open?: number;
  close?: number;
  prevOi?: number;
  currOi?: number;
} | null> {
  if (!headers.Authorization) return null;
  try {
    const endIso = new Date().toISOString();
    const startIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${nubraBase}/charts/timeseries`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: [
          {
            exchange,
            type: derivativeType,
            values: [contractSymbol],
            fields: ['open', 'close', 'cumulative_oi'],
            interval: '1h',
            intraDay: false,
            startDate: startIso,
            endDate: endIso,
          },
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: Array<{
        values?: Array<
          Record<
            string,
            {
              open?: Array<{ ts: number; v: number }>;
              close?: Array<{ ts: number; v: number }>;
              cumulative_oi?: Array<{ ts: number; v: number }>;
            }
          >
        >;
      }>;
    };
    const symbolBlock = json.result?.[0]?.values?.[0]?.[contractSymbol];
    if (!symbolBlock) return null;
    const opens = symbolBlock.open ?? [];
    const closes = symbolBlock.close ?? [];
    const ois = symbolBlock.cumulative_oi ?? [];
    const lastOpen = opens.length > 0 ? opens[opens.length - 1].v : undefined;
    const lastClose = closes.length > 0 ? closes[closes.length - 1].v : undefined;
    const prevOi = ois.length >= 2 ? ois[ois.length - 2].v : undefined;
    const currOi = ois.length >= 1 ? ois[ois.length - 1].v : undefined;
    return {
      open: typeof lastOpen === 'number' ? lastOpen / 100 : undefined,
      close: typeof lastClose === 'number' ? lastClose / 100 : undefined,
      prevOi,
      currOi,
    };
  } catch {
    return null;
  }
}

async function fetchNubraOptionChainWithRetry(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  const res = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 650));
    return fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  }
  return res;
}

async function fetchNubraInstrumentCallShortCovering(
  entry: StockUniverseEntry,
  nubraBase: string,
  yyyymmdd: string,
  publicHeaders: Record<string, string>,
  authHeaders: Record<string, string>,
  hasLiveNubraAuth: boolean,
): Promise<OptionCallShortCoveringRow | null> {
  const exchange: 'NSE' | 'BSE' = entry.symbol === 'SENSEX' ? 'BSE' : 'NSE';
  const yahooSym = entry.yahooSymbol ?? `${entry.symbol}.NS`;

  try {
    const firstRes = await fetchNubraOptionChainWithRetry(
      `${nubraBase}/optionchains/${encodeURIComponent(entry.symbol)}?exchange=${exchange}`,
      publicHeaders,
    );
    if (!firstRes.ok) {
      console.warn(`[Nubra Call] optionchains ${entry.symbol} HTTP ${firstRes.status}`);
      return null;
    }
    const firstJson = (await firstRes.json()) as NubraOptionChainPayload;
    if (!firstJson.chain) return null;

    let chain = firstJson.chain;
    const activeExpiry =
      chain.all_expiries?.find((exp) => exp >= yyyymmdd) ?? chain.expiry ?? '';

    if (activeExpiry && activeExpiry !== chain.expiry) {
      const expRes = await fetchNubraOptionChainWithRetry(
        `${nubraBase}/optionchains/${encodeURIComponent(entry.symbol)}?exchange=${exchange}&expiry=${encodeURIComponent(activeExpiry)}`,
        publicHeaders,
      );
      if (expRes.ok) {
        const expJson = (await expRes.json()) as NubraOptionChainPayload;
        if (expJson.chain) chain = expJson.chain;
      }
    }

    const cpPaise = chain.cp ?? chain.underlying_instrument?.ltp ?? 0;
    const ceList = chain.ce ?? [];
    if (ceList.length === 0 || cpPaise <= 0) return null;

    const spotPrice = Math.round((cpPaise / 100) * 100) / 100;
    const rawAtmPaise = chain.atm && chain.atm > 0 ? chain.atm : cpPaise;

    // Locate exact ATM Call; if exact ATM strike has zero/null LTP, pick nearest strike to ATM
    const sortedByDist = [...ceList].sort(
      (a, b) => Math.abs((a.sp ?? 0) - rawAtmPaise) - Math.abs((b.sp ?? 0) - rawAtmPaise),
    );
    const atmContract =
      sortedByDist.find((c) => typeof c.ltp === 'number' && c.ltp > 0) ?? sortedByDist[0];
    if (!atmContract || !atmContract.sp) return null;

    const atmStrikePrice = Math.round((atmContract.sp / 100) * 100) / 100;
    const atmCallSymbol = atmContract.symbol ?? `${entry.symbol} ${atmStrikePrice} CE`;

    const [yahoo1h, optTs] = await Promise.all([
      fetchYahoo1hLatestWindow(yahooSym),
      hasLiveNubraAuth
        ? fetchNubra1hTimeseriesMetrics(nubraBase, authHeaders, exchange, atmCallSymbol, 'OPT')
        : Promise.resolve(null),
    ]);

    const chainLtp =
      typeof atmContract.ltp === 'number' && atmContract.ltp > 0
        ? Math.round((atmContract.ltp / 100) * 100) / 100
        : null;

    let callPriceEnd = chainLtp ?? optTs?.close ?? null;
    let callPriceStart = optTs?.open ?? null;

    // Fallback when Nubra authenticated 1h Call OHLC is not attached:
    // Reconstruct 1h start price from real Nubra LTP + real Greeks (Delta/Gamma) + live 1h underlying candle
    if (callPriceStart === null && callPriceEnd !== null) {
      const delta = typeof atmContract.delta === 'number' ? atmContract.delta : null;
      const gamma = typeof atmContract.gamma === 'number' ? atmContract.gamma : 0;
      const dS = yahoo1h ? yahoo1h.close - yahoo1h.open : 0;
      if (delta !== null && delta > 0 && Math.abs(dS) > 0.01) {
        const dCall1h = delta * dS + 0.5 * gamma * dS * dS;
        const candidateStart = callPriceEnd - dCall1h;
        if (candidateStart > 0.05) {
          callPriceStart = Math.round(candidateStart * 100) / 100;
        }
      }
      if (
        callPriceStart === null &&
        typeof atmContract.ltpchg === 'number' &&
        1 + atmContract.ltpchg / 100 > 0.05
      ) {
        callPriceStart = Math.max(
          0.05,
          Math.round((callPriceEnd / (1 + atmContract.ltpchg / 100)) * 100) / 100,
        );
      }
    }

    const callPriceChangePercent =
      callPriceStart !== null && callPriceStart > 0 && callPriceEnd !== null
        ? Math.round(((callPriceEnd - callPriceStart) / callPriceStart) * 10000) / 100
        : typeof atmContract.ltpchg === 'number'
          ? Math.round(atmContract.ltpchg * 100) / 100
          : null;

    let atmCallOiChangePercent: number | null = null;
    if (
      optTs &&
      typeof optTs.prevOi === 'number' &&
      optTs.prevOi > 0 &&
      typeof optTs.currOi === 'number'
    ) {
      atmCallOiChangePercent =
        Math.round(((optTs.currOi - optTs.prevOi) / optTs.prevOi) * 10000) / 100;
    } else if (
      typeof atmContract.prev_oi === 'number' &&
      atmContract.prev_oi > 0 &&
      typeof atmContract.oi === 'number'
    ) {
      atmCallOiChangePercent =
        Math.round(((atmContract.oi - atmContract.prev_oi) / atmContract.prev_oi) * 10000) / 100;
    }

    const callGt2 = callPriceChangePercent !== null && callPriceChangePercent > 2;
    const qualifiesShortCovering = callGt2;

    let statusLabel = 'ATM Call OI N/A';
    if (atmCallOiChangePercent !== null) {
      if (atmCallOiChangePercent > 0) {
        statusLabel = 'Call Long Buildup';
      } else if (atmCallOiChangePercent < 0) {
        statusLabel = 'Call Short Covering';
      } else {
        statusLabel = 'No OI Change (0.00%)';
      }
    }

    const intervalLabel = yahoo1h
      ? format1hWindowIst(yahoo1h.timestamp, yahoo1h.timestamp + 60 * 60 * 1000)
      : 'Latest 1h Candle';

    return {
      symbol: entry.symbol,
      companyName: entry.companyName,
      exchange,
      isIndex: Boolean(entry.isIndex),
      expiry: chain.expiry ?? activeExpiry,
      spotPrice,
      atmStrikePrice,
      atmCallSymbol,
      callPriceStart,
      callPriceEnd,
      callPriceChangePercent,
      atmCallOiChangePercent,
      qualifiesShortCovering,
      statusLabel,
      intervalLabel,
      dataSource: optTs ? 'Nubra Broker Live 1h' : 'Nubra Option Chain + 1h Feed',
    };
  } catch (err) {
    console.warn(`[Nubra Call] ${entry.symbol} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getScannedOptionCallShortCovering(
  brokerConnected: boolean,
  filters: OptionShortCoveringFilters = {},
  brokerToken?: string,
): Promise<OptionCallShortCoveringScanResponse> {
  const clock = getNSEMarketClockStatus();
  const baseFnoStocks = NIFTY_500_FNO_UNIVERSE.filter((s) => s.isFno);
  const fullFnoUniverse = [...INDEX_BASKET_UNIVERSE, ...baseFnoStocks];

  if (!brokerConnected) {
    return {
      items: [],
      clock,
      totalUniverseTracked: fullFnoUniverse.length,
      loadedCount: 0,
      qualifyingCount: 0,
      callIncreaseCount: 0,
      callOiDecreaseCount: 0,
      intervalLabel: '1-Hour Candle',
    };
  }

  const nubraBase = getSafeNubraBaseUrl();
  const { authToken, deviceId } = getNubraCredentialsForSession(brokerToken);
  const publicHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
  };
  const authHeaders: Record<string, string> = { ...publicHeaders };
  if (authToken) {
    authHeaders.Authorization = `Bearer ${authToken}`;
    authHeaders['x-device-id'] = deviceId || 'GP-WEB';
  }

  const { isoDate, yyyymmdd, yyyymmddNum } = getTodayIstStrings();
  const { nseFnoAssets } = await fetchNubraRefdataFuturesMap(
    nubraBase,
    isoDate,
    yyyymmddNum,
    publicHeaders,
  );

  // Exclude stocks not currently F&O enabled in Nubra reference data (if refdata loaded)
  const verifiedFnoStocks =
    nseFnoAssets.size > 0
      ? baseFnoStocks.filter((s) => nseFnoAssets.has(s.symbol))
      : baseFnoStocks;

  const universeBySegment =
    filters.segmentFilter === 'indices'
      ? INDEX_BASKET_UNIVERSE
      : filters.segmentFilter === 'stocks'
        ? verifiedFnoStocks
        : [...INDEX_BASKET_UNIVERSE, ...verifiedFnoStocks];

  const query = filters.q?.trim().toUpperCase();
  const targets = query
    ? universeBySegment.filter(
        (s) => s.symbol.includes(query) || s.companyName.toUpperCase().includes(query),
      )
    : universeBySegment;

  const hasLiveNubraAuth = Boolean(authToken);
  const batchSize = 8;
  const scanned: OptionCallShortCoveringRow[] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    if (i > 0) await new Promise((r) => setTimeout(r, 120));
    const batch = targets.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map((entry) =>
        fetchNubraInstrumentCallShortCovering(
          entry,
          nubraBase,
          yyyymmdd,
          publicHeaders,
          authHeaders,
          hasLiveNubraAuth,
        ),
      ),
    );
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value) {
        scanned.push(res.value);
      }
    }
  }

  const qualifyingCount = scanned.filter((r) => r.qualifiesShortCovering).length;
  const callIncreaseCount = scanned.filter(
    (r) => r.callPriceChangePercent !== null && r.callPriceChangePercent > 2,
  ).length;
  const callOiDecreaseCount = scanned.filter(
    (r) => r.atmCallOiChangePercent !== null && r.atmCallOiChangePercent < -1,
  ).length;

  let filtered = scanned;
  if (filters.filterMode !== 'all') {
    // Scan solely on ATM Call > +2%; do not filter on ATM Call OI % change
    filtered = scanned.filter((r) => r.qualifiesShortCovering);
  }

  filtered.sort((a, b) => {
    if (a.qualifiesShortCovering !== b.qualifiesShortCovering) {
      return a.qualifiesShortCovering ? -1 : 1;
    }
    const callDiff = (b.callPriceChangePercent ?? -999) - (a.callPriceChangePercent ?? -999);
    if (Math.abs(callDiff) > 0.01) return callDiff;
    if (a.isIndex !== b.isIndex) return a.isIndex ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });

  const intervalLabel =
    scanned.find((s) => s.intervalLabel !== 'Latest 1h Candle')?.intervalLabel ??
    'Latest 1h Candle';

  return {
    items: filtered,
    clock,
    totalUniverseTracked: INDEX_BASKET_UNIVERSE.length + verifiedFnoStocks.length,
    loadedCount: scanned.length,
    qualifyingCount,
    callIncreaseCount,
    callOiDecreaseCount,
    intervalLabel,
  };
}

async function fetchNubraInstrumentPutShortCovering(
  entry: StockUniverseEntry,
  nubraBase: string,
  yyyymmdd: string,
  publicHeaders: Record<string, string>,
  authHeaders: Record<string, string>,
  hasLiveNubraAuth: boolean,
): Promise<OptionPutShortCoveringRow | null> {
  const exchange: 'NSE' | 'BSE' = entry.symbol === 'SENSEX' ? 'BSE' : 'NSE';
  const yahooSym = entry.yahooSymbol ?? `${entry.symbol}.NS`;

  try {
    const firstRes = await fetchNubraOptionChainWithRetry(
      `${nubraBase}/optionchains/${encodeURIComponent(entry.symbol)}?exchange=${exchange}`,
      publicHeaders,
    );
    if (!firstRes.ok) {
      console.warn(`[Nubra Put] optionchains ${entry.symbol} HTTP ${firstRes.status}`);
      return null;
    }
    const firstJson = (await firstRes.json()) as NubraOptionChainPayload;
    if (!firstJson.chain) return null;

    let chain = firstJson.chain;
    const activeExpiry =
      chain.all_expiries?.find((exp) => exp >= yyyymmdd) ?? chain.expiry ?? '';

    if (activeExpiry && activeExpiry !== chain.expiry) {
      const expRes = await fetchNubraOptionChainWithRetry(
        `${nubraBase}/optionchains/${encodeURIComponent(entry.symbol)}?exchange=${exchange}&expiry=${encodeURIComponent(activeExpiry)}`,
        publicHeaders,
      );
      if (expRes.ok) {
        const expJson = (await expRes.json()) as NubraOptionChainPayload;
        if (expJson.chain) chain = expJson.chain;
      }
    }

    const cpPaise = chain.cp ?? chain.underlying_instrument?.ltp ?? 0;
    const peList = chain.pe ?? [];
    if (peList.length === 0 || cpPaise <= 0) return null;

    const spotPrice = Math.round((cpPaise / 100) * 100) / 100;
    const rawAtmPaise = chain.atm && chain.atm > 0 ? chain.atm : cpPaise;

    // Locate exact ATM Put; if exact ATM strike has zero/null LTP, pick nearest strike to ATM
    const sortedByDist = [...peList].sort(
      (a, b) => Math.abs((a.sp ?? 0) - rawAtmPaise) - Math.abs((b.sp ?? 0) - rawAtmPaise),
    );
    const atmContract =
      sortedByDist.find((p) => typeof p.ltp === 'number' && p.ltp > 0) ?? sortedByDist[0];
    if (!atmContract || !atmContract.sp) return null;

    const atmStrikePrice = Math.round((atmContract.sp / 100) * 100) / 100;
    const atmPutSymbol = atmContract.symbol ?? `${entry.symbol} ${atmStrikePrice} PE`;

    const [yahoo1h, optTs] = await Promise.all([
      fetchYahoo1hLatestWindow(yahooSym),
      hasLiveNubraAuth
        ? fetchNubra1hTimeseriesMetrics(nubraBase, authHeaders, exchange, atmPutSymbol, 'OPT')
        : Promise.resolve(null),
    ]);

    const chainLtp =
      typeof atmContract.ltp === 'number' && atmContract.ltp > 0
        ? Math.round((atmContract.ltp / 100) * 100) / 100
        : null;

    let putPriceEnd = chainLtp ?? optTs?.close ?? null;
    let putPriceStart = optTs?.open ?? null;

    // For Put options delta is negative, so use |delta| > 0 when reconstructing 1h Put start price
    if (putPriceStart === null && putPriceEnd !== null) {
      const delta = typeof atmContract.delta === 'number' ? atmContract.delta : null;
      const gamma = typeof atmContract.gamma === 'number' ? atmContract.gamma : 0;
      const dS = yahoo1h ? yahoo1h.close - yahoo1h.open : 0;
      if (delta !== null && Math.abs(delta) > 0 && Math.abs(dS) > 0.01) {
        const dPut1h = delta * dS + 0.5 * gamma * dS * dS;
        const candidateStart = putPriceEnd - dPut1h;
        if (candidateStart > 0.05) {
          putPriceStart = Math.round(candidateStart * 100) / 100;
        }
      }
      if (
        putPriceStart === null &&
        typeof atmContract.ltpchg === 'number' &&
        1 + atmContract.ltpchg / 100 > 0.05
      ) {
        putPriceStart = Math.max(
          0.05,
          Math.round((putPriceEnd / (1 + atmContract.ltpchg / 100)) * 100) / 100,
        );
      }
    }

    const putPriceChangePercent =
      putPriceStart !== null && putPriceStart > 0 && putPriceEnd !== null
        ? Math.round(((putPriceEnd - putPriceStart) / putPriceStart) * 10000) / 100
        : typeof atmContract.ltpchg === 'number'
          ? Math.round(atmContract.ltpchg * 100) / 100
          : null;

    let atmPutOiChangePercent: number | null = null;
    if (
      optTs &&
      typeof optTs.prevOi === 'number' &&
      optTs.prevOi > 0 &&
      typeof optTs.currOi === 'number'
    ) {
      atmPutOiChangePercent =
        Math.round(((optTs.currOi - optTs.prevOi) / optTs.prevOi) * 10000) / 100;
    } else if (
      typeof atmContract.prev_oi === 'number' &&
      atmContract.prev_oi > 0 &&
      typeof atmContract.oi === 'number'
    ) {
      atmPutOiChangePercent =
        Math.round(((atmContract.oi - atmContract.prev_oi) / atmContract.prev_oi) * 10000) / 100;
    }

    const putGt2 = putPriceChangePercent !== null && putPriceChangePercent > 2;
    const qualifiesShortCovering = putGt2;

    let statusLabel = 'ATM Put OI N/A';
    if (atmPutOiChangePercent !== null) {
      if (atmPutOiChangePercent > 0) {
        statusLabel = 'Put Long Buildup';
      } else if (atmPutOiChangePercent < 0) {
        statusLabel = 'Put Short Covering';
      } else {
        statusLabel = 'No OI Change (0.00%)';
      }
    }

    const intervalLabel = yahoo1h
      ? format1hWindowIst(yahoo1h.timestamp, yahoo1h.timestamp + 60 * 60 * 1000)
      : 'Latest 1h Candle';

    return {
      symbol: entry.symbol,
      companyName: entry.companyName,
      exchange,
      isIndex: Boolean(entry.isIndex),
      expiry: chain.expiry ?? activeExpiry,
      spotPrice,
      atmStrikePrice,
      atmPutSymbol,
      putPriceStart,
      putPriceEnd,
      putPriceChangePercent,
      atmPutOiChangePercent,
      qualifiesShortCovering,
      statusLabel,
      intervalLabel,
      dataSource: optTs ? 'Nubra Broker Live 1h' : 'Nubra Option Chain + 1h Feed',
    };
  } catch (err) {
    console.warn(`[Nubra Put] ${entry.symbol} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getScannedOptionPutShortCovering(
  brokerConnected: boolean,
  filters: OptionPutShortCoveringFilters = {},
  brokerToken?: string,
): Promise<OptionPutShortCoveringScanResponse> {
  const clock = getNSEMarketClockStatus();
  const baseFnoStocks = NIFTY_500_FNO_UNIVERSE.filter((s) => s.isFno);
  const fullFnoUniverse = [...INDEX_BASKET_UNIVERSE, ...baseFnoStocks];

  if (!brokerConnected) {
    return {
      items: [],
      clock,
      totalUniverseTracked: fullFnoUniverse.length,
      loadedCount: 0,
      qualifyingCount: 0,
      putIncreaseCount: 0,
      putOiDecreaseCount: 0,
      intervalLabel: '1-Hour Candle',
    };
  }

  const nubraBase = getSafeNubraBaseUrl();
  const { authToken, deviceId } = getNubraCredentialsForSession(brokerToken);
  const publicHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
  };
  const authHeaders: Record<string, string> = { ...publicHeaders };
  if (authToken) {
    authHeaders.Authorization = `Bearer ${authToken}`;
    authHeaders['x-device-id'] = deviceId || 'GP-WEB';
  }

  const { isoDate, yyyymmdd, yyyymmddNum } = getTodayIstStrings();
  const { nseFnoAssets } = await fetchNubraRefdataFuturesMap(
    nubraBase,
    isoDate,
    yyyymmddNum,
    publicHeaders,
  );

  const verifiedFnoStocks =
    nseFnoAssets.size > 0
      ? baseFnoStocks.filter((s) => nseFnoAssets.has(s.symbol))
      : baseFnoStocks;

  const universeBySegment =
    filters.segmentFilter === 'indices'
      ? INDEX_BASKET_UNIVERSE
      : filters.segmentFilter === 'stocks'
        ? verifiedFnoStocks
        : [...INDEX_BASKET_UNIVERSE, ...verifiedFnoStocks];

  const query = filters.q?.trim().toUpperCase();
  const targets = query
    ? universeBySegment.filter(
        (s) => s.symbol.includes(query) || s.companyName.toUpperCase().includes(query),
      )
    : universeBySegment;

  const hasLiveNubraAuth = Boolean(authToken);
  const batchSize = 8;
  const scanned: OptionPutShortCoveringRow[] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    if (i > 0) await new Promise((r) => setTimeout(r, 120));
    const batch = targets.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map((entry) =>
        fetchNubraInstrumentPutShortCovering(
          entry,
          nubraBase,
          yyyymmdd,
          publicHeaders,
          authHeaders,
          hasLiveNubraAuth,
        ),
      ),
    );
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value) {
        scanned.push(res.value);
      }
    }
  }

  const qualifyingCount = scanned.filter((r) => r.qualifiesShortCovering).length;
  const putIncreaseCount = scanned.filter(
    (r) => r.putPriceChangePercent !== null && r.putPriceChangePercent > 2,
  ).length;
  const putOiDecreaseCount = scanned.filter(
    (r) => r.atmPutOiChangePercent !== null && r.atmPutOiChangePercent < -1,
  ).length;

  let filtered = scanned;
  if (filters.filterMode !== 'all') {
    // Scan solely on ATM Put > +2%; do not filter on ATM Put OI % change
    filtered = scanned.filter((r) => r.qualifiesShortCovering);
  }

  filtered.sort((a, b) => {
    if (a.qualifiesShortCovering !== b.qualifiesShortCovering) {
      return a.qualifiesShortCovering ? -1 : 1;
    }
    const putDiff = (b.putPriceChangePercent ?? -999) - (a.putPriceChangePercent ?? -999);
    if (Math.abs(putDiff) > 0.01) return putDiff;
    if (a.isIndex !== b.isIndex) return a.isIndex ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });

  const intervalLabel =
    scanned.find((s) => s.intervalLabel !== 'Latest 1h Candle')?.intervalLabel ??
    'Latest 1h Candle';

  return {
    items: filtered,
    clock,
    totalUniverseTracked: INDEX_BASKET_UNIVERSE.length + verifiedFnoStocks.length,
    loadedCount: scanned.length,
    qualifyingCount,
    putIncreaseCount,
    putOiDecreaseCount,
    intervalLabel,
  };
}
