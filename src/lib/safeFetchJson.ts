import type { AnalyzedStock } from '../../shared/types';

export function buildCompactStockPayload(stock: AnalyzedStock): Omit<AnalyzedStock, 'chartSeries'> & {
  chartSeries: [];
} {
  return {
    ...stock,
    chartSeries: [],
  };
}

function extractReadableError(rawMessage: string, status: number): string {
  try {
    const nested = JSON.parse(rawMessage) as { error?: { message?: string } | string };
    if (typeof nested?.error === 'string') return nested.error;
    if (nested?.error && typeof nested.error === 'object' && nested.error.message) {
      return nested.error.message;
    }
  } catch {
    // Plain text message
  }
  return rawMessage || `Request failed with status ${status}.`;
}

async function requestJsonSafely<T>(url: string, init: RequestInit): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        ...(init.headers ?? {}),
      },
    });

    const rawText = await res.text();
    const trimmed = rawText.trim();

    if (trimmed.startsWith('<')) {
      lastError = new Error(
        `Server returned an HTML response (HTTP ${res.status}) while contacting ${url}. Please try again.`,
      );
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw lastError;
    }

    let parsed: { error?: string } & T;
    try {
      parsed = JSON.parse(rawText) as { error?: string } & T;
    } catch {
      throw new Error(`Invalid JSON received from server (HTTP ${res.status}).`);
    }

    if (!res.ok) {
      const msg = extractReadableError(parsed.error ?? '', res.status);
      if ((res.status === 502 || res.status === 503) && attempt === 0) {
        lastError = new Error(msg);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw new Error(msg);
    }

    return parsed;
  }

  throw lastError ?? new Error('Unable to reach server.');
}

export async function getJsonSafely<T>(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  return requestJsonSafely<T>(url, {
    method: 'GET',
    headers,
    signal,
  });
}

export async function postJsonSafely<T>(url: string, body: unknown): Promise<T> {
  return requestJsonSafely<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
