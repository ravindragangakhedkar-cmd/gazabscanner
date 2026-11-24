import { useState } from 'react';
import { Check, Clock, CreditCard, Mail, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AppPage } from '../components/TopNav';
import { OFFICIAL_MERCHANT_EMAIL } from '../../shared/types';

export function PricingPage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const { user, isVerified, profile, trialHoursLeft, isTrialExpired, activateSubscription } =
    useAuth();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Google Play UPI (GPay / PhonePe)');
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleOpenCheckout = (plan: 'monthly' | 'yearly') => {
    setSelectedPlan(plan);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!user || !isVerified) {
      onNavigate('auth');
      return;
    }
    setCheckoutOpen(true);
  };

  const handleConfirmGooglePlayPayment = async () => {
    setProcessing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/billing/verify-play-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan,
          paymentMethod,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Google Play Store checkout failed.');

      await activateSubscription(selectedPlan, json.orderId);
      setCheckoutOpen(false);
      setSuccessMsg(
        `Google Play Store order ${json.orderId} confirmed (Linked Payee Account: ${
          json.linkedPayeeAccount || OFFICIAL_MERCHANT_EMAIL
        }). Your ${
          selectedPlan === 'monthly' ? 'Monthly (₹99)' : 'Yearly (₹499)'
        } subscription is now active.`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete payment.');
    } finally {
      setProcessing(false);
    }
  };

  const trialDaysLeft = Math.ceil(trialHoursLeft / 24);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header & 3-Day Trial Banner */}
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs font-semibold text-emerald-700">
          Transparent Pricing · Google Play Store Billing
        </p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950 text-balance">
          Start with a 3-Day Free Trial, then choose Monthly or Yearly.
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Your free trial ends in 3 days from verified registration. Upgrade anytime via Google
          Play Store payment (linked to{' '}
          <span className="font-semibold text-slate-900">{OFFICIAL_MERCHANT_EMAIL}</span>) to retain
          uninterrupted access to Scanner 1, Scanner 2, Broker Connect, and Gemini AI insights.
        </p>
      </div>

      {/* Live User Trial / Subscription Banner */}
      <div className="mt-8 bg-slate-950 text-white rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-sm">
            {!user || !isVerified ? (
              <span>
                <strong className="font-semibold">Trial ends in 3 days</strong> after signing in
                with Google / Gmail or verified Email.
              </span>
            ) : profile?.subscriptionTier === 'monthly' || profile?.subscriptionTier === 'yearly' ? (
              <span>
                Active Subscription:{' '}
                <strong className="font-semibold text-emerald-400">
                  {profile.subscriptionTier === 'monthly'
                    ? 'Monthly Plan (₹99/month)'
                    : 'Yearly Plan (₹499/year)'}
                </strong>
                {profile.googlePlayOrderId ? ` · Order ${profile.googlePlayOrderId}` : ''}
                {` · Linked to ${profile.paymentLinkedAccount || OFFICIAL_MERCHANT_EMAIL}`}
              </span>
            ) : isTrialExpired ? (
              <span className="text-amber-300 font-semibold">
                Your 3-day free trial has ended. Select a plan below to continue.
              </span>
            ) : (
              <span>
                Free Trial Active:{' '}
                <strong className="font-semibold text-emerald-400">
                  {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} ({trialHoursLeft} hrs)
                  remaining
                </strong>{' '}
                (Trial ends in 3 days from signup)
              </span>
            )}
          </div>
        </div>
        {!user && (
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-white hover:bg-slate-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            Start 3-Day Trial
          </button>
        )}
      </div>

      {successMsg && (
        <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          {successMsg}
        </div>
      )}
      {errorMsg && !checkoutOpen && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* Package Cards */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Monthly Plan */}
        <div
          className={`bg-white rounded-xl p-8 border flex flex-col justify-between transition-colors ${
            selectedPlan === 'monthly' ? 'border-slate-950 ring-1 ring-slate-950' : 'border-slate-200'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-950">Monthly Package</h2>
              <span className="text-xs font-medium text-slate-500">Flexible Billing</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">For active monthly swing &amp; F&amp;O traders</p>

            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="font-mono text-4xl font-extrabold text-slate-950 tabular-nums">
                ₹99
              </span>
              <span className="text-sm text-slate-500">/ month</span>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'Full Nifty 500 + F&O Scanner 1 (Market Bias & Twin Range)',
                'Full Scanner 2 (Daily EMA 10/20, BBWP 0–30, PVO)',
                'Unlimited Gemini AI Stock & Weekly Pivot Analysis',
                'Broker Multi-Broker Live Feed Connect',
                'Live LTP & Off-Market Closing Price Calculations',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => handleOpenCheckout('monthly')}
            className="mt-8 w-full py-3 px-4 bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Subscribe Monthly via Google Play Store (₹99)
          </button>
        </div>

        {/* Yearly Plan */}
        <div
          className={`bg-white rounded-xl p-8 border flex flex-col justify-between transition-colors ${
            selectedPlan === 'yearly'
              ? 'border-emerald-700 ring-1 ring-emerald-700'
              : 'border-slate-200'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-950">Yearly Package</h2>
              <span className="text-xs font-semibold text-emerald-700">Best Value · Save 58%</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              For year-round positional &amp; intraday Nifty 500 scanning
            </p>

            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="font-mono text-4xl font-extrabold text-slate-950 tabular-nums">
                ₹499
              </span>
              <span className="text-sm text-slate-500">/ year</span>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'Everything in Monthly Package for 12 full months',
                'Priority NSE & MCX Fast Ticker Polling',
                'Saved Scanner Watchlists synced to your Gmail account',
                'Weekly Pivot (PP, R1, R2, S1, S2) Gemini AI Insights',
                'Effective cost of ₹41.58 / month',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => handleOpenCheckout('yearly')}
            className="mt-8 w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Subscribe Yearly via Google Play Store (₹499)
          </button>
        </div>
      </div>

      {/* Payment Account & Correspondence Footer Note */}
      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-600">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>
            All Google Play Store subscription payments (Monthly ₹99 &amp; Yearly ₹499) are linked
            with merchant account{' '}
            <strong className="text-slate-900">{OFFICIAL_MERCHANT_EMAIL}</strong>.
          </span>
        </div>
        <a
          href={`mailto:${OFFICIAL_MERCHANT_EMAIL}?subject=${encodeURIComponent('GazabPaisa Subscription & Payment Correspondence')}`}
          className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
        >
          <Mail className="w-3.5 h-3.5" />
          Billing Email: {OFFICIAL_MERCHANT_EMAIL}
        </a>
      </div>

      {/* Google Play Store Checkout Modal */}
      {checkoutOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCheckoutOpen(false)}
        >
          <div
            className="max-w-md w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-5 h-5 text-emerald-700" />
                <span className="font-display text-base font-bold text-slate-950">
                  Google Play Store Payment
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-950">
                    GazabPaisa Awesome Scanner ·{' '}
                    {selectedPlan === 'monthly' ? 'Monthly' : 'Yearly'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Subscriber: {user?.email}</div>
                  <div className="text-xs text-emerald-700 font-medium mt-0.5">
                    Linked Payee: {OFFICIAL_MERCHANT_EMAIL}
                  </div>
                </div>
                <div className="font-mono text-lg font-extrabold text-slate-950 shrink-0">
                  {selectedPlan === 'monthly' ? '₹99' : '₹499'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Select Google Play Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option>Google Play UPI (GPay / PhonePe)</option>
                  <option>Google Play Balance</option>
                  <option>Debit / Credit Card via Google Pay</option>
                  <option>NetBanking (HDFC / ICICI / SBI)</option>
                </select>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  Payment is linked to{' '}
                  <strong className="text-slate-700">{OFFICIAL_MERCHANT_EMAIL}</strong> and saved
                  directly to your user profile.
                </span>
              </div>

              <button
                type="button"
                disabled={processing}
                onClick={() => void handleConfirmGooglePlayPayment()}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                {processing
                  ? 'Confirming Play Store Order...'
                  : `Pay ${selectedPlan === 'monthly' ? '₹99' : '₹499'} with Google Play`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
