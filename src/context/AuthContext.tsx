import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { OperationType, auth, db, handleFirestoreError } from '../lib/firebase';
import {
  OFFICIAL_MERCHANT_EMAIL,
  type BrokerSessionInfo,
  type UserProfileDoc,
} from '../../shared/types';

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
const inFlightProfileSync = new Map<string, Promise<void>>();

function extractTimestampMs(val: unknown): number {
  if (!val) return 0;
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'object' && val !== null && 'toMillis' in val) {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'string') return new Date(val).getTime();
  return 0;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [brokerToken, setBrokerToken] = useState<string | null>(null);
  const [brokerSession, setBrokerSession] = useState<BrokerSessionInfo | null>(null);

  const setBrokerSessionState = useCallback(
    (token: string | null, session: BrokerSessionInfo | null) => {
      setBrokerToken(token);
      setBrokerSession(session);
    },
    [],
  );

  const ensureUserProfile = useCallback(async (firebaseUser: User) => {
    if (!firebaseUser.emailVerified) return;
    const existingPromise = inFlightProfileSync.get(firebaseUser.uid);
    if (existingPromise) {
      return existingPromise;
    }

    const syncPromise = (async () => {
      const path = `users/${firebaseUser.uid}`;
      const userRef = doc(db, 'users', firebaseUser.uid);
      try {
        await firebaseUser.getIdToken();
        const snap = await getDocFromServer(userRef);
        if (!snap.exists()) {
          const trialEndsDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          const safeEmail = (firebaseUser.email ?? 'trader@gazabpaisa.in').trim().slice(0, 254);
          const safeName = (
            firebaseUser.displayName?.trim() ||
            safeEmail.split('@')[0] ||
            'Trader'
          ).slice(0, 120);

          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: safeEmail,
            displayName: safeName,
            subscriptionTier: 'trial',
            subscriptionStatus: 'active',
            trialEndsAt: Timestamp.fromDate(trialEndsDate),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    })().finally(() => {
      inFlightProfileSync.delete(firebaseUser.uid);
    });

    inFlightProfileSync.set(firebaseUser.uid, syncPromise);
    return syncPromise;
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser && nextUser.emailVerified) {
        try {
          await ensureUserProfile(nextUser);
        } catch {
          // Handled inside ensureUserProfile
        }
      } else if (!nextUser) {
        setProfile(null);
        setBrokerToken(null);
        setBrokerSession(null);
      }
    });
    return () => unsub();
  }, [ensureUserProfile]);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const userPath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfileDoc);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, userPath);
      },
    );

    return () => {
      unsubProfile();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    if (cred.user.emailVerified) {
      await ensureUserProfile(cred.user);
    }
  }, [ensureUserProfile]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (cred.user.emailVerified) {
        await ensureUserProfile(cred.user);
      }
    },
    [ensureUserProfile],
  );

  const signUpWithEmail = useCallback(
    async (displayName: string, email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
      }
      await sendEmailVerification(cred.user);
    },
    [],
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) throw new Error('No signed-in user.');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshVerificationState = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const refreshed = auth.currentUser;
    setUser({ ...refreshed } as User);
    if (refreshed.emailVerified) {
      await ensureUserProfile(refreshed);
    }
    return refreshed.emailVerified;
  }, [ensureUserProfile]);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const activateSubscription = useCallback(
    async (plan: 'monthly' | 'yearly', googlePlayOrderId: string) => {
      if (!auth.currentUser || !auth.currentUser.emailVerified) {
        throw new Error('Please sign in with a verified email or Gmail account first.');
      }
      const userPath = `users/${auth.currentUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          subscriptionTier: plan,
          subscriptionStatus: 'active',
          planPurchasedAt: serverTimestamp(),
          googlePlayOrderId,
          paymentLinkedAccount: OFFICIAL_MERCHANT_EMAIL,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (brokerToken) {
      void fetch('/api/broker/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-broker-session': brokerToken,
        },
        body: JSON.stringify({ userId: user?.uid }),
      });
    }
    setBrokerToken(null);
    setBrokerSession(null);
    setProfile(null);
    await firebaseSignOut(auth);
  }, [brokerToken, user?.uid]);

  const isVerified = Boolean(user && user.emailVerified);
  const trialEndsMs = extractTimestampMs(profile?.trialEndsAt);
  const trialHoursLeft =
    trialEndsMs > 0 ? Math.max(0, Math.ceil((trialEndsMs - Date.now()) / (1000 * 60 * 60))) : 72;
  const isTrialExpired =
    profile?.subscriptionTier === 'trial' && trialEndsMs > 0 && Date.now() > trialEndsMs;
  const hasScannerAccess =
    isVerified &&
    (profile?.subscriptionTier === 'monthly' ||
      profile?.subscriptionTier === 'yearly' ||
      !isTrialExpired);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authReady,
        isVerified,
        trialHoursLeft,
        isTrialExpired,
        hasScannerAccess,
        brokerSession,
        brokerToken,
        setBrokerSessionState,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resendVerificationEmail,
        refreshVerificationState,
        sendPasswordReset,
        activateSubscription,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
