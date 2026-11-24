import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Link2, Lock, Smartphone, Unplug } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { AuthGatePage } from '../components/AuthGatePage';
import type { AppPage } from '../components/TopNav';

export function BrokerConnectPage({ onNavigate }: { onNavigate?: (page: AppPage) => void }) {
  const { user, isVerified, brokerSession, setBrokerSessionState, brokerToken } = useAuth();

  const [provider, setProvider] = useState<'broker' | 'nubra'>('broker');
  const [mobile, setMobile] = useState('');
  const [mpin, setMpin] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user || !isVerified) {
    return (
      <AuthGatePage
        title="Sign in to connect Broker"
        subtitle="Authenticate with Google / Gmail or verified Email before linking your Broker account."
      />
    );
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMessage(null);
    setLoading(true);

    try {
      const cleanedMobile = mobile.replace(/\D/g, '').slice(-10);
      const res = await fetch('/api/broker/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          mobile: cleanedMobile,
          mpin: mpin.trim(),
          provider,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Broker login initiation failed.');

      setChallengeId(json.challengeId);
      setOtpHint(json.otpHint ?? null);
      setStatusMessage(json.message);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to initiate Broker Connect.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/broker/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          challengeId,
          otp: otp.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'OTP verification failed.');

      const { sessionToken, session } = json as {
        sessionToken: string;
        session: {
          connected: boolean;
          maskedMobile: string;
          clientCode: string;
          mode: 'live-api' | 'sandbox-verified';
          connectedAtIso: string;
        };
      };

      // Save non-sensitive broker connection metadata to Firestore (never storing raw MPIN)
      const connPath = `users/${user.uid}/brokerConnections/primary`;
      const connRef = doc(db, 'users', user.uid, 'brokerConnections', 'primary');
      try {
        const existingSnap = await getDoc(connRef);
        if (existingSnap.exists()) {
          await updateDoc(connRef, {
            maskedMobile: session.maskedMobile,
            clientCode: session.clientCode,
            status: 'connected',
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(connRef, {
            userId: user.uid,
            brokerName: 'Broker',
            maskedMobile: session.maskedMobile,
            clientCode: session.clientCode,
            status: 'connected',
            connectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.WRITE, connPath);
      }

      setBrokerSessionState(sessionToken, session);
      setChallengeId(null);
      setOtpHint(null);
      setOtp('');
      setMpin('');
      setStatusMessage('Broker account verified and connected to live scanner feeds.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await fetch('/api/broker/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(brokerToken ? { 'x-broker-session': brokerToken } : {}),
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      const connPath = `users/${user.uid}/brokerConnections/primary`;
      const connRef = doc(db, 'users', user.uid, 'brokerConnections', 'primary');
      try {
        const snap = await getDoc(connRef);
        if (snap.exists()) {
          await updateDoc(connRef, {
            status: 'disconnected',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.UPDATE, connPath);
      }

      setBrokerSessionState(null, null);
      setStatusMessage('Broker session disconnected.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to disconnect broker.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="pb-6 border-b border-slate-200">
        <p className="text-xs font-semibold text-emerald-700">
          Multi Broker Connect · Live Broker Integration
        </p>
        <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
          Broker Connect — Live Broker Feed &amp; MPIN + OTP Login
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-2xl">
          Link your Broker account using your registered 10-digit mobile number and 4-digit MPIN,
          followed by 6-digit OTP verification.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Broker Connect Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex items-center justify-between pb-5 mb-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-950 text-white flex items-center justify-center font-display font-bold text-sm">
                BK
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-950">Broker Connect</h2>
                <p className="text-xs text-slate-500">NSE Equity &amp; F&amp;O Live Market Bridge</p>
              </div>
            </div>
            <span
              className={`text-xs font-mono font-semibold ${
                brokerSession?.connected ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {brokerSession?.connected ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {errorMsg}
            </div>
          )}
          {statusMessage && (
            <div className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {statusMessage}
            </div>
          )}

          {brokerSession?.connected ? (
            <div className="space-y-5">
              <div className="p-5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Broker Session Verified
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
                  <div>
                    <div className="text-slate-500">Registered Mobile</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {brokerSession.maskedMobile}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Client Code</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {brokerSession.clientCode}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigate('scanner1')}
                      className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
                    >
                      Open Scanner 1
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('scanner2')}
                      className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Open Scanner 2
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('scanner3')}
                      className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Open Scanner 3
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('scanner4')}
                      className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Open Super Pivots
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('scanner5')}
                      className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Open Option Calls
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('scanner6')}
                      className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Open Option Puts
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleDisconnect()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                >
                  <Unplug className="w-4 h-4" />
                  Disconnect Broker Account
                </button>
              </div>
            </div>
          ) : !challengeId ? (
            <form onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-5">
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Connection Mode
                </span>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setProvider('broker')}
                    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      provider === 'broker'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Standard Broker Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvider('nubra')}
                    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      provider === 'nubra'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Nubra Live OTP + MPIN
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Registered Mobile Number
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    pattern="[6-9][0-9]{9}"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile number (e.g. XXXXXXXXXX)"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  4-Digit MPIN
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    pattern="\d{4}"
                    value={mpin}
                    onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-mono tracking-[0.35em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Link2 className="w-4 h-4" />
                {loading ? 'Sending OTP...' : 'Login to Broker & Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-5">
              {otpHint && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  Verification OTP code: <span className="font-mono font-bold">{otpHint}</span>{' '}
                  (configure <span className="font-mono">BROKER_API_BASE_URL</span> in server
                  secrets for live SMS gateway dispatch).
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Enter 6-Digit OTP
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    pattern="\d{6}"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit OTP"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-mono tracking-[0.25em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                >
                  {loading ? 'Verifying OTP...' : 'Verify OTP & Connect'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChallengeId(null);
                    setOtp('');
                    setOtpHint(null);
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: Security & Multi-Broker Notes */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="font-display text-base font-bold text-slate-950">
              How Broker Connect Works
            </h3>
            <ol className="mt-3 space-y-3 text-sm text-slate-600">
              <li>
                <span className="font-semibold text-slate-900">1. Mobile &amp; 4-digit MPIN:</span>{' '}
                Your Broker credentials are validated over HTTPS and never stored in browser storage
                or Firestore.
              </li>
              <li>
                <span className="font-semibold text-slate-900">2. Mandatory OTP Verification:</span>{' '}
                Every login session requires a 6-digit OTP confirmation before activating live
                broker feed sync.
              </li>
              <li>
                <span className="font-semibold text-slate-900">3. LTP vs Closing Price:</span>{' '}
                During NSE hours (09:15–15:30 IST), Scanner 1 and Scanner 2 compute indicators on
                live LTP; outside market hours, official last closing price is used.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
