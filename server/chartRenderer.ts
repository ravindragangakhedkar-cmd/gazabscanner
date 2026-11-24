import { deflateSync } from 'node:zlib';
import type { ChartSeriesPoint } from '../shared/types.ts';

export interface AlertChartInput {
  symbol: string;
  companyName: string;
  isIndex: boolean;
  marketBiasDirection: 'Bullish' | 'Bearish';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  spotPrice: number;
  chartSeries: ChartSeriesPoint[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderAlertChartSvg(input: AlertChartInput): string {
  const series = input.chartSeries.slice(-55);
  const width = 820;
  const height = 400;
  const padLeft = 24;
  const padRight = 88;
  const padTop = 44;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const unit = input.isIndex ? '' : '₹';

  if (series.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#020617"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="14">${escapeXml(input.symbol)} Chart</text></svg>`;
  }

  const allValues: number[] = [
    input.entryPrice,
    input.targetPrice,
    input.stopLoss,
    input.spotPrice,
  ];
  for (const pt of series) {
    allValues.push(pt.high, pt.low, pt.mbUpper, pt.mbLower, pt.twinFilter, pt.ema10, pt.ema20);
  }
  const minP = Math.min(...allValues) * 0.992;
  const maxP = Math.max(...allValues) * 1.008;
  const span = Math.max(maxP - minP, 0.01);
  const yFor = (p: number) => padTop + ((maxP - p) / span) * plotH;
  const stepX = plotW / Math.max(series.length, 1);
  const candleW = Math.max(3, Math.min(9, stepX * 0.62));

  const mbTop = series
    .map((pt, i) => `${(padLeft + i * stepX + stepX / 2).toFixed(1)},${yFor(pt.mbUpper).toFixed(1)}`)
    .join(' ');
  const mbBottom = [...series]
    .reverse()
    .map((pt, revIdx) => {
      const i = series.length - 1 - revIdx;
      return `${(padLeft + i * stepX + stepX / 2).toFixed(1)},${yFor(pt.mbLower).toFixed(1)}`;
    })
    .join(' ');

  const twinPath = series
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${(padLeft + i * stepX + stepX / 2).toFixed(1)} ${yFor(pt.twinFilter).toFixed(1)}`,
    )
    .join(' ');

  const ema10Path = series
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${(padLeft + i * stepX + stepX / 2).toFixed(1)} ${yFor(pt.ema10).toFixed(1)}`,
    )
    .join(' ');

  const ema20Path = series
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${(padLeft + i * stepX + stepX / 2).toFixed(1)} ${yFor(pt.ema20).toFixed(1)}`,
    )
    .join(' ');

  const isBullBias = input.marketBiasDirection === 'Bullish';
  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const val = maxP - r * span;
    const y = yFor(val);
    return `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#1e293b" stroke-width="1"/><text x="${width - padRight + 8}" y="${(y + 4).toFixed(1)}" fill="#94a3b8" font-family="monospace" font-size="11">${escapeXml(unit)}${val.toFixed(1)}</text>`;
  });

  const candles = series
    .map((pt, i) => {
      const cx = padLeft + i * stepX + stepX / 2;
      const up = pt.close >= pt.open;
      const color = up ? '#10b981' : '#f43f5e';
      const top = yFor(Math.max(pt.open, pt.close));
      const bot = yFor(Math.min(pt.open, pt.close));
      const h = Math.max(2, bot - top);
      return `<line x1="${cx.toFixed(1)}" y1="${yFor(pt.high).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yFor(pt.low).toFixed(1)}" stroke="${color}" stroke-width="1.2"/><rect x="${(cx - candleW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${candleW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="1"/>`;
    })
    .join('');

  const dateTicks = [0, Math.floor(series.length / 2), series.length - 1]
    .map((idx) => {
      const pt = series[idx];
      if (!pt) return '';
      const x = padLeft + idx * stepX + stepX / 2;
      return `<text x="${x.toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="#64748b" font-family="monospace" font-size="10">${escapeXml(pt.date)}</text>`;
    })
    .join('');

  const yEntry = yFor(input.entryPrice);
  const yTarget = yFor(input.targetPrice);
  const yStop = yFor(input.stopLoss);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#020617" rx="10"/>
  <text x="${padLeft}" y="25" fill="#f8fafc" font-family="sans-serif" font-weight="700" font-size="14">${escapeXml(input.symbol)} · ${escapeXml(input.companyName)}</text>
  <text x="${width - padRight}" y="25" text-anchor="end" fill="#38bdf8" font-family="monospace" font-size="12">Spot ${escapeXml(unit)}${input.spotPrice.toFixed(2)}</text>
  ${gridTicks.join('')}
  <polygon points="${mbTop} ${mbBottom}" fill="${isBullBias ? 'rgba(16,185,129,0.18)' : 'rgba(244,63,94,0.18)'}" stroke="${isBullBias ? 'rgba(16,185,129,0.5)' : 'rgba(244,63,94,0.5)'}" stroke-width="1"/>
  <line x1="${padLeft}" y1="${yTarget.toFixed(1)}" x2="${width - padRight}" y2="${yTarget.toFixed(1)}" stroke="#10b981" stroke-dasharray="5 4" stroke-width="1.3"/>
  <text x="${padLeft + 6}" y="${(yTarget - 4).toFixed(1)}" fill="#34d399" font-family="monospace" font-size="10">TARGET ${escapeXml(unit)}${input.targetPrice.toFixed(2)}</text>
  <line x1="${padLeft}" y1="${yEntry.toFixed(1)}" x2="${width - padRight}" y2="${yEntry.toFixed(1)}" stroke="#f59e0b" stroke-dasharray="3 3" stroke-width="1.3"/>
  <text x="${padLeft + 6}" y="${(yEntry - 4).toFixed(1)}" fill="#fbbf24" font-family="monospace" font-size="10">ENTRY ${escapeXml(unit)}${input.entryPrice.toFixed(2)}</text>
  <line x1="${padLeft}" y1="${yStop.toFixed(1)}" x2="${width - padRight}" y2="${yStop.toFixed(1)}" stroke="#f43f5e" stroke-dasharray="5 4" stroke-width="1.3"/>
  <text x="${padLeft + 6}" y="${(yStop + 12).toFixed(1)}" fill="#fb7185" font-family="monospace" font-size="10">STOP LOSS ${escapeXml(unit)}${input.stopLoss.toFixed(2)}</text>
  ${candles}
  <path d="${twinPath}" fill="none" stroke="#38bdf8" stroke-width="1.8"/>
  <path d="${ema10Path}" fill="none" stroke="#f59e0b" stroke-width="1.6"/>
  <path d="${ema20Path}" fill="none" stroke="#e879f9" stroke-width="1.6"/>
  <text x="${padLeft + 250}" y="25" fill="#f59e0b" font-family="monospace" font-size="11">EMA(10) ${escapeXml(unit)}${series[series.length - 1].ema10.toFixed(1)}</text>
  <text x="${padLeft + 390}" y="25" fill="#e879f9" font-family="monospace" font-size="11">EMA(20) ${escapeXml(unit)}${series[series.length - 1].ema20.toFixed(1)}</text>
  ${dateTicks}
</svg>`;
}

// ---------------------------------------------------------------------------
// Pure-Node PNG Renderer (for inline email attachments across all mail clients)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

const FONT_3X5: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '011', '001'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '.': ['000', '000', '000', '000', '010'],
  ':': ['000', '010', '000', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  ' ': ['000', '000', '000', '000', '000'],
};

export function renderAlertChartPng(input: AlertChartInput): Buffer {
  const width = 760;
  const height = 380;
  const rgba = new Uint8Array(width * height * 4);

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || xi >= width || yi < 0 || yi >= height) return;
    const idx = (yi * width + xi) * 4;
    if (a >= 255) {
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    } else {
      const alpha = a / 255;
      rgba[idx] = Math.round(rgba[idx] * (1 - alpha) + r * alpha);
      rgba[idx + 1] = Math.round(rgba[idx + 1] * (1 - alpha) + g * alpha);
      rgba[idx + 2] = Math.round(rgba[idx + 2] * (1 - alpha) + b * alpha);
      rgba[idx + 3] = 255;
    }
  };

  const fillRect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255) => {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        setPixel(xx, yy, r, g, b, a);
      }
    }
  };

  const drawLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    g: number,
    b: number,
    dashed = false,
  ) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      if (dashed && Math.floor(s / 5) % 2 === 1) continue;
      const t = s / steps;
      setPixel(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, g, b);
    }
  };

  const drawText = (text: string, x: number, y: number, scale: number, r: number, g: number, b: number) => {
    const upper = text.toUpperCase();
    let cursorX = x;
    for (const ch of upper) {
      const glyph = FONT_3X5[ch];
      if (glyph) {
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 3; col++) {
            if (glyph[row][col] === '1') {
              fillRect(cursorX + col * scale, y + row * scale, scale, scale, r, g, b);
            }
          }
        }
      }
      cursorX += 4 * scale;
    }
  };

  // Dark canvas background (#020617)
  fillRect(0, 0, width, height, 2, 6, 23);

  const series = input.chartSeries.slice(-55);
  const padLeft = 22;
  const padRight = 84;
  const padTop = 38;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  drawText(`${input.symbol} SPOT ${input.spotPrice.toFixed(2)}`, padLeft, 12, 2, 248, 250, 252);

  if (series.length > 0) {
    const allValues: number[] = [
      input.entryPrice,
      input.targetPrice,
      input.stopLoss,
      input.spotPrice,
    ];
    for (const pt of series) {
      allValues.push(pt.high, pt.low, pt.mbUpper, pt.mbLower, pt.twinFilter, pt.ema10, pt.ema20);
    }
    const minP = Math.min(...allValues) * 0.992;
    const maxP = Math.max(...allValues) * 1.008;
    const span = Math.max(maxP - minP, 0.01);
    const yFor = (p: number) => padTop + ((maxP - p) / span) * plotH;
    const stepX = plotW / Math.max(series.length, 1);
    const candleW = Math.max(3, Math.min(9, stepX * 0.62));

    // Horizontal gridlines & Y ticks
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const val = maxP - r * span;
      const y = yFor(val);
      drawLine(padLeft, y, width - padRight, y, 30, 41, 59);
      drawText(val.toFixed(1), width - padRight + 6, y - 5, 2, 148, 163, 184);
    }

    // Market Bias shaded band
    const isBullBias = input.marketBiasDirection === 'Bullish';
    for (let i = 0; i < series.length; i++) {
      const x = padLeft + i * stepX;
      const yTop = yFor(series[i].mbUpper);
      const yBot = yFor(series[i].mbLower);
      fillRect(
        x,
        Math.min(yTop, yBot),
        Math.max(2, stepX),
        Math.max(1, Math.abs(yBot - yTop)),
        isBullBias ? 16 : 244,
        isBullBias ? 185 : 63,
        isBullBias ? 129 : 94,
        46,
      );
    }

    // Target / Entry / Stop Loss dashed levels
    const yT = yFor(input.targetPrice);
    const yE = yFor(input.entryPrice);
    const yS = yFor(input.stopLoss);
    drawLine(padLeft, yT, width - padRight, yT, 16, 185, 129, true);
    drawText(`TGT ${input.targetPrice.toFixed(2)}`, padLeft + 4, yT - 12, 2, 52, 211, 153);
    drawLine(padLeft, yE, width - padRight, yE, 245, 158, 11, true);
    drawText(`ENT ${input.entryPrice.toFixed(2)}`, padLeft + 4, yE - 12, 2, 251, 191, 36);
    drawLine(padLeft, yS, width - padRight, yS, 244, 63, 94, true);
    drawText(`SL ${input.stopLoss.toFixed(2)}`, padLeft + 4, yS + 4, 2, 251, 113, 133);

    // Candlesticks
    for (let i = 0; i < series.length; i++) {
      const pt = series[i];
      const cx = padLeft + i * stepX + stepX / 2;
      const up = pt.close >= pt.open;
      const [r, g, b] = up ? [16, 185, 129] : [244, 63, 94];
      drawLine(cx, yFor(pt.high), cx, yFor(pt.low), r, g, b);
      const bodyTop = yFor(Math.max(pt.open, pt.close));
      const bodyBot = yFor(Math.min(pt.open, pt.close));
      fillRect(cx - candleW / 2, bodyTop, candleW, Math.max(2, bodyBot - bodyTop), r, g, b);
    }

    // Twin Range Filter cyan line + Daily EMA(10) amber + Daily EMA(20) violet
    for (let i = 1; i < series.length; i++) {
      const x0 = padLeft + (i - 1) * stepX + stepX / 2;
      const x1 = padLeft + i * stepX + stepX / 2;
      drawLine(x0, yFor(series[i - 1].twinFilter), x1, yFor(series[i].twinFilter), 56, 189, 248);
      drawLine(x0, yFor(series[i - 1].ema10), x1, yFor(series[i].ema10), 245, 158, 11);
      drawLine(x0, yFor(series[i - 1].ema20), x1, yFor(series[i].ema20), 232, 121, 249);
    }
    const lastPt = series[series.length - 1];
    drawText(`EMA10 ${lastPt.ema10.toFixed(1)} EMA20 ${lastPt.ema20.toFixed(1)}`, padLeft + 260, 12, 2, 245, 158, 11);
  }

  // Encode raw scanlines (1 filter byte + RGBA bytes per row)
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    const rowSlice = rgba.subarray(y * width * 4, (y + 1) * width * 4);
    raw.set(rowSlice, y * stride + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 6 });

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}
