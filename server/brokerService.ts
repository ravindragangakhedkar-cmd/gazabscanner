import crypto from 'node:crypto';
import type { BrokerSessionInfo } from '../shared/types.ts';

interface PendingChallenge {
  challengeId: string;
  userId: string;
  mobile: string;
  mpin: string;
  maskedMobile: string;
  otpHash: string;
  demoOtpCode: string | null;
  mode: 'live-api' | 'sandbox-verified';
  provider: 'nubra' | 'broker';
  nubraTempToken?: string;
  nubraDeviceId?: string;
  expiresAt: number;
}

interface ActiveBrokerSession extends BrokerSessionInfo {
  token: string;
  userId: string;
  nubraAuthToken?: string;
  nubraDeviceId?: string;
}

const pendingChallenges = new Map<string, PendingChallenge>();
const activeSessionsByToken = new Map<string, ActiveBrokerSession>();
const activeTokenByUserId = new Map<string, string>();

const SESSION_SECRET = process.env.BROKER_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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

function hashOtp(otp: string, challengeId: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`${challengeId}:${otp}`).digest('hex');
}

function maskIndianMobile(mobile: string): string {
  return `+91 ••••••${mobile.slice(-4)}`;
}

export async function initiateBrokerLogin(
  userId: string,
  mobile: string,
  mpin: string,
  provider: 'nubra' | 'broker' = 'nubra',
): Promise<{
  challengeId: string;
  maskedMobile: string;
  mode: 'live-api' | 'sandbox-verified';
  provider: 'nubra' | 'broker';
  otpHint?: string;
  message: string;
}> {
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new Error('Enter a valid 10-digit Indian registered mobile number.');
  }
  if (!/^\d{4}$/.test(mpin)) {
    throw new Error('MPIN must be exactly 4 digits.');
  }

  const challengeId = crypto.randomUUID();
  const maskedMobile = maskIndianMobile(mobile);
  // Use Nubra's phone OTP flow only; no external broker API fallback.
  // no locally generated/demo OTP: the code must be delivered by Nubra to the
  // registered mobile number before the user can continue.
  const nubraBase = getSafeNubraBaseUrl();
  const deviceId =
    process.env.NUBRA_DEVICE_ID?.trim() || `GP-${crypto.randomBytes(6).toString('hex')}`;
  let step1: Response;
  try {
    step1 = await fetch(`${nubraBase}/sendphoneotp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ phone: mobile, skip_totp: false }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('Could not reach Nubra to send the OTP. Please try again shortly.');
  }

  if (!step1.ok) {
    const detail = await step1.text().catch(() => '');
    throw new Error(`Nubra could not send the OTP (HTTP ${step1.status}). ${detail.slice(0, 180)}`.trim());
  }

  const j1 = (await step1.json()) as { temp_token?: string; token?: string };
  const tempToken = j1.temp_token || j1.token;
  if (!tempToken) {
    throw new Error('Nubra did not return an OTP challenge token. Please check the Nubra account/API access.');
  }

  pendingChallenges.set(challengeId, {
    challengeId,
    userId,
    mobile,
    mpin,
    maskedMobile,
    otpHash: '',
    demoOtpCode: null,
    mode: 'live-api',
    provider: 'nubra',
    nubraTempToken: tempToken,
    nubraDeviceId: deviceId,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return {
    challengeId,
    maskedMobile,
    mode: 'live-api',
    provider: 'nubra',
    message: `Nubra OTP request sent to registered mobile number ending ${mobile.slice(-4)}.`,
  };
}

export async function verifyBrokerOtp(
  userId: string,
  challengeId: string,
  otp: string,
): Promise<{ sessionToken: string; session: BrokerSessionInfo }> {
  if (!/^\d{6}$/.test(otp)) {
    throw new Error('OTP must be a 6-digit numeric code.');
  }

  const challenge = pendingChallenges.get(challengeId);
  if (!challenge || challenge.userId !== userId) {
    throw new Error('OTP session expired or not found. Please initiate Broker login again.');
  }
  if (Date.now() > challenge.expiresAt) {
    pendingChallenges.delete(challengeId);
    throw new Error('OTP expired. Please request a new OTP.');
  }

  let nubraAuthToken = process.env.NUBRA_AUTH_TOKEN?.trim() || undefined;
  let nubraDeviceId = process.env.NUBRA_DEVICE_ID?.trim() || challenge.nubraDeviceId;

  if (challenge.mode === 'live-api' && challenge.provider === 'nubra' && challenge.nubraTempToken) {
    const nubraBase = getSafeNubraBaseUrl();
    const deviceId = challenge.nubraDeviceId || 'GP-WEB';
    const verifyOtpRes = await fetch(`${nubraBase}/verifyphoneotp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-temp-token': challenge.nubraTempToken,
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ phone: challenge.mobile, otp }),
      signal: AbortSignal.timeout(7000),
    });
    if (!verifyOtpRes.ok) {
      throw new Error('Nubra rejected the OTP. Please verify and try again.');
    }
    const otpJson = (await verifyOtpRes.json()) as {
      temp_token?: string;
      auth_token?: string;
      session_token?: string;
      token?: string;
    };
    const nextToken = otpJson.temp_token || otpJson.auth_token || challenge.nubraTempToken;
    let finalToken = otpJson.session_token || otpJson.auth_token;

    if (!finalToken && nextToken) {
      const verifyPinRes = await fetch(`${nubraBase}/verifypin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-temp-token': nextToken,
          'x-device-id': deviceId,
        },
        body: JSON.stringify({ pin: challenge.mpin }),
        signal: AbortSignal.timeout(7000),
      });
      if (!verifyPinRes.ok) {
        throw new Error('Nubra rejected the 4-digit MPIN. Please check and reconnect.');
      }
      const pinJson = (await verifyPinRes.json()) as {
        session_token?: string;
        auth_token?: string;
        token?: string;
      };
      finalToken = pinJson.session_token || pinJson.auth_token || pinJson.token;
    }

    if (!finalToken) {
      throw new Error('Unable to obtain Nubra session token after verification.');
    }
    nubraAuthToken = finalToken;
    nubraDeviceId = deviceId;
  } else {
    const submittedHash = hashOtp(otp, challengeId);
    if (
      submittedHash.length !== challenge.otpHash.length ||
      !crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(challenge.otpHash))
    ) {
      throw new Error('Incorrect OTP code. Please check the 6-digit verification code.');
    }
  }

  pendingChallenges.delete(challengeId);

  const sessionToken = crypto.randomBytes(24).toString('hex');
  const clientCode = `BK${challenge.mobile.slice(-6).toUpperCase()}`;
  const session: ActiveBrokerSession = {
    token: sessionToken,
    userId,
    connected: true,
    maskedMobile: challenge.maskedMobile,
    clientCode,
    mode: challenge.mode,
    provider: challenge.provider,
    nubraLiveAuth: Boolean(nubraAuthToken),
    connectedAtIso: new Date().toISOString(),
    nubraAuthToken,
    nubraDeviceId,
  };

  activeSessionsByToken.set(sessionToken, session);
  activeTokenByUserId.set(userId, sessionToken);

  return {
    sessionToken,
    session: {
      connected: session.connected,
      maskedMobile: session.maskedMobile,
      clientCode: session.clientCode,
      mode: session.mode,
      provider: session.provider,
      nubraLiveAuth: session.nubraLiveAuth,
      connectedAtIso: session.connectedAtIso,
    },
  };
}

export function getBrokerSessionByToken(token: string | undefined): BrokerSessionInfo | null {
  if (!token) return null;
  const session = activeSessionsByToken.get(token);
  if (!session) return null;
  return {
    connected: session.connected,
    maskedMobile: session.maskedMobile,
    clientCode: session.clientCode,
    mode: session.mode,
    provider: session.provider,
    nubraLiveAuth: session.nubraLiveAuth,
    connectedAtIso: session.connectedAtIso,
  };
}

export function getNubraCredentialsForSession(token: string | undefined): {
  authToken?: string;
  deviceId?: string;
} {
  const envToken = process.env.NUBRA_AUTH_TOKEN?.trim() || undefined;
  const envDevice = process.env.NUBRA_DEVICE_ID?.trim() || 'GP-WEB';
  if (!token) {
    return { authToken: envToken, deviceId: envDevice };
  }
  const session = activeSessionsByToken.get(token);
  return {
    authToken: session?.nubraAuthToken || envToken,
    deviceId: session?.nubraDeviceId || envDevice,
  };
}

export function disconnectBrokerSession(token: string | undefined, userId?: string): void {
  if (token) {
    const session = activeSessionsByToken.get(token);
    if (session) {
      activeTokenByUserId.delete(session.userId);
      activeSessionsByToken.delete(token);
    }
  }
  if (userId) {
    const existingToken = activeTokenByUserId.get(userId);
    if (existingToken) {
      activeSessionsByToken.delete(existingToken);
      activeTokenByUserId.delete(userId);
    }
  }
}
