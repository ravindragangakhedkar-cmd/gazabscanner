import React, { useState } from 'react';
import { CheckCircle2, Lock, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OFFICIAL_MERCHANT_EMAIL } from '../../shared/types';

export function AuthGatePage({
  title = 'Sign in to access GazabPaisa Scanners',
  subtitle = 'Authenticate with Google / Gmail or verified Email to unlock Nifty 500 & F&O Scanners, Broker Connect, and your 3-day free trial.',
  onSuccess,
}: {
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}) {
  const {
    user,
    isVerified,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    refreshVerificationState,
    sendPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      if (mode === 'reset') {
        await sendPasswordReset(email);
        setInfoMsg('Password reset instructions have been sent to your email address.');
        return;
      }

      if (mode === 'signup') {
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }
        await signUpWithEmail(name, email, password);
        setInfoMsg(
          'Account created. A verification link was sent to your email — please click it, then return and verify status below.',
        );
        return;
      }

      await signInWithEmail(email, password);
      onSuccess?.();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Authentication error.';
      if (raw.includes('auth/operation-not-allowed')) {
        setErrorMsg(
          'Email/Password sign-in is not enabled yet in Firebase Console (Authentication → Sign-in method → Enable Email/Password). Please use Continue with Google / Gmail above, or enable Email/Password in Firebase Console.',
        );
      } else if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password')) {
        setErrorMsg('Invalid email or password. Please check your credentials and try again.');
      } else {
        setErrorMsg(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerified = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const verified = await refreshVerificationState();
      if (verified) {
        onSuccess?.();
      } else {
        setErrorMsg('Your email is still unverified. Please click the link sent to your inbox.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to refresh verification status.');
    } finally {
      setLoading(false);
    }
  };

  if (user && !isVerified) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="w-11 h-11 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mb-5">
            <Mail className="w-5 h-5" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Verify Your Email Address
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Your account (<span className="font-semibold text-slate-900">{user.email}</span>) is
            signed in, but scanner access requires verified email authentication. Click the
            verification link in your inbox, then refresh below.
          </p>

          {errorMsg && (
            <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {infoMsg}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleCheckVerified()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              I Verified My Email
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setInfoMsg(null);
                setErrorMsg(null);
                void resendVerificationEmail().then(() =>
                  setInfoMsg('Verification email resent. Check your inbox and spam folder.'),
                );
              }}
              className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Resend Verification Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Informational Panel */}
        <div className="lg:col-span-5 bg-slate-950 text-white rounded-xl p-8 flex flex-col justify-between border border-slate-800">
          <div>
            <p className="text-xs font-medium text-emerald-400">
              GazabPaisa Awesome Scanner · Account Security
            </p>
            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              {title}
            </h1>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">{subtitle}</p>

            <ul className="mt-8 space-y-4 text-sm text-slate-200">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>3-day full access trial activated automatically on verified sign-in.</span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Instant Google / Gmail popup login and verified Email authentication.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Protects your Broker session, watchlists, and Gemini AI insights.
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
            <p>
              Monthly (₹99) &amp; Yearly (₹499) packages available via Google Play Store checkout
              linked to <span className="text-slate-200">{OFFICIAL_MERCHANT_EMAIL}</span> after your
              3-day trial.
            </p>
            <p>
              Support &amp; correspondence:{' '}
              <a
                href={`mailto:${OFFICIAL_MERCHANT_EMAIL}`}
                className="text-emerald-400 hover:underline"
              >
                {OFFICIAL_MERCHANT_EMAIL}
              </a>
            </p>
          </div>
        </div>

        {/* Right Auth Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
            className="w-full py-3 px-4 bg-slate-950 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-2H12z"
              />
            </svg>
            Continue with Google / Gmail
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-500">or use verified Email</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Email Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'reset'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reset Password
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-relaxed">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-relaxed">
              {infoMsg}
            </div>
          )}

          <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@gmail.com"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60"
            >
              {loading
                ? 'Authenticating...'
                : mode === 'signin'
                  ? 'Sign In with Email'
                  : mode === 'signup'
                    ? 'Register & Send Verification Email'
                    : 'Send Password Reset Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
