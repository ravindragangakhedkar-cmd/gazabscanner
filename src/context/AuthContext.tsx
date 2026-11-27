import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { BrokerSessionInfo, UserProfileDoc } from '../../shared/types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfileDoc | null;
  authReady: boolean;
  isVerified: boolean;
  trialHoursLeft: number;
  isTrialExpired: boolean;
  hasScannerAccess: boolean;
  brokerSession: BrokerSessionInfo | null;
  brokerToken: string | null;
  setBrokerSessionState: (token: string | null, session: BrokerSessionInfo | null) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (displayName: string, email: string, password: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationState: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  activateSubscription: (plan: 'monthly' | 'yearly', googlePlayOrderId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Public guest identity used only to satisfy legacy scanner components that
// still expect a signed-in user. No Firebase authentication is performed.
const guestUser = {
  uid: 'public-open-access',
  email: 'guest@gazabpaisa.local',
  emailVerified: true,
  displayName: 'Guest',
} as User;
const disabled = async (): Promise<never> => {
  throw new Error('Sign-in and Firebase authentication have been removed. This site is operating in open-access mode.');
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [brokerToken, setBrokerToken] = useState<string | null>(() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem('gazabscanner_broker_session') : null;
    } catch { return null; }
  });
  const [brokerSession, setBrokerSession] = useState<BrokerSessionInfo | null>(null);
  const setBrokerSessionState = useCallback((token: string | null, session: BrokerSessionInfo | null) => {
    setBrokerToken(token);
    setBrokerSession(session);
    try {
      if (typeof window !== 'undefined') {
        if (token) window.localStorage.setItem('gazabscanner_broker_session', token);
        else window.localStorage.removeItem('gazabscanner_broker_session');
      }
    } catch { /* retain in-memory state for this tab */ }
  }, []);
  useEffect(() => {
    if (!brokerToken) { setBrokerSession(null); return; }
    let cancelled = false;
    const restore = async () => {
      try {
        const response = await fetch('/api/broker/status', {
          headers: { 'x-broker-session': brokerToken },
          cache: 'no-store',
        });
        const data = (await response.json()) as { session?: BrokerSessionInfo | null };
        if (cancelled) return;
        if (response.ok && data.session?.connected) setBrokerSession(data.session);
        else setBrokerSessionState(null, null);
      } catch {
        if (!cancelled) setBrokerSession(null);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [brokerToken, setBrokerSessionState]);
  const signOut = useCallback(async () => {
    setBrokerSessionState(null, null);
  }, [setBrokerSessionState]);

  return (
    <AuthContext.Provider value={{
      user: guestUser,
      profile: null,
      authReady: true,
      isVerified: true,
      trialHoursLeft: 72,
      isTrialExpired: false,
      hasScannerAccess: true,
      brokerSession,
      brokerToken,
      setBrokerSessionState,
      signInWithGoogle: disabled,
      signInWithEmail: disabled,
      signUpWithEmail: disabled,
      resendVerificationEmail: disabled,
      refreshVerificationState: async () => false,
      sendPasswordReset: disabled,
      activateSubscription: disabled,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
