import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { AnalyzedStock } from '../shared/types.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface Scanner1GeminiAnalysis {
  trendBias: 'Bullish' | 'Bearish' | 'Sideways';
  trendInterpretation: string;
  headline: string;
  scalePositionSummary: string;
  marketBiasInsight: string;
  entryExitPlan: string;
  riskAndInvalidation: string;
}

export interface Scanner2GeminiPivotAnalysis {
  trendBias: 'Bullish' | 'Bearish' | 'Sideways';
  trendInterpretation: string;
  headline: string;
  scalePositionSummary: string;
  pivotStrategy: string;
  emaAndVolatilityRead: string;
  keyLevelsToWatch: string;
}

function cleanAndParseJson<T>(rawText: string): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned || '{}') as T;
}

function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      return new Error(parsed.error.message);
    }
  } catch {
    // Plain error message
  }
  return new Error(raw || 'Gemini analysis request failed.');
}

async function generateWithRetry<T>(
  run: (ai: GoogleGenAI, model: string, thinkingLevel: ThinkingLevel) => Promise<string | undefined>,
): Promise<T> {
  const ai = getGeminiClient();
  const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  ];
  let lastErr: unknown;

  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await run(ai, candidate.model, candidate.thinkingLevel);
        return cleanAndParseJson<T>(text ?? '{}');
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient =
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('RESOURCE_EXHAUSTED');
        if (!isTransient) {
          throw formatGeminiError(err);
        }
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }
    }
  }

  throw formatGeminiError(lastErr);
}

export async function generateScanner1Analysis(
  stock: AnalyzedStock,
): Promise<Scanner1GeminiAnalysis> {
  const unit = stock.isIndex ? '' : '₹';
  const unitSuffix = stock.isIndex ? ' pts' : '';
  const p = stock.weeklyPivots;

  const prompt = [
    stock.isIndex
      ? `Analyze Indian benchmark index ${stock.symbol} (${stock.companyName}, Segment: ${stock.sector}).`
      : `Analyze Indian NSE equity ${stock.symbol} (${stock.companyName}, Sector: ${stock.sector}, F&O: ${stock.isFno ? 'Yes' : 'No'}).`,
    `Active ${stock.isIndex ? 'Spot ' : ''}Price (${stock.priceBasis}): ${unit}${stock.currentPrice}${unitSuffix} (Day Change: ${stock.change >= 0 ? '+' : ''}${stock.change}, ${stock.changePercent}%).`,
    `Weekly Pivot Levels (prior week H=${unit}${p.weekHigh}, L=${unit}${p.weekLow}, C=${unit}${p.weekClose}):`,
    `S2 = ${unit}${p.s2} | S1 = ${unit}${p.s1} | PP = ${unit}${p.pp} | R1 = ${unit}${p.r1} | R2 = ${unit}${p.r2}`,
    `Current Position on Weekly Pivot Scale: ${p.priceZoneLabel} (${p.scalePercent}% along the S2 to R2 scale).`,
    `Daily Technical Indicators:`,
    `- Market Bias: Direction=${stock.marketBiasDirection}, Setup=${stock.marketBiasSetup}, Support/Resistance Zone=${unit}${stock.marketBiasZoneLow}–${unit}${stock.marketBiasZoneHigh}${unitSuffix}.`,
    `- Twin Range Filter: Signal=${stock.twinRangeSignal}, Filter Line=${unit}${stock.twinRangeFilter}${unitSuffix}.`,
    `- BBWP: ${stock.bbwp}% (Slope: ${stock.bbwpSlope}, Status: ${stock.bbwpStatus}).`,
    `- Price Volume Oscillator: PVO=${stock.pvo} (${stock.pvoPositive ? 'Positive' : 'Negative'}).`,
    `- Computed Setup: Entry=${unit}${stock.entryPrice}${unitSuffix}, Target=${unit}${stock.targetPrice}${unitSuffix}, Stop Loss=${unit}${stock.stopLoss}${unitSuffix} (R:R ${stock.riskRewardRatio}).`,
    `Classify the overall technical bias strictly as Bullish, Bearish, or Sideways, explain where the current price lies on the Weekly Pivot scale (S2-S1-PP-R1-R2), synthesize Market Bias + Twin Range + BBWP Status + PVO, and give an actionable Entry/Target/Stop-Loss plan with a no-guarantee disclaimer. Do not mention indicator period or parameter numbers.`,
  ].join('\n');

  return generateWithRetry<Scanner1GeminiAnalysis>(async (ai, model, thinkingLevel) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel },
        systemInstruction:
          'You are a senior NSE/BSE quantitative technical analyst for GazabPaisa Awesome Scanner. Provide an explicit Bullish, Bearish, or Sideways trend interpretation, pinpoint exact placement on the Weekly Pivot scale (S2, S1, PP, R1, R2), and reference the provided indicator values without exposing internal indicator parameter settings. Never guarantee profits.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trendBias: {
              type: Type.STRING,
              enum: ['Bullish', 'Bearish', 'Sideways'],
              description: 'Overall technical stance: Bullish, Bearish, or Sideways.',
            },
            trendInterpretation: {
              type: Type.STRING,
              description:
                'Clear explanation of why the stock or index is Bullish, Bearish, or Sideways given Weekly Pivots, Market Bias, Twin Range, BBWP Status, and PVO.',
            },
            headline: { type: Type.STRING, description: '1-sentence setup summary.' },
            scalePositionSummary: {
              type: Type.STRING,
              description:
                'Exact description of where the current stock or index price lies on the Weekly S2-S1-PP-R1-R2 scale.',
            },
            marketBiasInsight: {
              type: Type.STRING,
              description:
                'How price reacts in the Market Bias zone with Twin Range, BBWP Status, and PVO confirmation.',
            },
            entryExitPlan: {
              type: Type.STRING,
              description: 'Actionable Entry, Target, Stop Loss, and pivot level commentary.',
            },
            riskAndInvalidation: {
              type: Type.STRING,
              description: 'Key invalidation trigger and no-guarantee disclaimer.',
            },
          },
          required: [
            'trendBias',
            'trendInterpretation',
            'headline',
            'scalePositionSummary',
            'marketBiasInsight',
            'entryExitPlan',
            'riskAndInvalidation',
          ],
        },
      },
    });
    return response.text;
  });
}

export async function generateScanner2PivotAnalysis(
  stock: AnalyzedStock,
): Promise<Scanner2GeminiPivotAnalysis> {
  const p = stock.weeklyPivots;
  const unit = stock.isIndex ? '' : '₹';

  const prompt = [
    `Provide Weekly Pivot Point & EMA/Volatility analysis for ${stock.isIndex ? 'Index' : 'NSE stock'} ${stock.symbol} (${stock.companyName}).`,
    `Current Active Price (${stock.priceBasis}): ${unit}${stock.currentPrice}.`,
    `Weekly Pivot Levels (from prior week H=${unit}${p.weekHigh}, L=${unit}${p.weekLow}, C=${unit}${p.weekClose}):`,
    `S2 = ${unit}${p.s2} | S1 = ${unit}${p.s1} | PP = ${unit}${p.pp} | R1 = ${unit}${p.r1} | R2 = ${unit}${p.r2}`,
    `Current Scale Position: ${p.priceZoneLabel} (${p.scalePercent}% along S2->R2 scale).`,
    `Daily Trend & Momentum:`,
    `- Daily EMA Trend: ${stock.emaTrend} (Fast ${unit}${stock.ema10} vs Slow ${unit}${stock.ema20}).`,
    `- BBWP = ${stock.bbwp}% (Slope: ${stock.bbwpSlope}, Status: ${stock.bbwpStatus}).`,
    `- Price Volume Oscillator = ${stock.pvo} (${stock.pvoPositive ? 'Positive' : 'Negative'}).`,
    `Classify the bias strictly as Bullish, Bearish, or Sideways, explain clearly where the current price sits on the Weekly Pivot Scale (S2 to R2), immediate support/resistance reactions, and EMA/BBWP/PVO alignment without mentioning internal indicator parameter settings.`,
  ].join('\n');

  return generateWithRetry<Scanner2GeminiPivotAnalysis>(async (ai, model, thinkingLevel) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel },
        systemInstruction:
          'You are a technical market strategist for GazabPaisa Awesome Scanner. Provide an explicit Bullish, Bearish, or Sideways trend interpretation, Weekly Pivot levels (PP, R1, R2, S1, S2), exact price placement on that scale, and EMA/BBWP/PVO momentum without exposing internal indicator parameter settings. Keep each field crisp (1–2 sentences).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trendBias: {
              type: Type.STRING,
              enum: ['Bullish', 'Bearish', 'Sideways'],
            },
            trendInterpretation: {
              type: Type.STRING,
              description: 'Explanation of Bullish, Bearish, or Sideways outlook.',
            },
            headline: { type: Type.STRING },
            scalePositionSummary: {
              type: Type.STRING,
              description: 'Exact description of where current price lies on the S2-S1-PP-R1-R2 scale.',
            },
            pivotStrategy: {
              type: Type.STRING,
              description: 'Upside pivot targets and downside pivot supports.',
            },
            emaAndVolatilityRead: {
              type: Type.STRING,
              description: 'Daily EMA trend, BBWP Status, and PVO interpretation.',
            },
            keyLevelsToWatch: {
              type: Type.STRING,
              description: 'Immediate breakout/breakdown trigger levels and no-guarantee reminder.',
            },
          },
          required: [
            'trendBias',
            'trendInterpretation',
            'headline',
            'scalePositionSummary',
            'pivotStrategy',
            'emaAndVolatilityRead',
            'keyLevelsToWatch',
          ],
        },
      },
    });
    return response.text;
  });
}
