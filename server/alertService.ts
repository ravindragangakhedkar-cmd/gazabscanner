import nodemailer from 'nodemailer';
import type express from 'express';
import {
  OFFICIAL_MERCHANT_EMAIL,
  type AlertChannelDelivery,
  type AnalyzedStock,
  type ConfluenceAlertRecord,
  type MarketClockStatus,
} from '../shared/types.ts';
import { renderAlertChartPng, renderAlertChartSvg } from './chartRenderer.ts';

export const ALERT_TEMPLATE_SUBJECT = 'Alert Message for Stock or Index';
export const ALERT_SMS_DISPLAY = '+91 - XXXXXXXXXX';
export const ALERT_SMS_E164 = '+91XXXXXXXXXX';
export const ALERT_EMAIL_TO = OFFICIAL_MERCHANT_EMAIL; // YOUR_SUPPORT_EMAIL@example.com

const MAX_ALERT_HISTORY = 100;
const dispatchedAlertKeys = new Set<string>();
const alertHistory: ConfluenceAlertRecord[] = [];
const alertChartAssets = new Map<string, { svg: string; png: Buffer }>();
const sseSubscribers = new Set<express.Response>();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatIstTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
  return `${parts} IST`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAppBaseUrl(): string {
  const raw = (process.env.APP_URL || process.env.VITE_APP_URL || '').trim().replace(/\/+$/, '');
  if (!raw || raw === 'MY_APP_URL') return '';
  return raw;
}

export function buildAlertChartUrl(alertId: string): string {
  const base = getAppBaseUrl();
  return base ? `${base}/api/alerts/chart/${encodeURIComponent(alertId)}` : `/api/alerts/chart/${encodeURIComponent(alertId)}`;
}

function isSafeExternalWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function buildAlertSubject(stock: Pick<AnalyzedStock, 'symbol' | 'companyName' | 'isIndex'>): string {
  const kind = stock.isIndex ? 'Index' : 'Stock';
  return `Alert Message for ${kind}: ${stock.symbol} (${stock.companyName})`;
}

export function resolveAlertTradeLevels(
  stock: AnalyzedStock,
  spotPrice: number,
  twinRangeSignal: 'Long' | 'Short',
): { entryPrice: number; targetPrice: number; stopLoss: number } {
  const entryPrice = round2(spotPrice);
  const rawRisk = Math.abs(stock.entryPrice - stock.stopLoss);
  const minRisk = Math.max(spotPrice * 0.008, 0.5);
  const risk = Math.max(rawRisk, minRisk);

  if (twinRangeSignal === 'Short') {
    const candidateSl =
      stock.stopLoss > spotPrice ? stock.stopLoss : spotPrice + risk;
    const stopLoss = round2(Math.max(candidateSl, spotPrice + minRisk));
    const effectiveRisk = Math.max(stopLoss - entryPrice, minRisk);
    const targetPrice = round2(Math.max(0.05, entryPrice - effectiveRisk * 2));
    return { entryPrice, targetPrice, stopLoss };
  }

  const candidateSl =
    stock.stopLoss < spotPrice ? stock.stopLoss : spotPrice - risk;
  const stopLoss = round2(Math.max(0.05, Math.min(candidateSl, spotPrice - minRisk)));
  const effectiveRisk = Math.max(entryPrice - stopLoss, minRisk);
  const targetPrice = round2(entryPrice + effectiveRisk * 2);
  return { entryPrice, targetPrice, stopLoss };
}

export function buildConfluenceAlertMessage(
  stock: AnalyzedStock,
  matchedAtIst: string,
  chartUrl: string,
): {
  subject: string;
  body: string;
  marketBiasStatus: string;
  marketBiasClassification: 'Trend Continuation' | 'Trend Reversal';
  twinRangeSignal: 'Long' | 'Short';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
} {
  const intraday = stock.intraday1h;
  const twinRangeSignal: 'Long' | 'Short' =
    intraday?.twinRange1hFreshSignal ??
    stock.twinRangeFreshSignal ??
    (stock.twinRangeSignal === 'SELL' ? 'Short' : 'Long');

  const spotPrice = round2(intraday?.spotPrice1h ?? stock.currentPrice);
  const bbwpVal = round2(intraday?.bbwp1h ?? stock.bbwp);
  const bbwpStat = intraday?.bbwp1hStatus ?? stock.bbwpStatus;
  const bbwpSlope = intraday?.bbwp1hSlope ?? stock.bbwpSlope;
  const pvoVal = round2(intraday?.pvo1h ?? stock.pvo);

  // Market Bias CEREBR: Trend Continuation when signal aligns with Market Bias direction, Trend Reversal when opposite
  const alignedWithBias =
    (stock.marketBiasDirection === 'Bullish' && twinRangeSignal === 'Long') ||
    (stock.marketBiasDirection === 'Bearish' && twinRangeSignal === 'Short');
  const marketBiasClassification: 'Trend Continuation' | 'Trend Reversal' = alignedWithBias
    ? 'Trend Continuation'
    : 'Trend Reversal';
  const marketBiasStatus = `${marketBiasClassification} (${stock.marketBiasDirection} Market Bias CEREBR)`;

  const { entryPrice, targetPrice, stopLoss } = resolveAlertTradeLevels(
    stock,
    spotPrice,
    twinRangeSignal,
  );

  const kind = stock.isIndex ? 'Index' : 'Stock';
  const unit = stock.isIndex ? '' : '₹';
  const unitSuffix = stock.isIndex ? ' pts' : '';

  const subject = buildAlertSubject(stock);
  const body = [
    `1. Stock or Index: ${kind} - ${stock.symbol} (${stock.companyName})`,
    `2. ${kind} Spot Price: ${unit}${spotPrice.toFixed(2)}${unitSuffix}`,
    `3. Market Bias CEREBR: ${marketBiasClassification} (${stock.marketBiasDirection})`,
    `4. Twin Range Signal: ${twinRangeSignal}`,
    `5. BBWP Value and Status: ${bbwpVal.toFixed(2)}% - ${bbwpStat} (${bbwpSlope} Slope)`,
    `6. PVO Value: ${pvoVal >= 0 ? '+' : ''}${pvoVal.toFixed(2)}`,
    `7. Suggested Entry, Target Price & Stop Loss: Entry ${unit}${entryPrice.toFixed(2)}${unitSuffix} | Target ${unit}${targetPrice.toFixed(2)}${unitSuffix} | Stop Loss ${unit}${stopLoss.toFixed(2)}${unitSuffix}`,
    `8. Chart of the ${kind}: ${chartUrl}`,
    `9. Trigger Generated Time (IST): ${matchedAtIst}`,
  ].join('\n');

  return {
    subject,
    body,
    marketBiasStatus,
    marketBiasClassification,
    twinRangeSignal,
    entryPrice,
    targetPrice,
    stopLoss,
  };
}

function buildConfluenceAlertHtml(record: ConfluenceAlertRecord): string {
  const kind = record.isIndex ? 'Index' : 'Stock';
  const unit = record.isIndex ? '' : '₹';
  const unitSuffix = record.isIndex ? ' pts' : '';
  const pvoFormatted = `${record.pvoValue >= 0 ? '+' : ''}${record.pvoValue.toFixed(2)}`;

  const rows: Array<[string, string]> = [
    ['1. Stock or Index', `${kind} - ${record.symbol} (${record.companyName})`],
    ['2. ' + kind + ' Spot Price', `${unit}${record.activePrice.toFixed(2)}${unitSuffix}`],
    ['3. Market Bias CEREBR', `${record.marketBiasClassification}`],
    ['4. Twin Range Signal', `${record.twinRangeSignal}`],
    ['5. BBWP Value and Status', `${record.bbwpValue.toFixed(2)}% - ${record.bbwpStatus} (${record.bbwpSlope} Slope)`],
    ['6. PVO Value', pvoFormatted],
    [
      '7. Suggested Entry, Target Price & Stop Loss',
      `Entry ${unit}${record.entryPrice.toFixed(2)}${unitSuffix} | Target ${unit}${record.targetPrice.toFixed(2)}${unitSuffix} | Stop Loss ${unit}${record.stopLoss.toFixed(2)}${unitSuffix}`,
    ],
    ['9. Trigger Generated Time (IST)', record.matchedAtIst],
  ];

  const rowsHtml = rows
    .slice(0, 7)
    .map(
      ([label, val]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#1e293b;">${escapeHtml(val)}</td></tr>`,
    )
    .join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;">
  <div style="background:#0f172a;color:#ffffff;padding:14px 18px;font-size:15px;font-weight:700;">
    ${escapeHtml(record.subject)}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${rowsHtml}
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;vertical-align:top;">8. Chart of the ${escapeHtml(kind)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#1e293b;">
        <img src="cid:alert-chart" alt="${escapeHtml(record.symbol)} Chart" style="width:100%;max-width:680px;height:auto;border-radius:6px;display:block;margin-bottom:6px;" />
        <a href="${escapeHtml(record.chartUrl)}" style="color:#0369a1;font-size:12px;">Open Chart (${escapeHtml(record.symbol)})</a>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#0f172a;">9. Trigger Generated Time (IST)</td>
      <td style="padding:8px 12px;color:#1e293b;">${escapeHtml(record.matchedAtIst)}</td>
    </tr>
  </table>
</div>`;
}

async function sendEmailAlert(
  record: ConfluenceAlertRecord,
  chartAssets?: { svg: string; png: Buffer },
): Promise<AlertChannelDelivery> {
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim() || (smtpUser && smtpPass ? 'smtp.gmail.com' : '');
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser || ALERT_EMAIL_TO;
  const html = buildConfluenceAlertHtml(record);

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      await transporter.sendMail({
        from: `"GazabPaisa Alerts" <${smtpFrom}>`,
        to: ALERT_EMAIL_TO,
        subject: record.subject,
        text: record.body,
        html,
        attachments: chartAssets
          ? [
              {
                filename: `${record.symbol}-chart.png`,
                content: chartAssets.png,
                cid: 'alert-chart',
                contentType: 'image/png',
              },
              {
                filename: `${record.symbol}-chart.svg`,
                content: chartAssets.svg,
                contentType: 'image/svg+xml',
              },
            ]
          : undefined,
      });
      return {
        status: 'sent',
        provider: 'SMTP',
        detail: `Delivered immediately to ${ALERT_EMAIL_TO}.`,
      };
    } catch (err) {
      return {
        status: 'failed',
        provider: 'SMTP',
        detail: err instanceof Error ? err.message : 'SMTP delivery failed.',
      };
    }
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SMTP_FROM?.trim() || 'YOUR_ALERTS_EMAIL@example.com',
          to: [ALERT_EMAIL_TO],
          subject: record.subject,
          text: record.body,
          html,
          attachments: chartAssets
            ? [
                {
                  filename: `${record.symbol}-chart.png`,
                  content: chartAssets.png.toString('base64'),
                  content_id: 'alert-chart',
                },
                {
                  filename: `${record.symbol}-chart.svg`,
                  content: Buffer.from(chartAssets.svg, 'utf8').toString('base64'),
                },
              ]
            : undefined,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const errText = await res.text();
        return {
          status: 'failed',
          provider: 'Resend',
          detail: `HTTP ${res.status}: ${errText.slice(0, 140)}`,
        };
      }
      return {
        status: 'sent',
        provider: 'Resend',
        detail: `Delivered immediately to ${ALERT_EMAIL_TO}.`,
      };
    } catch (err) {
      return {
        status: 'failed',
        provider: 'Resend',
        detail: err instanceof Error ? err.message : 'Resend delivery failed.',
      };
    }
  }

  const emailWebhook = process.env.ALERT_EMAIL_WEBHOOK_URL?.trim();
  if (emailWebhook) {
    if (!isSafeExternalWebhookUrl(emailWebhook)) {
      return {
        status: 'failed',
        provider: 'Email Webhook',
        detail: 'Blocked unsafe or non-HTTP(S) email webhook URL.',
      };
    }
    try {
      const res = await fetch(emailWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: ALERT_EMAIL_TO,
          subject: record.subject,
          body: record.body,
          html,
          chartUrl: record.chartUrl,
          symbol: record.symbol,
          scanner: record.scanner,
          matchedAtIso: record.matchedAtIso,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return {
          status: 'failed',
          provider: 'Email Webhook',
          detail: `Webhook returned HTTP ${res.status}.`,
        };
      }
      return {
        status: 'sent',
        provider: 'Email Webhook',
        detail: `Delivered immediately to ${ALERT_EMAIL_TO}.`,
      };
    } catch (err) {
      return {
        status: 'failed',
        provider: 'Email Webhook',
        detail: err instanceof Error ? err.message : 'Email webhook error.',
      };
    }
  }

  return {
    status: 'pending-config',
    provider: 'Server Email Relay',
    detail: `Ready for ${ALERT_EMAIL_TO} (configure SMTP_USER/SMTP_PASS, RESEND_API_KEY, or ALERT_EMAIL_WEBHOOK_URL in Secrets).`,
  };
}

async function sendSmsAlert(record: ConfluenceAlertRecord): Promise<AlertChannelDelivery> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const twilioToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const twilioFrom = process.env.TWILIO_FROM_NUMBER?.trim();

  const smsText = `${record.subject}\n${record.body}`;

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const form = new URLSearchParams({
        To: ALERT_SMS_E164,
        From: twilioFrom,
        Body: smsText,
      });
      const authHeader = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        return {
          status: 'failed',
          provider: 'Twilio SMS',
          detail: `HTTP ${res.status}: ${errText.slice(0, 140)}`,
        };
      }
      return {
        status: 'sent',
        provider: 'Twilio SMS',
        detail: `Dispatched immediately to ${ALERT_SMS_DISPLAY}.`,
      };
    } catch (err) {
      return {
        status: 'failed',
        provider: 'Twilio SMS',
        detail: err instanceof Error ? err.message : 'Twilio dispatch failed.',
      };
    }
  }

  const smsWebhook = process.env.ALERT_SMS_WEBHOOK_URL?.trim();
  if (smsWebhook) {
    if (!isSafeExternalWebhookUrl(smsWebhook)) {
      return {
        status: 'failed',
        provider: 'SMS Webhook',
        detail: 'Blocked unsafe or non-HTTP(S) SMS webhook URL.',
      };
    }
    try {
      const apiKey = process.env.ALERT_SMS_API_KEY?.trim();
      const res = await fetch(smsWebhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          to: ALERT_SMS_E164,
          displayPhone: ALERT_SMS_DISPLAY,
          subject: record.subject,
          message: record.body,
          chartUrl: record.chartUrl,
          symbol: record.symbol,
          scanner: record.scanner,
          matchedAtIso: record.matchedAtIso,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return {
          status: 'failed',
          provider: 'SMS Webhook',
          detail: `Webhook returned HTTP ${res.status}.`,
        };
      }
      return {
        status: 'sent',
        provider: 'SMS Webhook',
        detail: `Dispatched immediately to ${ALERT_SMS_DISPLAY}.`,
      };
    } catch (err) {
      return {
        status: 'failed',
        provider: 'SMS Webhook',
        detail: err instanceof Error ? err.message : 'SMS webhook error.',
      };
    }
  }

  return {
    status: 'pending-config',
    provider: 'Server SMS Gateway',
    detail: `Ready for ${ALERT_SMS_DISPLAY} (configure TWILIO_* or ALERT_SMS_WEBHOOK_URL in Secrets).`,
  };
}

function broadcastAlertSse(record: ConfluenceAlertRecord): void {
  const payload = `event: confluence-alert\ndata: ${JSON.stringify(record)}\n\n`;
  for (const res of sseSubscribers) {
    try {
      res.write(payload);
    } catch {
      sseSubscribers.delete(res);
    }
  }
}

async function dispatchRecordNow(
  record: ConfluenceAlertRecord,
  chartAssets?: { svg: string; png: Buffer },
): Promise<ConfluenceAlertRecord> {
  alertHistory.unshift(record);
  if (alertHistory.length > MAX_ALERT_HISTORY) {
    const removed = alertHistory.splice(MAX_ALERT_HISTORY);
    for (const old of removed) {
      alertChartAssets.delete(old.id);
    }
  }
  broadcastAlertSse(record);

  const [smsDelivery, emailDelivery] = await Promise.all([
    sendSmsAlert(record),
    sendEmailAlert(record, chartAssets),
  ]);

  record.smsDelivery = smsDelivery;
  record.emailDelivery = emailDelivery;
  broadcastAlertSse(record);

  console.log(
    `[Confluence Alert] ${record.subject} (${record.twinRangeSignal}) | SMS: ${smsDelivery.status} | Email: ${emailDelivery.status}`,
  );

  return record;
}

export function evaluateAndDispatchConfluenceAlerts(
  scanner: 'scanner1' | 'scanner3',
  items: AnalyzedStock[],
  clock: MarketClockStatus,
): void {
  // Alert message feature works strictly during intraday market hours
  if (!clock.isOpen) return;

  for (const stock of items) {
    const intraday = stock.intraday1h;
    if (
      !stock.confluenceMatched ||
      !intraday?.confluenceMatched ||
      !intraday.twinRange1hFreshSignal
    ) {
      continue;
    }

    // Strictly one alert per stock or index — never re-alert on re-entries or subsequent candles
    const dedupKey = `${scanner}:${stock.symbol}`;
    if (dispatchedAlertKeys.has(dedupKey)) continue;
    dispatchedAlertKeys.add(dedupKey);

    const now = new Date();
    const recordId = `${scanner}-${stock.symbol}-${now.getTime()}`;
    const matchedAtIst = formatIstTimestamp(now);
    const chartUrl = buildAlertChartUrl(recordId);

    const {
      subject,
      body,
      marketBiasStatus,
      marketBiasClassification,
      twinRangeSignal,
      entryPrice,
      targetPrice,
      stopLoss,
    } = buildConfluenceAlertMessage(stock, matchedAtIst, chartUrl);

    const chartSeriesSlice = stock.chartSeries.slice(-55);
    const chartInput = {
      symbol: stock.symbol,
      companyName: stock.companyName,
      isIndex: Boolean(stock.isIndex),
      marketBiasDirection: stock.marketBiasDirection,
      entryPrice,
      targetPrice,
      stopLoss,
      spotPrice: intraday.spotPrice1h,
      chartSeries: chartSeriesSlice,
    };

    const chartAssets = {
      svg: renderAlertChartSvg(chartInput),
      png: renderAlertChartPng(chartInput),
    };
    alertChartAssets.set(recordId, chartAssets);

    const record: ConfluenceAlertRecord = {
      id: recordId,
      scanner,
      symbol: stock.symbol,
      companyName: stock.companyName,
      isIndex: Boolean(stock.isIndex),
      candle1hIso: intraday.candle1hIso,
      candle1hIst: intraday.candle1hIst,
      matchedAtIso: now.toISOString(),
      matchedAtIst,
      subject,
      body,
      marketBiasStatus,
      marketBiasClassification,
      twinRangeSignal,
      bbwpValue: intraday.bbwp1h,
      bbwpStatus: intraday.bbwp1hStatus,
      bbwpSlope: intraday.bbwp1hSlope,
      pvoValue: intraday.pvo1h,
      activePrice: intraday.spotPrice1h,
      entryPrice,
      targetPrice,
      stopLoss,
      chartUrl,
      chartSnapshot: {
        symbol: stock.symbol,
        companyName: stock.companyName,
        isIndex: Boolean(stock.isIndex),
        marketBiasDirection: stock.marketBiasDirection,
        entryPrice,
        targetPrice,
        stopLoss,
        weeklyPivots: stock.weeklyPivots,
        chartSeries: chartSeriesSlice,
      },
      smsTarget: ALERT_SMS_DISPLAY,
      emailTarget: ALERT_EMAIL_TO,
      smsDelivery: {
        status: 'pending-config',
        provider: 'Dispatching...',
        detail: `Dispatching to ${ALERT_SMS_DISPLAY}...`,
      },
      emailDelivery: {
        status: 'pending-config',
        provider: 'Dispatching...',
        detail: `Dispatching to ${ALERT_EMAIL_TO}...`,
      },
    };

    // Zero-lag asynchronous immediate dispatch
    void dispatchRecordNow(record, chartAssets);
  }
}

export function getAlertChartAsset(rawId: string): {
  type: 'svg' | 'png';
  data: string | Buffer;
} | null {
  const isPng = rawId.endsWith('.png');
  const isSvg = rawId.endsWith('.svg');
  const cleanId = rawId.replace(/\.(png|svg)$/i, '');
  const asset = alertChartAssets.get(cleanId);
  if (!asset) return null;
  if (isPng) return { type: 'png', data: asset.png };
  if (isSvg) return { type: 'svg', data: asset.svg };
  return { type: 'svg', data: asset.svg };
}

export function getAlertHistory(scanner?: 'scanner1' | 'scanner3'): ConfluenceAlertRecord[] {
  if (!scanner) return [...alertHistory];
  return alertHistory.filter((item) => item.scanner === scanner);
}

export function getAlertChannelStatus() {
  const emailConfigured = Boolean(
    (process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()) ||
      process.env.RESEND_API_KEY?.trim() ||
      process.env.ALERT_EMAIL_WEBHOOK_URL?.trim(),
  );
  const smsConfigured = Boolean(
    (process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim()) ||
      process.env.ALERT_SMS_WEBHOOK_URL?.trim(),
  );

  return {
    smsTarget: ALERT_SMS_DISPLAY,
    emailTarget: ALERT_EMAIL_TO,
    subject: ALERT_TEMPLATE_SUBJECT,
    emailConfigured,
    smsConfigured,
  };
}

export function registerAlertSseClient(req: express.Request, res: express.Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseSubscribers.add(res);
  res.write(`event: connected\ndata: ${JSON.stringify(getAlertChannelStatus())}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
      sseSubscribers.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseSubscribers.delete(res);
  });
}
