import React, { useState } from 'react';
import { Building2, CheckCircle2, Mail, MapPin, Phone, Send, User } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { OFFICIAL_MERCHANT_EMAIL } from '../../shared/types';

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmittedRef(null);
    setSubmitting(true);

    const inquiryId = `inq_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const path = `contactInquiries/${inquiryId}`;

    try {
      const cleanName = name.trim().slice(0, 100);
      const cleanEmail = email.trim().slice(0, 254);
      const cleanPhone = phone.trim().slice(0, 20);
      const cleanMessage = message.trim().slice(0, 1500);

      if (cleanName.length < 2) throw new Error('Please enter your full name.');
      if (!cleanEmail.includes('@')) throw new Error('Please enter a valid email address.');
      if (cleanPhone.length < 6) throw new Error('Please enter a valid phone number.');
      if (cleanMessage.length < 5) throw new Error('Please enter your inquiry message.');

      await setDoc(doc(db, 'contactInquiries', inquiryId), {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        message: cleanMessage,
        routedTo: OFFICIAL_MERCHANT_EMAIL,
        createdAt: serverTimestamp(),
      });

      const res = await fetch('/api/contact/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          message: cleanMessage,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { referenceId?: string };

      setSubmittedRef(json.referenceId || inquiryId);
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send inquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  const directMailtoHref = `mailto:${OFFICIAL_MERCHANT_EMAIL}?subject=${encodeURIComponent(
    'GazabPaisa Awesome Scanner — User Inquiry',
  )}&body=${encodeURIComponent(
    name || message
      ? `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\n\nMessage:\n${message}`
      : 'Hello GazabPaisa Support,\n\nI would like to inquire about GazabPaisa Awesome Scanner:',
  )}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="pb-6 border-b border-slate-200">
        <p className="text-xs font-semibold text-emerald-700">Office &amp; Headquarters</p>
        <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
          Contact Us — GazabPaisa Awesome Scanner
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Reach our Pune headquarters for scanner onboarding, Broker support, payments, or email
          correspondence directed to{' '}
          <a
            href={`mailto:${OFFICIAL_MERCHANT_EMAIL}`}
            className="font-semibold text-emerald-700 hover:underline"
          >
            {OFFICIAL_MERCHANT_EMAIL}
          </a>
          .
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Leadership & Headquarters Card */}
        <div className="lg:col-span-5 bg-slate-950 text-white rounded-xl p-7 border border-slate-800 space-y-6">
          <div>
            <p className="text-xs font-semibold text-emerald-400">
              Senior Coordinator &amp; Proprietor
            </p>
            <div className="mt-2 flex items-center gap-3">
              <User className="w-5 h-5 text-slate-300 shrink-0" />
              <h2 className="font-display text-xl font-bold">GazabPaisa Support</h2>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-800 space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
              <div>
                <div className="text-xs text-slate-400">Email &amp; Payment Account</div>
                <a
                  href={`mailto:${OFFICIAL_MERCHANT_EMAIL}`}
                  className="font-medium text-white hover:text-emerald-300 transition-colors break-all"
                >
                  {OFFICIAL_MERCHANT_EMAIL}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
              <div>
                <div className="text-xs text-slate-400">Mobile Number</div>
                <a
                  href="tel:+91XXXXXXXXXX"
                  className="font-mono font-semibold text-white hover:text-emerald-300 transition-colors"
                >
                  +91 - XXXXXXXXXX
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
              <div>
                <div className="text-xs text-slate-400">Office &amp; Headquarters</div>
                <div className="font-medium text-slate-100">
                  India
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
              <div>
                <div className="text-xs text-slate-400">Market Support Hours</div>
                <div className="font-medium text-slate-100">
                  Monday – Friday · 09:00 AM to 06:00 PM IST
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Inquiry Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-slate-950">
            Send Email Correspondence / Inquiry
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            All user email correspondence is directed to{' '}
            <span className="font-semibold text-slate-700">{OFFICIAL_MERCHANT_EMAIL}</span> (Mr.
            GazabPaisa Support&rsquo;s support &amp; billing desk).
          </p>

          {submittedRef && (
            <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-sm text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div>
                  Thank you! Your correspondence ({submittedRef}) has been logged and directed to{' '}
                  <strong>{OFFICIAL_MERCHANT_EMAIL}</strong>.
                </div>
                <a
                  href={directMailtoHref}
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-800 underline hover:text-emerald-950"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Also open in your email client ({OFFICIAL_MERCHANT_EMAIL})
                </a>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mt-4 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {errorMsg}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Your Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Message (Directed to {OFFICIAL_MERCHANT_EMAIL})
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your scanner, Broker Connect, or subscription question..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Sending Message...' : 'Send Inquiry'}
              </button>
              <a
                href={directMailtoHref}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <Mail className="w-4 h-4 text-emerald-700" />
                Email {OFFICIAL_MERCHANT_EMAIL}
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
