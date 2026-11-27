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
  userId: string;
  nubraAuthToken?: string;
  nubraDeviceId?: string;
  expiresAt: number;
}

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const TOKEN_VERSION = 'v1';

function getSessionSecret(): string {
  const secret = process.env.BROKER_SESSION_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error(
      'Broker session security is not configured. Add a stable BROKER_SESSION_SECRET (at least 32 characters) in Vercel Environment Variables, then redeploy.',
    );
  }
  return secret;
}

function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256')
    .update('gazabscanner:broker-session:v1:')
    .update(getSessionSecret())
    .digest();
}

function sealPayload(payload: object): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function openPayload<T>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const encrypted = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

function hashOtp(otp: string, challengeId: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(`${challengeId}:${otp}`).digest('hex');
}

function isUnexpired(value: { expiresAt?: number } | null): value is { expiresAt: number } {
  return Boolean(value && typeof value.expiresAt === 'number' && Date.now() < value.expiresAt);
}

function publicSession(session: ActiveBrokerSession): BrokerSessionInfo {
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
  // Fail before sending an SMS if the stable encryption key is not configured.
  getEncryptionKey();

  if (!/^[6-9]\\d{9}$/.test(mobile)) {
    throw new Error('Enter a valid 10-digit Indian registered mobile number.');
  }
  if (!/^\\d{4}$/.test(mpin)) {
    throw new Error('MPIN must be exactly 4 digits.');
  }

  const challengeId = crypto.randomUUID();
  const maskedMobile = maskIndianMobile(mobile);
  // Nubra's two-step REST V3 flow is intentionally preserved.
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

  const j1 = (await step1.json()) as { temp_token?: string; token?: string; message?: string };
  const initialTempToken = j1.temp_token || j1.token;
  if (!initialTempToken) {
    throw new Error('Nubra did not return the initial authentication token. Please check the Nubra account/API access.');
  }

  // The second call is the SMS dispatch step. Keep skip_totp=true.
  let step2: Response;
  try {
    step2 = await fetch(`${nubraBase}/sendphoneotp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-temp-token': initialTempToken,
      },
      body: JSON.stringify({ phone: mobile, skip_totp: true }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('Nubra created the login challenge but the OTP dispatch request could not reach Nubra. Please try again.');
  }

  if (!step2.ok) {
    const detail = await step2.text().catch(() => '');
    throw new Error(`Nubra could not dispatch the SMS OTP (HTTP ${step2.status}). ${detail.slice(0, 180)}`.trim());
  }

  const j2 = (await step2.json()) as {
    temp_token?: string;
    token?: string;
    message?: string;
    next?: string;
    attempts_left?: number;
    expiry?: number;
  };
  if ((j2.message || '').trim().toLowerCase() !== 'otp sent' || j2.next !== 'VERIFY_MOBILE') {
    const safeMessage = (j2.message || 'No OTP dispatch confirmation returned').slice(0, 120);
    throw new Error(`Nubra did not confirm SMS OTP dispatch: ${safeMessage} (next: ${j2.next || 'not provided'}).`);
  }

  const latestTempToken = j2.temp_token || j2.token;
  if (!latestTempToken) {
    throw new Error('Nubra confirmed the OTP request but did not return the refreshed temporary token required for verification.');
  }

  // The OTP challenge contains MPIN and Nubra's temporary token, so encrypt it
  // in the opaque challenge ID rather than storing it in a process-local Map.
  const challengeToken = sealPayload<PendingChallenge>({
    challengeId,
    userId,
    mobile,
    mpin,
    maskedMobile,
    otpHash: '',
    demoOtpCode: null,
    mode: 'live-api',
    provider: 'nubra',
    nubraTempToken: latestTempToken,
    nubraDeviceId: deviceId,
    expiresAt: Date.now() + CHALLENGE_LIFETIME_MS,
  });
  return {
    challengeId: challengeToken,
    maskedMobile,
    mode: 'live-api',
    provider: 'nubra',
    message: `Nubra confirmed the SMS OTP request for mobile ending ${mobile.slice(-4)}. Please check your SMS inbox and enter the 6-digit code.`,
  };
}

export async function verifyBrokerOtp(
  userId: string,
  challengeId: string,
  otp: string,
): Promise<{ sessionToken: string; session: BrokerSessionInfo }> {
  if (!/^\\d{6}$/.test(otp)) {
    throw new Error('OTP must be a 6-digit numeric code.');
  }

  const challenge = openPayload<PendingChallenge>(challengeId);
  if (!challenge || challenge.userId !== userId || !isUnexpired(challenge)) {
    throw new Error('OTP session expired or not found. Please initiate Broker login again.');
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
      auth_token?: string;
      next?: string;
      message?: string;
    };
    if (!otpJson.auth_token) {
      throw new Error('Nubra verified the OTP but did not return the MPIN authentication token.');
    }

    const verifyPinRes = await fetch(`${nubraBase}/verifypin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${otpJson.auth_token}`,
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ pin: challenge.mpin }),
      signal: AbortSignal.timeout(12000),
    });
    if (!verifyPinRes.ok) {
      const detail = await verifyPinRes.text().catch(() => '');
      throw new Error(`Nubra rejected the 4-digit MPIN (HTTP ${verifyPinRes.status}). ${detail.slice(0, 160)}`.trim());
    }
    const pinJson = (await verifyPinRes.json()) as {
      session_token?: string;
      message?: string;
    };
    if (!pinJson.session_token) {
      throw new Error('Nubra did not return a final session token after MPIN verification.');
    }

    nubraAuthToken = pinJson.session_token;
    nubraDeviceId = deviceId;
  } else {
    const submittedHash = hashOtp(otp, challenge.challengeId);
    if (
      submittedHash.length !== challenge.otpHash.length ||
      !crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(challenge.otpHash))
    ) {
      throw new Error('Incorrect OTP code. Please check the 6-digit verification code.');
    }
  }

  const clientCode = `BK${challenge.mobile.slice(-6).toUpperCase()}`;
  const session: ActiveBrokerSession = {
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
    expiresAt: Date.now() + SESSION_LIFETIME_MS,
  };
  // AES-GCM makes the bearer token opaque and tamper-evident while keeping
  // session state portable across Vercel serverless instances and cold starts.
  const sessionToken = sealPayload(session);

  return { sessionToken, session: publicSession(session) };
}

export function getBrokerSessionByToken(token: string | undefined): BrokerSessionInfo | null {
  if (!token) return null;
  const session = openPayload<ActiveBrokerSession>(token);
  if (!session || !session.connected || !isUnexpired(session)) return null;
  return publicSession(session);
}

export function getNubraCredentialsForSession(token: string | undefined): {
  authToken?: string;
  deviceId?: string;
} {
  if (!token) {
    return {
      authToken: process.env.NUBRA_AUTH_TOKEN?.trim() || undefined,
      deviceId: process.env.NUBRA_DEVICE_ID?.trim() || 'GP-WEB',
    };
  }
  const session = openPayload<ActiveBrokerSession>(token);
  if (!session || !session.connected || !isUnexpired(session)) return {};
  return {
    authToken: session.nubraAuthToken,
    deviceId: session.nubraDeviceId || 'GP-WEB',
  };
}

export function disconnectBrokerSession(_token: string | undefined, _userId?: string): void {
  // There is deliberately no server-side session store. The browser removes
  // its bearer token on disconnect. To revoke a copied token globally, rotate
  // BROKER_SESSION_SECRET in Vercel; that invalidates all outstanding sessions.
}
